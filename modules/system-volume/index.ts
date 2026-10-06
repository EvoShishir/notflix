import { requireOptionalNativeModule } from "expo";

interface SystemVolumeModule {
  getVolume(): number;
  setVolume(fraction: number): void;
}

/**
 * The phone's media volume (Android only). Missing on iOS, where apps cannot
 * set the system volume, and in builds made before this module existed.
 */
const native = requireOptionalNativeModule<SystemVolumeModule>("SystemVolume");

export const systemVolumeAvailable = native != null;

/** Media volume, 0–1. Reports full volume when unavailable. */
export function getSystemVolume(): number {
  try {
    return native?.getVolume() ?? 1;
  } catch {
    return 1;
  }
}

/** Set the media volume, 0–1, without showing the system volume panel. */
export function setSystemVolume(fraction: number) {
  try {
    native?.setVolume(fraction);
  } catch {
    // Volume changes can be refused (e.g. Do Not Disturb); keep playing.
  }
}
