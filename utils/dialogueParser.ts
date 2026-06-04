import { Scene, Character, DialogueContent } from '@/types/database';

export interface DialogueLine {
  id: string;
  characterId: string;
  characterName: string;
  text: string;
  cleanText: string;
  color: string;
  voiceGender: string;
  voicePreset: string;
  isUserCharacter: boolean;
  orderIndex: number;
  sceneId: string;
  // New fields for Casting Mode timing
  isAction?: boolean; // If true, this is an action card, not dialogue
  customTimingAdjustment?: number; // Seconds to add/subtract from calculated time
  voiceDirection?: any; // Phase 2: User-selected or imported voice direction
}

export function extractDialogue(
  scenes: Scene[],
  characters: Character[]
): DialogueLine[] {
  const dialogueLines: DialogueLine[] = [];
  let orderIndex = 0;

  const sortedScenes = [...scenes].sort((a, b) => a.order_index - b.order_index);

  // Normalización ligera para nombres de personaje
  const normalizeName = (name: string) =>
    (name || '')
      .replace(/\([^)]*\)/g, '') // quitar paréntesis en el nombre, e.g. (CONT'D)
      .replace(/\s+/g, ' ') // colapsar espacios
      .trim()
      .toLowerCase();

  for (const scene of sortedScenes) {
    if (!scene.content || scene.content.length === 0) continue;

    for (const contentItem of scene.content) {
      const target = normalizeName(contentItem.characterName);
      const character = characters.find(
        (c) => normalizeName(c.name || '') === target
      );

      if (contentItem.text) {
        const cleanText = removeParentheticals(contentItem.text);

        if (cleanText.trim().length > 0) {
          // Fallback: si no existe el personaje en BD, igual mostramos la línea
          const fallbackId = `unknown-${contentItem.characterName}`;
          const newItem = {
            id: `${scene.id}-${orderIndex}`,
            characterId: character ? character.id : fallbackId,
            characterName: character ? character.name : contentItem.characterName,
            text: contentItem.text,
            cleanText: cleanText,
            color: character ? character.color : '#6B7280',
            voiceGender: character ? character.voice_gender : 'neutral',
            voicePreset: 'natural', // Usar valor por defecto ya que voice_preset no existe en el tipo Character
            isUserCharacter: character ? character.is_user_character : false,
            orderIndex: orderIndex++,
            sceneId: scene.id,
          } as DialogueLine;
          const last = dialogueLines[dialogueLines.length - 1];
          if (last && last.sceneId === newItem.sceneId && normalizeName(last.characterName) === normalizeName(newItem.characterName)) {
            const mergedText = `${last.text} ${newItem.text}`.replace(/\s+/g, ' ').trim();
            const mergedClean = `${last.cleanText} ${newItem.cleanText}`.replace(/\s+/g, ' ').trim();
            dialogueLines[dialogueLines.length - 1] = { ...last, text: mergedText, cleanText: mergedClean };
          } else {
            dialogueLines.push(newItem);
          }
        }
      }
    }
  }

  return dialogueLines;
}

function removeParentheticals(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDialogueStats(lines: DialogueLine[]) {
  const totalLines = lines.length;
  const userLines = lines.filter((l) => l.isUserCharacter).length;
  const otherLines = totalLines - userLines;

  const characterCounts = lines.reduce((acc, line) => {
    acc[line.characterName] = (acc[line.characterName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalLines,
    userLines,
    otherLines,
    characterCounts,
  };
}
