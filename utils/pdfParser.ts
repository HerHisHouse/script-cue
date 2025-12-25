import { Character, DialogueContent, ProsodyHints } from '@/types/database';

export interface ParsedScript {
  characters: Omit<Character, 'id' | 'created_at' | 'updated_at'>[];
  scenes: {
    scene_number: number;
    heading: string;
    content: DialogueContent[];
    order_index: number;
  }[];
  rawText: string;
}

const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})(?:\s*\([^)]*\))?$/;
const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
const SCENE_NUMBER_REGEX = /^\s*\d+(\.|-|:)\s*$/i;
const PARENTHETICAL_REGEX = /^\s*\([\s\S]*\)\s*$/;

const SCENE_KEYWORDS = ['INT.', 'EXT.', 'INT/EXT.', 'INTERIOR', 'EXTERIOR'];

export function parseScreenplay(text: string): ParsedScript {
  const lines = text.split('\n');
  const characters = new Map<string, { count: number; color: string }>();
  const scenes: ParsedScript['scenes'] = [];

  let currentScene: ParsedScript['scenes'][0] | null = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let lastCharacterName: string | null = null;
  let currentDialogueText: string | null = null;
  let dialogueIndent: number | null = null;

  const colorPalette = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
  ];

  let colorIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    // Mantener la línea tal cual (sin trim) para preservar saltos y espacios internos;
    // sólo recortamos al evaluar encabezados y nombres.
    const rawLine = lines[i];
    const line = rawLine; // sin trim para evitar pérdida de formato dentro de diálogos
    const trimmed = (rawLine || '').trim();
    const leadingSpaces = (rawLine || '').match(/^ */)![0].length;

    // Línea vacía: si estamos dentro de un diálogo, preservamos como salto de línea
    if (!trimmed) {
      if (lastCharacterName && currentDialogueText !== null) {
        currentDialogueText = `${currentDialogueText}\n`;
      } else {
        lastCharacterName = null;
      }
      continue;
    }

    if (SCENE_HEADING_REGEX.test(trimmed)) {
      // Flush diálogo pendiente antes de crear nueva escena
      if (currentScene && lastCharacterName && currentDialogueText) {
        const prosodyHints: ProsodyHints = {
          hasQuestion: currentDialogueText.includes('?'),
          hasExclamation: currentDialogueText.includes('!'),
          emphasis: (currentDialogueText.match(/!/g) || []).length,
          emotion: 'neutral',
          pace: 'normal',
        };
        currentScene.content.push({
          characterName: lastCharacterName,
          text: currentDialogueText,
          prosodyHints,
        });
        const charData = characters.get(lastCharacterName);
        if (charData) charData.count++;
        currentDialogueText = null;
        lastCharacterName = null;
      }
      if (currentScene && currentScene.content.length > 0) {
        scenes.push(currentScene);
      }

      sceneCounter++;
      currentScene = {
        scene_number: sceneCounter,
        heading: trimmed,
        content: [],
        order_index: orderIndex++,
      };
      lastCharacterName = null;
      currentDialogueText = null;
      dialogueIndent = null;
      continue;
    }

    if (!currentScene) {
      currentScene = {
        scene_number: ++sceneCounter,
        heading: 'ESCENA ' + sceneCounter,
        content: [],
        order_index: orderIndex++,
      };
    }

    const isSceneKeyword = SCENE_KEYWORDS.some(keyword =>
      trimmed.toUpperCase().includes(keyword)
    );

    if (isSceneKeyword || SCENE_NUMBER_REGEX.test(trimmed)) {
      continue;
    }

    if (CHARACTER_NAME_REGEX.test(trimmed)) {
      // Nueva cabecera de personaje: flush del diálogo previo
      if (currentScene && lastCharacterName && currentDialogueText) {
        const prosodyHints: ProsodyHints = {
          hasQuestion: currentDialogueText.includes('?'),
          hasExclamation: currentDialogueText.includes('!'),
          emphasis: (currentDialogueText.match(/!/g) || []).length,
          emotion: 'neutral',
          pace: 'normal',
        };
        currentScene.content.push({
          characterName: lastCharacterName,
          text: currentDialogueText,
          prosodyHints,
        });
        const charDataPrev = characters.get(lastCharacterName);
        if (charDataPrev) charDataPrev.count++;
        currentDialogueText = null;
        dialogueIndent = null;
      }

      const characterName = trimmed;
      lastCharacterName = characterName;
      dialogueIndent = null;

      if (!characters.has(characterName)) {
        characters.set(characterName, {
          count: 0,
          color: colorPalette[colorIndex % colorPalette.length],
        });
        colorIndex++;
      }
      continue;
    }

    if (lastCharacterName && trimmed.length > 0) {
      if (PARENTHETICAL_REGEX.test(trimmed)) {
        continue;
      }
      if (currentDialogueText === null) {
        dialogueIndent = leadingSpaces;
        currentDialogueText = trimmed;
      } else {
        const indent = leadingSpaces;
        const baseline = dialogueIndent ?? 0;
        const indentDrop = indent < Math.max(0, baseline - 2);
        const looksSceneHeading = SCENE_HEADING_REGEX.test(trimmed);
        const looksCharacter = CHARACTER_NAME_REGEX.test(trimmed);
        if (indentDrop || looksSceneHeading || looksCharacter) {
          const prosodyHints: ProsodyHints = {
            hasQuestion: currentDialogueText.includes('?'),
            hasExclamation: currentDialogueText.includes('!'),
            emphasis: (currentDialogueText.match(/!/g) || []).length,
            emotion: 'neutral',
            pace: 'normal',
          };
          currentScene.content.push({
            characterName: lastCharacterName,
            text: currentDialogueText,
            prosodyHints,
          });
          const charDataMid = characters.get(lastCharacterName);
          if (charDataMid) charDataMid.count++;
          currentDialogueText = null;
          lastCharacterName = null;
          dialogueIndent = null;
          if (looksSceneHeading || looksCharacter) {
            i--; 
          }
        } else {
          currentDialogueText = `${currentDialogueText} ${trimmed}`;
        }
      }
    }
  }

  // Flush final del diálogo pendiente
  if (currentScene && lastCharacterName && currentDialogueText) {
    const prosodyHints: ProsodyHints = {
      hasQuestion: currentDialogueText.includes('?'),
      hasExclamation: currentDialogueText.includes('!'),
      emphasis: (currentDialogueText.match(/!/g) || []).length,
      emotion: 'neutral',
      pace: 'normal',
    };
    currentScene.content.push({
      characterName: lastCharacterName,
      text: currentDialogueText,
      prosodyHints,
    });
    const charData = characters.get(lastCharacterName);
    if (charData) charData.count++;
    currentDialogueText = null;
    lastCharacterName = null;
    dialogueIndent = null;
  }

  if (currentScene && currentScene.content.length > 0) {
    scenes.push(currentScene);
  }

  for (const scene of scenes) {
    const merged: DialogueContent[] = [];
    for (const item of scene.content) {
      const last = merged[merged.length - 1];
      if (last && last.characterName === item.characterName) {
        const text = `${last.text} ${item.text}`.replace(/\s+/g, ' ').trim();
        const prosodyHints: ProsodyHints = {
          hasQuestion: text.includes('?'),
          hasExclamation: text.includes('!'),
          emphasis: (text.match(/!/g) || []).length,
          emotion: 'neutral',
          pace: 'normal',
        };
        merged[merged.length - 1] = { ...last, text, prosodyHints };
      } else {
        merged.push(item);
      }
    }
    scene.content = merged;
  }

  const totalLines = Array.from(characters.values()).reduce(
    (sum, char) => sum + char.count,
    0
  );

  const characterList = Array.from(characters.entries()).map(
    ([name, data]) => ({
      script_id: '',
      name,
      is_user_character: false,
      voice_gender: 'neutral' as const,
      voice_preset: 'natural' as const,
      color: data.color,
      line_count: data.count,
      occurrence_percentage: totalLines > 0 ? (data.count / totalLines) * 100 : 0,
      voice_id: null,
      voice_provider: null,
    })
  );

  characterList.sort((a, b) => b.line_count - a.line_count);

  return {
    characters: characterList,
    scenes,
    rawText: text,
  };
}

