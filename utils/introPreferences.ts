import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_PREFERENCES_KEY = 'game_intro_preferences';

export interface IntroPreferences {
  echo: boolean;
  ghost: boolean;
  quiz: boolean;
  active: boolean;
  reinforcement: boolean;
}

export async function getIntroPreferences(): Promise<IntroPreferences> {
  try {
    const stored = await AsyncStorage.getItem(INTRO_PREFERENCES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading intro preferences:', e);
  }
  
  return {
    echo: false,
    ghost: false,
    quiz: false,
    active: false,
    reinforcement: false,
  };
}

export async function setIntroPreference(game: keyof IntroPreferences, value: boolean): Promise<void> {
  try {
    const current = await getIntroPreferences();
    current[game] = value;
    await AsyncStorage.setItem(INTRO_PREFERENCES_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving intro preference:', e);
  }
}
