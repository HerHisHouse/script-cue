import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface MemoryScore {
  gameId: string; // 'active', 'ghost', 'echo', 'call-repeat', 'quiz', 'reinforcement'
  scriptId: string;
  score: number;
  maxScore: number;
  timestamp: number;
}

export interface FailedLine {
  scriptId: string;
  lineId: string | null; // Puede ser null para preguntas generales de quiz
  reason: 'timeout' | 'revealed' | 'wrong_word' | 'poor_match' | 'ghost_error' | 'echo_error' | 'quiz_error';
  timestamp: number;
  count: number;
  id?: string; // ID de la DB si viene de Supabase
  questionText?: string; // Para preguntas de quiz de comprensión
}

export const SCORES_KEY = 'memory_scores';
export const FAILED_LINES_KEY = 'memory_failed_lines';
export const STREAK_KEY = 'memory_streak';

// --- Scores ---

export async function saveScore(score: MemoryScore) {
  try {
    const existing = await getScores(score.scriptId);
    existing.push(score);
    // Keep only last 100 scores per script to save space
    if (existing.length > 100) existing.shift();
    
    // Load all scores map
    const allScoresStr = await AsyncStorage.getItem(SCORES_KEY);
    const allScores = allScoresStr ? JSON.parse(allScoresStr) : {};
    
    allScores[score.scriptId] = existing;
    await AsyncStorage.setItem(SCORES_KEY, JSON.stringify(allScores));
    
    await updateStreak();
  } catch (e) {
    console.error('Error saving score:', e);
  }
}

export async function getScores(scriptId: string): Promise<MemoryScore[]> {
  try {
    const str = await AsyncStorage.getItem(SCORES_KEY);
    if (!str) return [];
    const all = JSON.parse(str);
    return all[scriptId] || [];
  } catch {
    return [];
  }
}

export async function getTotalScore(scriptId: string): Promise<number> {
  const scores = await getScores(scriptId);
  return scores.reduce((acc, s) => acc + s.score, 0);
}

// --- Failed Lines (for Reinforcement) ---

export async function addFailedLine(scriptId: string, lineId: string | null, reason: FailedLine['reason']) {
  // Guardar localmente para modos tradicionales
  try {
    const str = await AsyncStorage.getItem(FAILED_LINES_KEY);
    const all = str ? JSON.parse(str) : {};
    const scriptFailures: FailedLine[] = all[scriptId] || [];
    
    if (lineId) {
      const existingIndex = scriptFailures.findIndex(f => f.lineId === lineId);
      if (existingIndex >= 0) {
        scriptFailures[existingIndex].count++;
        scriptFailures[existingIndex].timestamp = Date.now();
        scriptFailures[existingIndex].reason = reason;
      } else {
        scriptFailures.push({
          scriptId,
          lineId,
          reason,
          timestamp: Date.now(),
          count: 1
        });
      }
      all[scriptId] = scriptFailures;
      await AsyncStorage.setItem(FAILED_LINES_KEY, JSON.stringify(all));
    }
  } catch (e) {
    console.error('Error adding local failed line:', e);
  }
}

export async function getFailedLines(scriptId: string, userId?: string): Promise<FailedLine[]> {
  const allFailures: FailedLine[] = [];

  // 1. Cargar locales (AsyncStorage)
  try {
    const str = await AsyncStorage.getItem(FAILED_LINES_KEY);
    if (str) {
      const all = JSON.parse(str);
      const locals = all[scriptId] || [];
      allFailures.push(...locals);
    }
  } catch (e) {
    console.error('Error loading local failures:', e);
  }

  // 2. Cargar de Supabase (memory_errors)
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('memory_errors')
        .select('*')
        .eq('script_id', scriptId)
        .eq('user_id', userId);

      if (data && !error) {
        const dbFailures: FailedLine[] = data.map(item => ({
          id: item.id,
          scriptId: item.script_id,
          lineId: item.line_id || null,
          reason: item.game_type as FailedLine['reason'],
          timestamp: new Date(item.failed_at).getTime(),
          count: 1,
          questionText: item.question_text
        }));
        allFailures.push(...dbFailures);
      }
    } catch (e) {
      console.error('Error loading DB failures:', e);
    }
  }

  // Eliminar duplicados de lineId si existen (priorizar DB o local)
  // Por ahora los dejamos todos.
  return allFailures;
}

export async function clearFailedLine(scriptId: string, lineId: string | null, dbId?: string) {
    // 1. Limpiar local
    if (lineId) {
        try {
            const str = await AsyncStorage.getItem(FAILED_LINES_KEY);
            if (str) {
                const all = JSON.parse(str);
                const scriptFailures: FailedLine[] = all[scriptId] || [];
                const newFailures = scriptFailures.filter(f => f.lineId !== lineId);
                all[scriptId] = newFailures;
                await AsyncStorage.setItem(FAILED_LINES_KEY, JSON.stringify(all));
            }
        } catch (e) {
            console.error('Error clearing local failure:', e);
        }
    }

    // 2. Limpiar Supabase
    if (dbId) {
        try {
            await supabase
                .from('memory_errors')
                .delete()
                .eq('id', dbId);
        } catch (e) {
            console.error('Error clearing DB failure:', e);
        }
    }
}

// --- Streaks ---

async function updateStreak() {
  try {
    const str = await AsyncStorage.getItem(STREAK_KEY);
    const data = str ? JSON.parse(str) : { current: 0, lastDate: null };
    
    const now = new Date();
    const today = now.toDateString();
    
    if (data.lastDate !== today) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (data.lastDate === yesterday.toDateString()) {
            data.current++;
        } else {
            // Reset if missed a day (unless it's the first time)
            if (data.lastDate) data.current = 1;
            else data.current = 1;
        }
        data.lastDate = today;
        await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
    }
  } catch {}
}

export async function getStreak(): Promise<number> {
    try {
        const str = await AsyncStorage.getItem(STREAK_KEY);
        return str ? JSON.parse(str).current : 0;
    } catch {
        return 0;
    }
}
