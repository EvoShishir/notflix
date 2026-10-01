/**
 * The transfer engine behind `lib/downloads.ts`.
 *
 * Three things make this more than a wrapper around `downloadAsync`:
 *
 * 1. **Multi-part.** When the server advertises byte ranges, the file is split
 *    across several parallel connections. Most media hosts throttle per
 *    connection, so this is usually the difference between a usable download
 *    and an unusable one.
 * 2. **Nothing is thrown away.** Every attempt writes to its own segment file.
 *    A dropped connection keeps whatever bytes landed and the next attempt asks
 *    for the range *after* them, so progress only ever moves forwards.
 * 3. **A drop is not a failure.** Network loss retries with capped exponential
 *    backoff, and the attempt counter resets whenever bytes arrive — so a flaky
 *    connection can keep limping along indefinitely without the transfer being
 *    marked failed.
 *
 * The pieces are joined at the end by `assemble()`, which renames the first
 * segment into place and appends the rest in chunks, yielding to the UI thread
 * between each so a large concatenation doesn't freeze the app.
 */

import { File } from "expo-file-system";
import * as Legacy from "expo-file-system/legacy";

/** Below this size, one connection is fine and splitting just adds overhead. */
export const MIN_MULTIPART_BYTES = 16 * 1024 * 1024;
/** Aim for parts of roughly this size... */
const TARGET_PART_BYTES = 16 * 1024 * 1024;
/** ...but never open more connections than this against one host. */
export const MAX_PARTS = 4;

/** Give up only after this many consecutive attempts that moved zero bytes. */
const MAX_BARREN_ATTEMPTS = 12;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

/** Bytes copied per iteration during assembly. */
const ASSEMBLY_CHUNK = 4 * 1024 * 1024;

export interface PartState {
  index: number;
  /** Absolute byte offset of this part's first byte. */
  start: number;
  /** Absolute byte offset of this part's last byte, inclusive. */
  end: number;
  /** Bytes confirmed on disk across `segments`. */
  received: number;
  /** Segment files, in the order they must be concatenated. */
  segments: string[];
  done: boolean;
}

export interface ProbeResult {
  size: number;
  acceptsRanges: boolean;
}

/**
 * Ask the server how big the file is and whether it supports ranges.
 *
 * A `HEAD` is tried first; some media servers don't implement it, so we fall
 * back to a one-byte ranged `GET` and read `Content-Range`, which answers both
 * questions at once.
 */
export async function probe(url: string): Promise<ProbeResult> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      const size = Number(head.headers.get("content-length") ?? 0);
      const ranges = head.headers.get("accept-ranges") ?? "";
      if (size > 0) {
        return { size, acceptsRanges: ranges.toLowerCase().includes("bytes") };
      }
    }
  } catch {
    // Fall through to the ranged GET.
  }

  try {
    const probeGet = await fetch(url, { headers: { Range: "bytes=0-0" } });
    // 206 means the server honoured the range; the total is after the slash.
    const contentRange = probeGet.headers.get("content-range");
    if (probeGet.status === 206 && contentRange) {
      const total = Number(contentRange.split("/")[1]);
      if (total > 0) return { size: total, acceptsRanges: true };
    }
    const size = Number(probeGet.headers.get("content-length") ?? 0);
    return { size, acceptsRanges: false };
  } catch {
    return { size: 0, acceptsRanges: false };
  }
}

/** Split a byte range into parts, or return a single whole-file part. */
export function planParts(size: number, acceptsRanges: boolean): PartState[] {
  const single: PartState[] = [
    { index: 0, start: 0, end: Math.max(size - 1, 0), received: 0, segments: [], done: false },
  ];

  if (!acceptsRanges || size < MIN_MULTIPART_BYTES) return single;

  const count = Math.min(
    Math.max(Math.ceil(size / TARGET_PART_BYTES), 2),
    MAX_PARTS
  );
  const chunk = Math.floor(size / count);

  return Array.from({ length: count }, (_, index) => ({
    index,
    start: index * chunk,
    // The last part absorbs the remainder so the ranges tile the file exactly.
    end: index === count - 1 ? size - 1 : (index + 1) * chunk - 1,
    received: 0,
    segments: [],
    done: false,
  }));
}

/** Recompute `received` from what is actually on disk. Self-heals after a crash. */
export async function reconcileParts(parts: PartState[]): Promise<PartState[]> {
  const next: PartState[] = [];

  for (const part of parts) {
    const segments: string[] = [];
    let received = 0;

    for (const uri of part.segments) {
      const info = await Legacy.getInfoAsync(uri);
      if (!info.exists || !info.size) continue;
      segments.push(uri);
      received += info.size;
    }

    const total = part.end - part.start + 1;
    next.push({
      ...part,
      segments,
      received: Math.min(received, total),
      done: received >= total,
    });
  }

  return next;
}

