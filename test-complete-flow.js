// Test completo del flujo: PDF → structuredLines → Diálogos filtrados

// Simulación de datos de layout desde PDF (como los genera parse-pdf/index.ts)
const mockLayoutPages = [
  {
    width: 612, // Ancho típico de página PDF
    height: 792, // Alto típico de página PDF
    items: [
      // Escena 1
      { str: 'INT. CASA - DÍA', x: 50, y: 700, width: 100, fontSize: 12 }, // Cabecera (izquierda)
      
      // Diálogo válido (centrado)
      { str: 'ANA', x: 280, y: 650, width: 52, fontSize: 12 }, // Personaje (centrado)
      { str: 'Hola, ¿cómo estás?', x: 250, y: 630, width: 120, fontSize: 11 }, // Diálogo (centrado)
      
      // Acotación que debe ser filtrada (izquierda)
      { str: '(suspira profundamente)', x: 100, y: 610, width: 150, fontSize: 10 }, // Acción (izquierda)
      
      // Diálogo válido
      { str: 'CARLOS', x: 285, y: 590, width: 62, fontSize: 12 }, // Personaje (centrado)
      { str: 'Muy bien, gracias.', x: 260, y: 570, width: 100, fontSize: 11 }, // Diálogo (centrado)
      
      // Acotación que debe ser filtrada (derecha)
      { str: '(se acerca a la ventana)', x: 450, y: 550, width: 140, fontSize: 10 }, // Acción (derecha)
      
      // Diálogo con coordenada límite
      { str: 'ANA', x: 275, y: 530, width: 52, fontSize: 12 }, // Personaje (centrado)
      { str: '¿Quieres que hablemos?', x: 214, y: 510, width: 184, fontSize: 11 }, // Diálogo (x=0.35, límite)
      
      // Diálogo que debe ser filtrado (muy a la izquierda)
      { str: 'CARLOS', x: 280, y: 490, width: 62, fontSize: 12 }, // Personaje (centrado)
      { str: 'No, no es necesario.', x: 100, y: 470, width: 150, fontSize: 11 }, // Diálogo (muy izquierda, debe filtrar)
    ]
  }
];

// Función que simula parseScreenplayFromLayout (de parse-pdf/index.ts)
function parseScreenplayFromLayout(layoutPages) {
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})$/;
  
  const lines = [];
  
  // Procesar páginas como en el parser real
  for (let p = 0; p < layoutPages.length; p++) {
    const page = layoutPages[p];
    const rows = {};
    
    // Agrupar por líneas horizontales (coordenada Y)
    for (const it of page.items) {
      const yKey = Math.round(it.y);
      const key = String(yKey);
      (rows[key] = rows[key] || []).push({ str: it.str, x: it.x, y: it.y, width: it.width });
    }
    
    // Procesar cada línea
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const yKey of rowKeys) {
      const row = rows[String(yKey)].sort((a, b) => a.x - b.x);
      const text = row.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      
      const xMin = row[0].x;
      const width = page.width;
      const normX = xMin / width; // Normalizar X (0-1)
      
      lines.push({ text, x: normX, y: yKey, page: p });
    }
  }
  
  // Clasificar líneas y generar structuredLines
  const structuredLines = [];
  let activeCharacter = null;
  
  for (const line of lines) {
    const { text, x } = line;
    
    if (SCENE_HEADING_REGEX.test(text)) {
      structuredLines.push({ type: 'scene', text, x, page: line.page });
      activeCharacter = null;
      continue;
    }
    
    if (CHARACTER_NAME_REGEX.test(text) && x >= 0.4 && x <= 0.6) {
      // Solo considerar personajes centrados
      activeCharacter = text.trim();
      structuredLines.push({ type: 'character', name: activeCharacter, x, page: line.page });
      continue;
    }
    
    if (activeCharacter && x >= 0.35 && x <= 0.65) {
      // Diálogo centrado
      structuredLines.push({ type: 'dialogue', text, x, page: line.page });
      continue;
    }
    
    // Acción/descripción (izquierda o derecha)
    structuredLines.push({ type: 'action', text, x, page: line.page });
    activeCharacter = null;
  }
  
  return structuredLines;
}

// Función que simula buildDialogueFromStructured (de study.tsx)
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
      
      // FILTRO CRÍTICO: Solo incluir diálogos centrados
      if (x < 0.35 || x > 0.65) {
        console.log(`❌ FILTRADO: "${ln.text}" (x=${x.toFixed(2)} fuera de rango 0.35-0.65)`);
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
      
      console.log(`✅ INCLUIDO: "${ln.text}" (x=${x.toFixed(2)} en rango 0.35-0.65)`);
    }
  }
  
  return out;
}

// Personajes de prueba
const testCharacters = [
  { id: 'ana-1', name: 'ANA', color: '#FF6B6B', voice_gender: 'female', voice_preset: 'natural', is_user_character: false },
  { id: 'carlos-1', name: 'CARLOS', color: '#4ECDC4', voice_gender: 'male', voice_preset: 'natural', is_user_character: false }
];

console.log('=== FLUJO COMPLETO: PDF → structuredLines → Diálogos Filtrados ===\n');

console.log('1. DATOS DEL PDF (coordenadas):');
mockLayoutPages[0].items.forEach(item => {
  const normX = item.x / 612;
  console.log(`   "${item.str}" → x=${item.x} (normalizado: ${normX.toFixed(2)})`);
});

console.log('\n2. PARSEO A structuredLines:');
const structuredLines = parseScreenplayFromLayout(mockLayoutPages);
structuredLines.forEach(line => {
  console.log(`   ${line.type.toUpperCase()}: "${line.text}" (x=${line.x.toFixed(2)})`);
});

console.log('\n3. FILTRADO DE DIÁLOGOS PARA MODO ESTUDIO:');
const result = buildDialogueFromStructured(structuredLines, testCharacters);

console.log('\n4. RESULTADO FINAL - Solo diálogos centrados:');
result.forEach(line => {
  console.log(`   ${line.characterName}: "${line.text}"`);
});

console.log('\n=== RESUMEN ===');
console.log(`✅ Total structuredLines: ${structuredLines.length}`);
console.log(`✅ Diálogos filtrados (acciones): ${structuredLines.filter(l => l.type === 'action').length}`);
console.log(`✅ Diálogos incluidos (cent.): ${result.length}`);
console.log(`✅ Modo Estudio solo muestra: DIÁLOGOS (sin acotaciones)`);