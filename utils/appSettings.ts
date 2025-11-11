import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppSettings = {
  vadThresholdDb: number; // e.g. -45
  vadRequiredMs: number; // e.g. 800
  autoAdvanceFallbackMs: number; // e.g. 7000
  // Si está activo, no se sube a Supabase Storage y se usa sólo copia local
  useLocalOnly: boolean;
  ttsProvider: 'openai' | 'elevenlabs' | 'google' | 'system';
  systemTtsLanguage?: string;
  systemTtsVoiceId?: string;
  // Rate/Pitch por plataforma (para TTS del sistema)
  systemTtsRateWeb?: number; // 0.1–2.0 (normal 1.0)
  systemTtsPitchWeb?: number; // 0.5–2.0 (normal 1.0)
  systemTtsRateIOS?: number; // 0.1–2.0
  systemTtsPitchIOS?: number; // 0.5–2.0
  systemTtsRateAndroid?: number; // 0.1–1.5
  systemTtsPitchAndroid?: number; // 0.5–2.0
};

const SETTINGS_KEY = 'rs.app.settings.v1';

const DEFAULTS: AppSettings = {
  vadThresholdDb: -45,
  vadRequiredMs: 800,
  autoAdvanceFallbackMs: 7000,
  useLocalOnly: false,
  ttsProvider: 'openai',
  systemTtsLanguage: 'es-ES',
  systemTtsVoiceId: undefined,
  systemTtsRateWeb: 1.0,
  systemTtsPitchWeb: 1.0,
  systemTtsRateIOS: 1.0,
  systemTtsPitchIOS: 1.0,
  systemTtsRateAndroid: 1.0,
  systemTtsPitchAndroid: 1.0,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed } as AppSettings;
  } catch {
    return DEFAULTS;
  }
}

export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function getDefaultSettings(): AppSettings {
  return DEFAULTS;
}