// Sencillas pruebas de regresión para asegurar agrupación correcta
export function runParseScreenplayTests() {
  const cases = [
    {
      name: 'Un diálogo largo en múltiples líneas se agrupa en una tarjeta',
      input: 'INT. CAFETERÍA - DÍA\nALEX\nCuéntame bien todo,\n¿cómo te fue con\nella?',
      expectContentCount: 1,
    },
    {
      name: 'Diálogos de diferentes personajes crean tarjetas separadas',
      input: 'ESCENA 1\nALEX\nHola.\nGRACI\nBien, gracias.',
      expectContentCount: 2,
    },
    {
      name: 'Líneas con espacios y vacías se preservan dentro del mismo diálogo',
      input: 'INT. CASA - NOCHE\nALEX\nPrimera línea.\n\nSegunda línea tras espacio.',
      expectContentCount: 1,
    },
    {
      name: 'Ignora acotación izquierda entre dos bloques del mismo personaje y fusiona',
      input: 'INT. CASA - NOCHE\nALEX\n        Hola.\nSe levanta y camina.\nALEX\n        Sigue: ¿vienes?',
      expectContentCount: 1,
    },
    {
      name: 'Ignora números de escena sueltos',
      input: '1.\nINT. OFICINA - DÍA\nALEX\n        Probando.',
      expectContentCount: 1,
    },
  ];

  return cases.map((c) => {
    const parsed = parseScreenplay(c.input);
    const firstScene = parsed.scenes[0];
    const pass = firstScene && firstScene.content.length === c.expectContentCount;
    return { name: c.name, pass };
  });
}

export function detectCharactersFromText(text: string): string[] {
  const lines = text.split('\n');
  const characterNames = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (CHARACTER_NAME_REGEX.test(trimmed)) {
      const isSceneKeyword = SCENE_KEYWORDS.some(keyword =>
        trimmed.toUpperCase().includes(keyword)
      );

      if (!isSceneKeyword) {
        characterNames.add(trimmed);
      }
    }
  }

  return Array.from(characterNames);
}
