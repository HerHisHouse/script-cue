import AsyncStorage from '@react-native-async-storage/async-storage';

type CounterKey = 'api.savings' | 'cache.hits' | 'cache.misses' | 'recording.starts' | 'recording.stops' | 'recording.autoAdvance';

const METRICS_PREFIX = 'rs.metrics.v1.';

export async function inc(key: CounterKey, amount: number = 1): Promise<void> {
  const storageKey = METRICS_PREFIX + key;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const val = raw ? parseInt(raw, 10) || 0 : 0;
    await AsyncStorage.setItem(storageKey, String(val + amount));
  } catch {}
}

export async function get(key: CounterKey): Promise<number> {
  const storageKey = METRICS_PREFIX + key;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function snapshot(): Promise<Record<string, number>> {
  const keys: CounterKey[] = ['api.savings', 'cache.hits', 'cache.misses', 'recording.starts', 'recording.stops', 'recording.autoAdvance'];
  const obj: Record<string, number> = {};
  for (const k of keys) obj[k] = await get(k);
  return obj;
}