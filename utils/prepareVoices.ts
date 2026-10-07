import { supabase } from '@/utils/supabase';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import { normalizeVoiceProvider } from '@/utils/voiceDefaults';
import { DialogueLine } from '@/utils/dialogueParser';

/**
 * Réplicas de la IA (ni del usuario ni acciones) cuyas voces hay que preparar entre `lines`.
 */
export function aiLinesToPrepare(lines: DialogueLine[], lineIds: Set<string>): DialogueLine[] {
  return lines.filter((line) => lineIds.has(line.id) && !line.isUserCharacter && !line.isAction);
}

/**
 * Prepara (genera si no están en caché) las voces de las réplicas de la IA de `lineIds`.
 * Carga las líneas igual que los modos de práctica (loadDialogueLines: solo escenas
 * incluidas, texto con acotaciones), así la clave de caché coincide con la que buscarán.
 * Lo usa "Editar guion" al guardar, para que Memoria y Selftape no encuentren huecos.
 */
export async function prepareVoicesForLines(
  scriptId: string,
  lineIds: string[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ prepared: number; failed: number }> {
  if (lineIds.length === 0) return { prepared: 0, failed: 0 };
  const [lines, { data: characters }] = await Promise.all([
    loadDialogueLines(scriptId),
    supabase.from('characters').select('name, voice_provider, voice_id').eq('script_id', scriptId),
  ]);
  const targets = aiLinesToPrepare(lines, new Set(lineIds));
  let prepared = 0;
  let failed = 0;
  onProgress?.(0, targets.length);
  for (let i = 0; i < targets.length; i++) {
    const line = targets[i];
    const character = characters?.find((c) => c.name.toLowerCase().trim() === line.characterName.toLowerCase().trim());
    const provider = normalizeVoiceProvider(character?.voice_provider);
    if (provider !== 'system') {
      try {
        const uri = await generateAndCacheAudio(
          scriptId, line.id, line.characterName, line.text,
          { provider, voiceId: character?.voice_id || undefined },
          userId, line.voiceDirection,
        );
        if (uri) prepared++; else failed++;
      } catch {
        failed++;
      }
    }
    onProgress?.(i + 1, targets.length);
  }
  return { prepared, failed };
}
