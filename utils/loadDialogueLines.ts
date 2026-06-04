import { supabase } from '@/utils/supabase';
import { DialogueLine } from './dialogueParser';

/**
 * Loads dialogue lines from the database for a given script.
 * This replaces the old extractDialogue logic that relied on scenes.content being an array.
 * Now dialogues are stored in the separate 'lines' table.
 */
export async function loadDialogueLines(scriptId: string): Promise<DialogueLine[]> {
    try {
        // Load lines with scene information
        const { data: lines, error: linesError } = await supabase
            .from('lines')
            .select(`
                *,
                scenes!inner(
                    id,
                    script_id,
                    order_index
                )
            `)
            .eq('scenes.script_id', scriptId)
            .order('order_index', { foreignTable: 'scenes', ascending: true })
            .order('order_index', { ascending: true });

        if (linesError) {
            console.error('Error loading lines:', linesError);
            throw linesError;
        }

        // Load characters
        const { data: characters } = await supabase
            .from('characters')
            .select('*')
            .eq('script_id', scriptId);

        if (!lines) {
            return [];
        }

        // Convert lines to DialogueLine format
        const dialogueLines: DialogueLine[] = lines.map((line: any, index: number) => {
            const character = characters?.find(
                (c) => c.name.toLowerCase().trim() === line.character_name.toLowerCase().trim()
            );

            const isAction = line.character_name.toUpperCase() === 'ACCIÓN';

            // Convert parentheticals to brackets so they show up in UI and get sent to TTS
            const textWithBrackets = line.content.replace(/\(([^)]+)\)/g, '[$1]');

            return {
                id: line.id,
                characterId: character?.id || (isAction ? 'action-card' : `unknown-${line.character_name}`),
                characterName: line.character_name,
                text: textWithBrackets,
                cleanText: textWithBrackets.replace(/[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s+/g, ' ').trim(),
                color: isAction ? '#683a79' : (character?.color || '#6B7280'),
                voiceGender: character?.voice_gender || 'neutral',
                voicePreset: 'natural',
                isUserCharacter: character?.is_user_character || false,
                orderIndex: index,
                sceneId: line.scenes.id,
                isAction,
                voiceDirection: line.voice_direction,
            };
        });

        console.log(`✅ Loaded ${dialogueLines.length} dialogue lines for script ${scriptId}`);
        return dialogueLines;
    } catch (error) {
        console.error('Error in loadDialogueLines:', error);
        throw error;
    }
}
