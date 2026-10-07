import { supabase } from '@/utils/supabase';
import { DialogueLine } from './dialogueParser';
import { sortLinesInScriptOrder } from './lineOrdering';

/**
 * Loads dialogue lines from the database for a given script.
 * This replaces the old extractDialogue logic that relied on scenes.content being an array.
 * Now dialogues are stored in the separate 'lines' table.
 */
export async function loadDialogueLines(
    scriptId: string,
    options: { includeExcludedScenes?: boolean } = {},
): Promise<DialogueLine[]> {
    try {
        // Load lines with scene information
        // Ojo: `.order(..., { foreignTable: 'scenes' })` solo ordena la tabla anidada, no las
        // filas de `lines`, así que el orden entre escenas se resuelve en sortLinesInScriptOrder.
        // Solo las escenas que el usuario incluyó en "Revisar guion" (scenes.included);
        // la propia pantalla de revisión pide todas para poder elegir.
        let linesQuery = supabase
            .from('lines')
            .select(`
                *,
                scenes!inner(
                    id,
                    script_id,
                    order_index,
                    scene_number,
                    heading,
                    included
                )
            `)
            .eq('scenes.script_id', scriptId);
        if (!options.includeExcludedScenes) linesQuery = linesQuery.eq('scenes.included', true);
        const { data: rawLines, error: linesError } = await linesQuery
            .order('order_index', { ascending: true });
        const lines = rawLines ? sortLinesInScriptOrder(rawLines) : rawLines;

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
                sceneIncluded: line.scenes.included !== false,
                sceneNumber: line.scenes.scene_number,
                sceneHeading: line.scenes.heading || null,
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
