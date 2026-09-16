import { get, set } from "idb-keyval";

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await get<T>(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** Persist to IndexedDB. Throws if the write fails so callers can keep dirty / show error. */
export async function saveKey<T>(key: string, value: T): Promise<void> {
  await set(key, value);
}

/** Best-effort write for non-critical keys (e.g. last-sync timestamps). */
export async function saveKeySoft<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value);
  } catch {
    /* ignore */
  }
}
