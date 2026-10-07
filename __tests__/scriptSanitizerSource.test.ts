import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
/* eslint-disable @typescript-eslint/no-require-imports */
const { sanitizeParsedScript } = require('../server/scriptSanitizer');
/* eslint-enable @typescript-eslint/no-require-imports */

// Texto real de un PDF sin ninguna acción, en el que GPT se inventó una antes de cada diálogo.
const source = fs.readFileSync(path.join(__dirname, 'fixtures', 'escena-parque.txt'), 'utf8');

const parsedWithInventions = {
  scenes: [{
    heading: 'EXT. PARQUE – NOCHE',
    content: [
      { characterName: 'ACCIÓN', text: 'Claudia se sienta en un banco del parque, visiblemente molesta.' },
      { characterName: 'CLAUDIA', text: '¿Te puedes creer que me ha despedido? ¡Será sinvergüenza! Es que no me lo esperaba para nada, me acaba de joder la vida...' },
      { characterName: 'ACCIÓN', text: 'Marta se acerca, con una expresión preocupada.' },
      { characterName: 'MARTA', text: 'Hoy justo he tenido un mal presentimiento cuando me he levantado.' },
      { characterName: 'ACCIÓN', text: 'Marta lo mira con incredulidad.' },
      { characterName: 'CARLOS', text: 'Pues yo sí que me voy de fiesta.' },
    ],
  }],
};

describe('sanitizeParsedScript con el texto del PDF', () => {
  it('descarta las acciones inventadas y conserva todos los diálogos', () => {
    const result = sanitizeParsedScript(parsedWithInventions, { sourceText: source });
    expect(result.scenes[0].content.map((c: { characterName: string }) => c.characterName)).toEqual(['CLAUDIA', 'MARTA', 'CARLOS']);
    expect(result.invented).toBe(3);
    expect(result.suspicious).toBe(0);
  });

  it('una acción que sí está en el PDF se conserva aunque cambien saltos de línea y mayúsculas', () => {
    const src = 'EXT. PARQUE – NOCHE\nClaudia entra corriendo y se sien-\nta en el banco.\n          CLAUDIA\n     Hola.';
    const parsed = { scenes: [{ content: [
      { characterName: 'ACCIÓN', text: 'CLAUDIA entra corriendo y se sienta en el banco.' },
      { characterName: 'CLAUDIA', text: 'Hola.' },
    ] }] };
    const result = sanitizeParsedScript(parsed, { sourceText: src });
    expect(result.scenes[0].content).toHaveLength(2);
    expect(result.invented).toBe(0);
  });

  it('un diálogo que no cuadra no se descarta, solo se cuenta', () => {
    const parsed = { scenes: [{ content: [{ characterName: 'MARTA', text: 'Frase completamente distinta inventada.' }] }] };
    const result = sanitizeParsedScript(parsed, { sourceText: source });
    expect(result.scenes[0].content).toHaveLength(1);
    expect(result.suspicious).toBe(1);
  });

  it('sin texto del PDF se comporta como antes', () => {
    const result = sanitizeParsedScript(parsedWithInventions);
    expect(result.scenes[0].content).toHaveLength(6);
  });
});