export interface PartRunnerOptions {
  url: string;
  part: PartState;
  /** Where segment files live. */
  directory: string;
  /** Stable prefix for this download's files. */
  prefix: string;
  /** Whether ranged requests may be used at all. */
  useRanges: boolean;
  /** Called as bytes land, with this part's total received count. */
  onProgress: (received: number) => void;
  /** Persist the part after each segment completes. */
  onCommit: (part: PartState) => void;
  /** Return true to stop between attempts (pause or cancel). */
  shouldStop: () => boolean;
  /** Registers the live task so a pause can reach it. */
  registerTask: (task: Legacy.DownloadResumable | null) => void;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Download one part, retrying until it is complete or the caller stops us.
 *
 * Each attempt requests only the bytes that are still missing, so a retry after
 * a dropped connection resumes rather than restarting.
 */
export async function runPart(options: PartRunnerOptions): Promise<PartState> {
  const {
    url,
    directory,
    prefix,
    useRanges,
    onProgress,
    onCommit,
    shouldStop,
    registerTask,
  } = options;

  let part = { ...options.part };
  const total = part.end - part.start + 1;
  let barrenAttempts = 0;

  while (part.received < total) {
    if (shouldStop()) return part;

    if (barrenAttempts >= MAX_BARREN_ATTEMPTS) {
      throw new Error("Connection lost and could not be re-established");
    }

    const segmentUri = `${directory}${prefix}.p${part.index}.s${part.segments.length}`;
    const from = part.start + part.received;
    const before = part.received;

    // Only send Range when the server said it understands them; an ignored
    // Range header would silently return the whole file into a part slot.
    const headers = useRanges
      ? { Range: `bytes=${from}-${part.end}` }
      : undefined;

    let task: Legacy.DownloadResumable | null = null;

    try {
      task = Legacy.createDownloadResumable(
        url,
        segmentUri,
        headers ? { headers } : {},
        ({ totalBytesWritten }) => onProgress(before + totalBytesWritten)
      );
      registerTask(task);

      const result = await task.downloadAsync();
      registerTask(null);

      // A pause resolves with no result; leave the segment for the next run.
      if (!result) {
        const info = await Legacy.getInfoAsync(segmentUri);
        if (info.exists && info.size) {
          part = {
            ...part,
            segments: [...part.segments, segmentUri],
            received: part.received + info.size,
          };
          onCommit(part);
        }
        return part;
      }

      const info = await Legacy.getInfoAsync(segmentUri);
      const written = info.exists && info.size ? info.size : 0;

      if (written <= 0) {
        await Legacy.deleteAsync(segmentUri, { idempotent: true });
        barrenAttempts += 1;
        await wait(backoffFor(barrenAttempts));
        continue;
      }

      part = {
        ...part,
        segments: [...part.segments, segmentUri],
        received: Math.min(part.received + written, total),
      };
      part.done = part.received >= total;
      onCommit(part);
      barrenAttempts = 0;
    } catch {
      registerTask(null);

      // Keep whatever arrived before the connection died — that is the whole
      // point of segmenting. Only a genuinely empty attempt counts as barren.
      const info = await Legacy.getInfoAsync(segmentUri);
      const written = info.exists && info.size ? info.size : 0;

      if (written > 0) {
        part = {
          ...part,
          segments: [...part.segments, segmentUri],
          received: Math.min(part.received + written, total),
        };
        part.done = part.received >= total;
        onCommit(part);
        barrenAttempts = 0;
      } else {
        await Legacy.deleteAsync(segmentUri, { idempotent: true });
        barrenAttempts += 1;
      }

      if (shouldStop()) return part;
      await wait(backoffFor(barrenAttempts || 1));
    }
  }

  part.done = true;
  return part;
}

function backoffFor(attempt: number) {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

/** Yield to the UI thread so a long copy doesn't freeze the app. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Join every segment into the destination file.
 *
 * The first segment is *moved* into place — a rename, so no bytes are copied —
 * and the rest are appended in chunks. `readBytes`/`writeBytes` are synchronous,
 * hence the yield between chunks: without it, assembling a multi-gigabyte file
 * would block the JS thread for the entire copy.
 */
export async function assemble(
  parts: PartState[],
  destinationUri: string,
  onProgress?: (bytesCopied: number) => void
) {
  const ordered = [...parts]
    .sort((a, b) => a.index - b.index)
    .flatMap((part) => part.segments);

  if (ordered.length === 0) throw new Error("Nothing to assemble");

  const destination = new File(destinationUri);
  if (destination.exists) destination.delete();

  // Rename the first segment rather than copying it.
  new File(ordered[0]).move(destination);

  if (ordered.length === 1) return;

  const handle = destination.open();
  let offset = destination.size ?? 0;
  handle.offset = offset;

  try {
    for (const uri of ordered.slice(1)) {
      const source = new File(uri);
      if (!source.exists) continue;

      const reader = source.open();
      try {
        let remaining = source.size ?? 0;
        while (remaining > 0) {
          const chunk = reader.readBytes(Math.min(ASSEMBLY_CHUNK, remaining));
          if (chunk.length === 0) break;

          handle.offset = offset;
          handle.writeBytes(chunk);

          offset += chunk.length;
          remaining -= chunk.length;
          onProgress?.(offset);
          await yieldToUi();
        }
      } finally {
        reader.close();
      }

      source.delete();
    }
  } finally {
    handle.close();
  }
}

/** Remove any segment files left behind by a cancelled or failed transfer. */
export async function discardSegments(parts: PartState[]) {
  for (const part of parts) {
    for (const uri of part.segments) {
      await Legacy.deleteAsync(uri, { idempotent: true });
    }
  }
}
