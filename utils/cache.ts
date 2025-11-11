import AsyncStorage from '@react-native-async-storage/async-storage';

export type CacheKind = 'tts' | 'llm';

export type CacheEntry = {
  key: string; // composed key
  kind: CacheKind;
  scriptId: string;
  contentHash: string; // hash of text/params
  value: any; // audioUrl for tts, text for llm
  createdAt: number;
  expiresAt: number;
};

const CACHE_PREFIX = 'rs.cache.v1.';
const INDEX_KEY = `${CACHE_PREFIX}index`; // maps scriptId->keys[]

function makeKey(kind: CacheKind, scriptId: string, contentHash: string): string {
  return `${CACHE_PREFIX}${kind}.${scriptId}.${contentHash}`;
}

function hashText(text: string): string {
  // Simple fast hash (djb2)
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) + text.charCodeAt(i);
  return h.toString(36);
}

export async function put(kind: CacheKind, scriptId: string, textOrParams: string, value: any, ttlMs: number): Promise<void> {
  const now = Date.now();
  const contentHash = hashText(textOrParams);
  const key = makeKey(kind, scriptId, contentHash);
  const entry: CacheEntry = {
    key,
    kind,
    scriptId,
    contentHash,
    value,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  await AsyncStorage.setItem(key, JSON.stringify(entry));
  // update index
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const idx = raw ? JSON.parse(raw) : {};
    const arr: string[] = Array.isArray(idx[scriptId]) ? idx[scriptId] : [];
    if (!arr.includes(key)) arr.push(key);
    idx[scriptId] = arr;
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {}
}

export async function get(kind: CacheKind, scriptId: string, textOrParams: string): Promise<any | null> {
  const contentHash = hashText(textOrParams);
  const key = makeKey(kind, scriptId, contentHash);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export async function searchByScript(scriptId: string): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const idx = raw ? JSON.parse(raw) : {};
    const keys: string[] = Array.isArray(idx[scriptId]) ? idx[scriptId] : [];
    const results: CacheEntry[] = [];
    for (const key of keys) {
      const rawEntry = await AsyncStorage.getItem(key);
      if (!rawEntry) continue;
      const entry: CacheEntry = JSON.parse(rawEntry);
      if (Date.now() > entry.expiresAt) continue;
      results.push(entry);
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchByContent(scriptId: string, query: string): Promise<CacheEntry[]> {
  const entries = await searchByScript(scriptId);
  const q = query.toLowerCase();
  return entries.filter((e) => {
    try {
      const valStr = typeof e.value === 'string' ? e.value : JSON.stringify(e.value);
      return valStr.toLowerCase().includes(q);
    } catch {
      return false;
    }
  });
}

export async function invalidateScript(scriptId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const idx = raw ? JSON.parse(raw) : {};
    const keys: string[] = Array.isArray(idx[scriptId]) ? idx[scriptId] : [];
    for (const key of keys) {
      await AsyncStorage.removeItem(key);
    }
    delete idx[scriptId];
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {}
}

export async function purgeExpired(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const idx = raw ? JSON.parse(raw) : {};
    for (const scriptId of Object.keys(idx)) {
      const keys: string[] = Array.isArray(idx[scriptId]) ? idx[scriptId] : [];
      const keep: string[] = [];
      for (const key of keys) {
        const rawEntry = await AsyncStorage.getItem(key);
        if (!rawEntry) continue;
        const entry: CacheEntry = JSON.parse(rawEntry);
        if (Date.now() > entry.expiresAt) {
          await AsyncStorage.removeItem(key);
        } else {
          keep.push(key);
        }
      }
      idx[scriptId] = keep;
    }
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {}
}