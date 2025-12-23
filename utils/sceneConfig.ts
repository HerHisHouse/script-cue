import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Scene configuration for Casting Mode
 * Stores custom timings and action cards for each script
 */

export interface ActionCard {
  id: string;
  text: string; // Action description (e.g., "Me acerco a la mesa")
  duration: number; // Duration in seconds
  afterLineId: string; // ID of the line after which this action appears
}

export interface LineTimingConfig {
  lineId: string;
  timingAdjustment: number; // Seconds to add/subtract from default
}

export interface SceneConfig {
  scriptId: string;
  actionCards: ActionCard[];
  lineTimings: LineTimingConfig[];
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = 'scene_config_';

/**
 * Load scene configuration for a script
 */
export async function loadSceneConfig(scriptId: string): Promise<SceneConfig | null> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${scriptId}`;
    const json = await AsyncStorage.getItem(key);
    if (json) {
      return JSON.parse(json) as SceneConfig;
    }
    return null;
  } catch (error) {
    console.error('Error loading scene config:', error);
    return null;
  }
}

/**
 * Save scene configuration for a script
 */
export async function saveSceneConfig(config: SceneConfig): Promise<void> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${config.scriptId}`;
    config.updatedAt = new Date().toISOString();
    await AsyncStorage.setItem(key, JSON.stringify(config));
    console.log(`[SceneConfig] Saved config for script ${config.scriptId}`);
  } catch (error) {
    console.error('Error saving scene config:', error);
    throw error;
  }
}

/**
 * Get timing adjustment for a specific line
 */
export function getLineTimingAdjustment(config: SceneConfig | null, lineId: string): number {
  if (!config) return 0;
  const lineTiming = config.lineTimings.find(lt => lt.lineId === lineId);
  return lineTiming?.timingAdjustment || 0;
}

/**
 * Get action cards that should appear after a specific line
 */
export function getActionsAfterLine(config: SceneConfig | null, lineId: string): ActionCard[] {
  if (!config) return [];
  return config.actionCards.filter(ac => ac.afterLineId === lineId);
}

/**
 * Calculate the total time for a user line based on word count + adjustment
 */
export function calculateLineDuration(text: string, adjustment: number = 0): number {
  const words = text.split(' ').length;
  // Base: 800ms per word, minimum 5s, maximum 30s
  const baseDuration = Math.min(30, Math.max(5, Math.round(words * 0.8)));
  // Apply adjustment (can be negative or positive)
  const finalDuration = Math.max(1, baseDuration + adjustment);
  return finalDuration;
}

/**
 * Generate a unique ID for a new action card
 */
export function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
