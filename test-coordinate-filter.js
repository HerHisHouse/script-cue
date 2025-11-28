// Test script para demostrar el filtrado por coordenadas
const testStructuredLines = [
  // Diálogos válidos (centrados, x entre 0.35-0.65)
  { type: 'character', name: 'ANA', x: 0.5, page: 0 },
  { type: 'dialogue', text: 'Hola, ¿cómo estás?', x: 0.48, page: 0 },
  
  { type: 'character', name: 'CARLOS', x: 0.52, page: 0 },
  { type: 'dialogue', text: 'Muy bien, gracias. ¿Y tú?', x: 0.49, page: 0 },
  
  // Acotaciones que deben ser filtradas (no centradas)
  { type: 'action', text: '(suspira profundamente)', x: 0.15, page: 0 },
  { type: 'action', text: '(se acerca a la ventana)', x: 0.8, page: 0 },
  
  // Diálogo válido
  { type: 'character', name: 'ANA', x: 0.51, page: 0 },
  { type: 'dialogue', text: 'Bien, bien. Solo un poco cansada.', x: 0.47, page: 0 },
  
  // Más acotaciones que deben ser filtradas
  { type: 'action', text: '(mira el reloj)', x: 0.2, page: 0 },
  { type: 'action', text: '(se sienta)', x: 0.75, page: 0 },
  
  // Diálogo con coordenada límite (debe ser incluido)
  { type: 'character', name: 'CARLOS', x: 0.5, page: 0 },
  { type: 'dialogue', text: '¿Quieres que hablemos?', x: 0.35, page: 0 }, // x=0.35 es límite inferior
  
  // Diálogo que debe ser filtrado (x demasiado baja)
  { type: 'character', name: 'ANA', x: 0.5, page: 0 },
  { type: 'dialogue', text: 'No, no es necesario.', x: 0.34, page: 0 }, // x=0.34 debe ser filtrado
];

function buildDialogueFromStructured(lines, characters) {
  const out = [];
  let idx = 0;
  let activeName = null;
  const normalizeName = (name) => (name || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  
  for (const ln of lines) {
    if (ln.type === 'character' && ln.name) {
      activeName = String(ln.name);
    } else if (ln.type === 'dialogue' && ln.text && activeName) {
      const x = typeof ln.x === 'number' ? ln.x : 0.5;
      
      // FILTRO CRÍTICO: Solo incluir diálogos centrados (x entre 0.35-0.65)
      if (x < 0.35 || x > 0.65) {
        console.log(`Filtrado: "${ln.text}" (x=${x.toFixed(2)} está fuera del rango 0.35-0.65)`);
        continue;
      }
      
      const target = normalizeName(activeName);
      const character = characters.find((c) => normalizeName(c.name) === target);
      const cleanText = (String(ln.text) || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (!cleanText) continue;
      
      const id = `${(character?.id || 'unknown')}-${idx}`;
      out.push({
        id,
        characterId: character?.id || `unknown-${target}`,
        characterName: character?.name || activeName,
        text: String(ln.text),
        cleanText,
        color: character?.color || '#6B7280',
        voiceGender: character?.voice_gender || 'neutral',
        voicePreset: character?.voice_preset || 'natural',
        isUserCharacter: character?.is_user_character || false,
        orderIndex: idx++,
        sceneId: ''
      });
      
      console.log(`Incluido: "${ln.text}" (x=${x.toFixed(2)} está en el rango 0.35-0.65)`);
    }
  }
  
  return out;
}

// Personajes de prueba
const testCharacters = [
  { id: 'ana-1', name: 'ANA', color: '#FF6B6B', voice_gender: 'female', voice_preset: 'natural', is_user_character: false },
  { id: 'carlos-1', name: 'CARLOS', color: '#4ECDC4', voice_gender: 'male', voice_preset: 'natural', is_user_character: false }
];

console.log('=== DEMOSTRACIÓN DEL FILTRADO POR COORDENADAS ===\n');
console.log('Líneas estructuradas de entrada:');
testStructuredLines.forEach(line => {
  if (line.type === 'dialogue') {
    console.log(`  - "${line.text}" (x=${line.x}, tipo=${line.type})`);
  }
});

console.log('\nAplicando filtro de coordenadas (0.35-0.65)...\n');

const result = buildDialogueFromStructured(testStructuredLines, testCharacters);

console.log('\n=== RESULTADO FINAL ===');
console.log(`Total de líneas de diálogo incluidas: ${result.length}`);
result.forEach(line => {
  console.log(`  - ${line.characterName}: "${line.text}"`);
});

console.log('\n=== CONCLUSIÓN ===');
console.log('✅ Las acotaciones con x fuera del rango 0.35-0.65 han sido filtradas');
console.log('✅ Solo los diálogos verdaderamente centrados aparecen en Modo Estudio');
console.log('✅ Esto garantiza que Modo Estudio solo muestre diálogos, sin acotaciones');