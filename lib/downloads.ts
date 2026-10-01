/**
 * Offline downloads.
 *
 * Video files go to the app's document directory (safe from the system's cache
 * eviction); the metadata that describes them lives in AsyncStorage. Like
 * `watchProgress`, this is an external store rather than a context — progress
 * callbacks fire many times a second during a download, and a context would
 * re-render every screen subscribed to it on each tick.
 *
 * The source URLs are direct progressive files (mp4/mkv), which is what makes a
 * plain file download viable. A manifest-based stream (HLS/DASH) could not be
 * saved this way, since it is a playlist of segments rather than one file.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useSyncExternalStore } from "react";
import {
  assemble,
  discardSegments,
  MAX_PARTS,
  PartState,
  planParts,
  probe,
  reconcileParts,
  runPart,
} from "./downloadEngine";

const STORAGE_KEY = "notflix.downloads.v1";
const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;

/**
 * One title at a time.
 *
 * Each active title already opens up to `MAX_PARTS` parallel connections, so
 * running several at once would multiply sockets against the same host without
 * making any single download finish sooner.
 */
const MAX_CONCURRENT = 1;

export type DownloadState =
  | "queued"
  | "downloading"
  /** All parts fetched; joining them into the final file. */
  | "assembling"
  | "paused"
  | "completed"
  | "failed";

export interface DownloadRecord {
  /** Video or episode id — the same id used by the player and watch progress. */
  id: string;
  /** Parent post id for episodes; null for movies. Drives the grouping. */
  showId: string | null;
  showTitle: string | null;
  title: string;
  poster: string;
  backdrop: string;
  seasonNumber?: number;
  episodeNumber?: number;
  sourceUrl: string;
  fileUri: string;
  state: DownloadState;
  bytesWritten: number;
  bytesTotal: number;
  /** Runtime in minutes, carried over so the library can show it offline. */
  durationMinutes: number;
  createdAt: number;
  error?: string;
  /** Byte ranges this transfer is split across. */
  parts?: PartState[];
  /** Whether the server honours `Range` requests. */
  supportsRanges?: boolean;
}

/** What a caller must supply to start a download. */
export interface DownloadRequest {
  id: string;
  title: string;
  sourceUrl: string;
  poster: string;
  backdrop: string;
  durationMinutes: number;
  showId?: string | null;
  showTitle?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
}

type Records = Record<string, DownloadRecord>;

let records: Records = {};
let hydrated = false;
const listeners = new Set<() => void>();

/** Live transfer handles, keyed by record id. Never persisted. */
const tasks = new Map<string, FileSystem.DownloadResumable>();
/** Ids waiting for a slot. */
const queue: string[] = [];

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records)).catch(() => {});
  }, 500);
}

