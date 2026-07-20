import { get, set } from "idb-keyval";

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await get<T>(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export async function saveKey<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value);
  } catch {
    /* ignore */
  }
}
