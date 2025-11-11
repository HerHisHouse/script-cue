#!/usr/bin/env node
/* eslint-env node */
/*
  Chequeos estáticos para detectar patrones de errores recurrentes.
  - Import incorrecto de expo-file-system en lugar de legacy
  - Uso de key={index} en listas renderizadas
  - Uso de FileSystem en web
  - Uso de atob en app
  - Uso de expo-sharing sin guardas
*/
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const targets = [
  path.join(projectRoot, 'app'),
  path.join(projectRoot, 'utils'),
];

let errors = [];
let warnings = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      analyzeFile(full);
    }
  }
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(projectRoot, filePath);

  // 1) expo-file-system import
  if (content.includes("from 'expo-file-system'")) {
    if (!content.includes("from 'expo-file-system/legacy'")) {
      errors.push(`[expo-file-system] Import no-legacy en ${rel}`);
    }
  }

  // 2) key={index}
  if (/key\s*=\s*{\s*index\s*}/.test(content)) {
    warnings.push(`[keys] key={index} detectado en ${rel}`);
  }

  // 3) FileSystem usado en web
  if (content.includes('Platform.OS === \"web\"') && content.includes('FileSystem.')) {
    errors.push(`[web] FileSystem usado en web en ${rel}`);
  }

  // 4) atob en app
  if (rel.startsWith('app/') && /\batob\s*\(/.test(content)) {
    warnings.push(`[atob] Uso de atob en app en ${rel}`);
  }

  // 5) expo-sharing sin guardas
  if (content.includes("from 'expo-sharing'")) {
    const hasGuard = content.includes('Sharing.isAvailableAsync');
    if (!hasGuard) {
      warnings.push(`[sharing] Falta guardas de disponibilidad en ${rel}`);
    }
  }
}

for (const t of targets) {
  if (fs.existsSync(t)) walk(t);
}

if (warnings.length) {
  console.warn('WARNINGS:\n' + warnings.map(w => '- ' + w).join('\n'));
}
if (errors.length) {
  console.error('ERRORS:\n' + errors.map(e => '- ' + e).join('\n'));
  process.exit(1);
} else {
  console.log('Static checks passed.');
}

// --- Minimal unit tests (dialogue parser behavior) ---
function runUnitTests() {
  const results = [];

  // Simular extractDialogue con normalización de nombres
  function normalizeName(name) {
    return (name || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function extractDialogueMock(scenes, characters) {
    const lines = [];
    let orderIndex = 0;
    for (const scene of scenes) {
      for (const item of scene.content || []) {
        const target = normalizeName(item.characterName);
        const character = (characters || []).find(c => normalizeName(c.name) === target);
        const cleanText = (item.text || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        if (!cleanText) continue;
        lines.push({
          characterId: character ? character.id : 'unknown',
          characterName: character ? character.name : item.characterName,
          color: character ? character.color : '#6B7280',
          isUserCharacter: character ? !!character.is_user_character : false,
          cleanText,
          orderIndex: orderIndex++,
        });
      }
    }
    return lines;
  }

  // Test 1: normaliza (CONT'D) y empareja color del personaje
  (function testNameNormalization() {
    const scenes = [{ content: [{ characterName: "JOHN (CONT'D)", text: 'Hello there!' }] }];
    const characters = [{ id: 'c1', name: 'JOHN', color: '#123456', is_user_character: true }];
    const lines = extractDialogueMock(scenes, characters);
    const ok = lines.length === 1 && lines[0].color === '#123456' && lines[0].isUserCharacter === true;
    results.push({ name: 'normalize name mapping', ok, detail: lines[0] });
  })();

  // Test 2: fallback color cuando no existe personaje
  (function testFallbackColor() {
    const scenes = [{ content: [{ characterName: 'SARAH', text: 'Hi!' }] }];
    const characters = [];
    const lines = extractDialogueMock(scenes, characters);
    const ok = lines.length === 1 && lines[0].color === '#6B7280' && lines[0].isUserCharacter === false;
    results.push({ name: 'fallback color', ok, detail: lines[0] });
  })();

  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.error('UNIT TESTS FAILED:\n' + failed.map(f => `- ${f.name}: ${JSON.stringify(f.detail)}`).join('\n'));
    process.exit(1);
  } else {
    console.log('Unit tests passed: ' + results.map(r => r.name).join(', '));
  }
}

runUnitTests();