function update(id: string, patch: Partial<DownloadRecord>) {
  const current = records[id];
  if (!current) return;
  records = { ...records, [id]: { ...current, ...patch } };
  emit();
  scheduleFlush();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Best-effort file extension from the source URL; videos default to .mp4. */
function extensionFor(url: string) {
  const withoutQuery = url.split("?")[0].split("#")[0];
  const match = /\.([a-z0-9]{2,5})$/i.exec(withoutQuery);
  return match ? `.${match[1].toLowerCase()}` : ".mp4";
}

/** Ids contain no path separators, but be defensive about what we write. */
function safeName(id: string, url: string) {
  return `${id.replace(/[^a-z0-9._-]/gi, "_")}${extensionFor(url)}`;
}

async function ensureDirectory() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Hydration                                 */
/* -------------------------------------------------------------------------- */

/**
 * Load persisted downloads at app start.
 *
 * Any record left mid-transfer is marked `paused` rather than resumed
 * automatically: the process died, so there is no live task, and silently
 * restarting a multi-gigabyte transfer on launch is not a decision to make on
 * the user's behalf. Completed records whose file has since vanished (an OS
 * clean-up, a restore onto a new device) are dropped so the library never lists
 * something that can't play.
 */
export async function hydrateDownloads() {
  if (hydrated) return;
  hydrated = true;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const stored = JSON.parse(raw) as Records;
    const verified: Records = {};

    for (const [id, record] of Object.entries(stored)) {
      if (record.state === "completed") {
        const info = await FileSystem.getInfoAsync(record.fileUri);
        if (!info.exists) continue;
        verified[id] = record;
        continue;
      }

      // Re-count the segments actually on disk. A transfer killed mid-write may
      // have bytes that were never recorded, and this reclaims them instead of
      // re-downloading a range we already hold.
      const parts = record.parts
        ? await reconcileParts(record.parts)
        : undefined;

      const received = parts
        ? parts.reduce((sum, part) => sum + part.received, 0)
        : record.bytesWritten;

      verified[id] = {
        ...record,
        state: "paused",
        parts,
        bytesWritten: received,
      };
    }

    records = verified;
    emit();
    scheduleFlush();
  } catch {
    records = {};
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Queue                                    */
/* -------------------------------------------------------------------------- */

/** Ids the user has asked to stop; checked between retry attempts. */
const stopping = new Set<string>();
/** Live part tasks per record, so a pause can reach every open connection. */
const partTasks = new Map<string, Map<number, FileSystem.DownloadResumable>>();
/** In-flight byte counts per part, merged with committed bytes for progress. */
const liveBytes = new Map<string, Map<number, number>>();

function activeCount() {
  return Object.values(records).filter(
    (r) => r.state === "downloading" || r.state === "assembling"
  ).length;
}

function pumpQueue() {
  while (activeCount() < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift();
    if (!id) return;
    const record = records[id];
    if (!record || record.state === "completed") continue;
    void runTransfer(id);
  }
}

/** Committed bytes plus whatever the open connections have pulled since. */
function publishProgress(id: string, parts: PartState[]) {
  const live = liveBytes.get(id);
  let written = 0;
  for (const part of parts) {
    written += Math.max(part.received, live?.get(part.index) ?? 0);
  }
  update(id, { bytesWritten: written });
}

async function runTransfer(id: string) {
  const record = records[id];
  if (!record) return;

  stopping.delete(id);
  partTasks.set(id, new Map());
  liveBytes.set(id, new Map());

  update(id, { state: "downloading", error: undefined });

  try {
    await ensureDirectory();

    // Plan on the first run; afterwards reconcile against what is on disk, so a
    // resume after a crash counts bytes that were written but never recorded.
    let parts = record.parts;
    let supportsRanges = record.supportsRanges ?? false;
    let total = record.bytesTotal;

    if (!parts || parts.length === 0) {
      const probed = await probe(record.sourceUrl);
      total = probed.size;
      supportsRanges = probed.acceptsRanges;
      parts = planParts(probed.size, probed.acceptsRanges);
      update(id, { parts, supportsRanges, bytesTotal: total });
    } else {
      parts = await reconcileParts(parts);
      update(id, { parts });
    }

    const planned = parts;
    const shouldStop = () =>
      stopping.has(id) || records[id]?.state === "paused";

    // Every part runs concurrently; each retries on its own.
    const results = await Promise.all(
      planned.map((part) =>
        runPart({
          url: record.sourceUrl,
          part,
          directory: DOWNLOAD_DIR,
          prefix: safeName(id, record.sourceUrl),
          // Never send Range headers unless the probe confirmed support and we
          // actually split the file — an ignored Range would hand one part slot
          // the entire file.
          useRanges: supportsRanges && planned.length > 1,
          onProgress: (received) => {
            liveBytes.get(id)?.set(part.index, received);
            publishProgress(id, records[id]?.parts ?? planned);
          },
          onCommit: (updated) => {
            const current = records[id]?.parts ?? planned;
            const merged = current.map((p) =>
              p.index === updated.index ? updated : p
            );
            update(id, { parts: merged });
            publishProgress(id, merged);
          },
          shouldStop,
          registerTask: (task) => {
            const map = partTasks.get(id);
            if (!map) return;
            if (task) map.set(part.index, task);
            else map.delete(part.index);
          },
        })
      )
    );

    if (shouldStop() || !results.every((part) => part.done)) {
      update(id, { state: "paused", parts: results });
      return;
    }

    // Join the segments. This can take a while for a large file, so it gets its
    // own state rather than silently sitting at 100%.
    update(id, { state: "assembling", parts: results });
    await assemble(results, record.fileUri);

    const info = await FileSystem.getInfoAsync(record.fileUri);
    const finalSize = info.exists && info.size ? info.size : total;
    update(id, {
      state: "completed",
      parts: undefined,
      bytesWritten: finalSize,
      bytesTotal: finalSize,
    });
  } catch (error) {
    update(id, {
      state: "failed",
      error: error instanceof Error ? error.message : "Download failed",
    });
  } finally {
    partTasks.delete(id);
    liveBytes.delete(id);
    stopping.delete(id);
    pumpQueue();
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Actions                                  */
/* -------------------------------------------------------------------------- */

/** Queue a title for download. No-ops if it is already downloaded or running. */
export function startDownload(request: DownloadRequest) {
  const existing = records[request.id];
  if (
    existing &&
    (existing.state === "completed" ||
      existing.state === "downloading" ||
      existing.state === "assembling" ||
      existing.state === "queued")
  ) {
    return;
  }

  if (!request.sourceUrl) return;

  const record: DownloadRecord = {
    id: request.id,
    showId: request.showId ?? null,
    showTitle: request.showTitle ?? null,
    title: request.title,
    poster: request.poster,
    backdrop: request.backdrop,
    seasonNumber: request.seasonNumber,
    episodeNumber: request.episodeNumber,
    sourceUrl: request.sourceUrl,
    fileUri: `${DOWNLOAD_DIR}${safeName(request.id, request.sourceUrl)}`,
    state: "queued",
    bytesWritten: existing?.bytesWritten ?? 0,
    bytesTotal: existing?.bytesTotal ?? 0,
    durationMinutes: request.durationMinutes,
    createdAt: existing?.createdAt ?? Date.now(),
    // Keep any partial work so a retry continues rather than restarts.
    parts: existing?.parts,
    supportsRanges: existing?.supportsRanges,
  };

  records = { ...records, [request.id]: record };
  emit();
  scheduleFlush();

  queue.push(request.id);
  pumpQueue();
}

/**
 * Pause a transfer.
 *
 * Marks the record first so the retry loops see it between attempts, then stops
 * every open connection. Segment files stay on disk; resuming asks only for the
 * bytes that are still missing.
 */
export async function pauseDownload(id: string) {
  if (!records[id]) return;

  stopping.add(id);
  update(id, { state: "paused" });

  const map = partTasks.get(id);
  if (map) {
    await Promise.all(
      [...map.values()].map((task) => task.pauseAsync().catch(() => {}))
    );
  }
  pumpQueue();
}

export function resumeDownload(id: string) {
  const record = records[id];
  if (
    !record ||
    record.state === "downloading" ||
    record.state === "assembling"
  ) {
    return;
  }
  stopping.delete(id);
  update(id, { state: "queued", error: undefined });
  queue.push(id);
  pumpQueue();
}

/** Cancel an in-flight transfer and delete everything it wrote. */
export async function cancelDownload(id: string) {
  stopping.add(id);

  const map = partTasks.get(id);
  if (map) {
    await Promise.all(
      [...map.values()].map((task) => task.cancelAsync().catch(() => {}))
    );
    partTasks.delete(id);
  }

  const record = records[id];
  if (record?.parts) await discardSegments(record.parts);

  await removeDownload(id);
  pumpQueue();
}

/** Delete a downloaded file and forget the record. */
export async function removeDownload(id: string) {
  const record = records[id];
  if (!record) return;

  const index = queue.indexOf(id);
  if (index >= 0) queue.splice(index, 1);

  if (record.parts) await discardSegments(record.parts);

  try {
    await FileSystem.deleteAsync(record.fileUri, { idempotent: true });
  } catch {
    // Nothing on disk to remove; drop the record regardless so the library
    // never shows an entry the user cannot delete.
  }

  const { [id]: _removed, ...rest } = records;
  records = rest;
  emit();
  scheduleFlush();
}

/** Delete every downloaded episode of a show. */
export async function removeShowDownloads(showId: string) {
  const ids = Object.values(records)
    .filter((record) => record.showId === showId)
    .map((record) => record.id);
  for (const id of ids) {
    await cancelDownload(id);
  }
}

/** How many parallel connections this transfer is using. */
export function partCountFor(record: DownloadRecord | undefined) {
  return record?.parts?.length ?? 1;
}

export { MAX_PARTS };

/* -------------------------------------------------------------------------- */
/*                                   Reading                                  */
/* -------------------------------------------------------------------------- */

export function getDownload(id: string): DownloadRecord | undefined {
  return records[id];
}

/** Local file URI when a title is fully downloaded, otherwise null. */
export function getPlayableUri(id: string): string | null {
  const record = records[id];
  return record?.state === "completed" ? record.fileUri : null;
}

export function downloadFraction(record: DownloadRecord | undefined) {
  if (!record) return 0;
  if (record.state === "completed" || record.state === "assembling") return 1;
  if (record.bytesTotal <= 0) return 0;
  return Math.min(record.bytesWritten / record.bytesTotal, 1);
}

export function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * One entry per movie, and one per show regardless of episode count — the
 * shape the Downloads tab renders.
 */
export interface DownloadGroup {
  key: string;
  kind: "movie" | "show";
  title: string;
  poster: string;
  items: DownloadRecord[];
  /** Bytes on disk across the group's completed items. */
  bytes: number;
  createdAt: number;
}

export function groupDownloads(all: Records): DownloadGroup[] {
  const groups = new Map<string, DownloadGroup>();

  for (const record of Object.values(all)) {
    const isShow = !!record.showId;
    const key = isShow ? `show:${record.showId}` : `movie:${record.id}`;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(record);
      existing.bytes += record.bytesWritten;
      existing.createdAt = Math.max(existing.createdAt, record.createdAt);
      continue;
    }

    groups.set(key, {
      key,
      kind: isShow ? "show" : "movie",
      title: isShow ? (record.showTitle ?? record.title) : record.title,
      poster: record.poster,
      items: [record],
      bytes: record.bytesWritten,
      createdAt: record.createdAt,
    });
  }

  for (const group of groups.values()) {
    group.items.sort(
      (a, b) =>
        (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
        (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
    );
  }

  return [...groups.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/* --------------------------------- hooks ---------------------------------- */

/** Subscribe a component to one title's download state. */
export function useDownload(id: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (id ? records[id] : undefined),
    () => undefined
  );
}

/** Subscribe to every download — for the library screens. */
export function useDownloads() {
  return useSyncExternalStore(
    subscribe,
    () => records,
    () => records
  );
}
