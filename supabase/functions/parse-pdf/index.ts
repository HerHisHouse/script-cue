// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
// Robust PDF text extraction
import pdfParse from "npm:pdf-parse@1.1.1";
import mammoth from "npm:mammoth";
import { Buffer } from "node:buffer";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization")!;
    
    // Extraer el token JWT del header "Bearer <token>"
    const token = authHeader.replace("Bearer ", "");

    // 🚨 CORRECCIÓN: Usamos el token del usuario para inicializar el cliente,
    // permitiéndole descargar el archivo que subió.
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    const { scriptId, fileContent, filePath, fileName, skipCharacterDetection, text: rawText, preserveFormatting } = await req.json();
    let text = "";
    // Support raw text directly (OCR/scanned images flow)
    if (rawText && rawText.trim().length > 0) {
      text = rawText;
    } else {
      // Extract text from File
      let fileBuffer = null;
      if (filePath) {
        const { data, error } = await supabase.storage.from("scripts").download(filePath);
        if (error) throw error;
        if (typeof data.arrayBuffer === "function") {
          const buf = await data.arrayBuffer();
          fileBuffer = new Uint8Array(buf);
        } else if (typeof data.stream === "function") {
          // Edge: some environments return a Response-like object
          const respBuf = await data.arrayBuffer();
          fileBuffer = new Uint8Array(respBuf);
        } else {
          throw new Error("Unsupported file data type for parse-pdf (expected Blob/Response)");
        }
      } else if (fileContent) {
        // fileContent may be DataURL or base64 string
        let base64Data = fileContent;
        // Guard against non-string or undefined values
        if (typeof base64Data === "string" && base64Data.startsWith("data:")) {
          const parts = fileContent.split(",");
          base64Data = parts[1] ?? "";
        }
        const binaryString = atob(base64Data || "");
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for(let i = 0; i < len; i++){
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileBuffer = bytes;
      } else {
        throw new Error("No filePath, fileContent, or raw text provided");
      }
      // Validate before parsing
      if (!fileBuffer || fileBuffer.byteLength === 0) {
        throw new Error("File buffer is empty or invalid");
      }
      
      const isDocx = fileName && fileName.toLowerCase().endsWith('.docx');
      
      if (isDocx) {
        console.log("Parsing DOCX file...");
        const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
        if (!result || !result.value || result.value.trim().length === 0) {
          throw new Error("Failed to extract text from DOCX");
        }
        text = result.value;
      } else {
        console.log("Parsing PDF file...");
        const layoutPages: Array<{ width: number; height: number; items: Array<{ str: string; x: number; y: number; width: number; fontSize: number }> }> = [];
        const parsedPdf = await pdfParse(fileBuffer, {
          pagerender: async (pageData: any) => {
            const textContent = await pageData.getTextContent();
            const viewport = pageData.getViewport({ scale: 1.0 });
            const items = (textContent.items || []).map((it: any) => {
              const t = it.transform || [0,0,0,0,0,0];
              const x = t[4] || 0;
              const y = t[5] || 0;
              const a = t[0] || 0;
              const b = t[1] || 0;
              const fontSize = Math.sqrt(a * a + b * b);
              return { str: it.str || '', x, y, width: it.width || 0, fontSize };
            });
            layoutPages.push({ width: viewport.width, height: viewport.height, items });
            return items.map((i: any) => i.str).join(' ');
          }
        });
        if (!parsedPdf || !parsedPdf.text || parsedPdf.text.trim().length === 0) {
          throw new Error("Failed to extract text from PDF");
        }
        text = parsedPdf.text;
      }
    }
    // STEP 1: Save raw text
    console.log("Saving raw text to script_raw...");
    const { error: updateRawError } = await supabase
      .from("scripts")
      .update({
        script_raw: text,
        parsed_text: text // Keep for compatibility
      })
      .eq("id", scriptId);

    if (updateRawError) throw updateRawError;

    // STEP 2: Convert to HTML using OpenAI (Skip if preserving formatting)
    if (!preserveFormatting) {
        console.log("Converting script to HTML using OpenAI...");
        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
        
        if (!openaiApiKey) {
          console.warn("OpenAI API key not found, skipping HTML conversion");
        } else {
            const prompt = `Convierte el siguiente guion en un documento HTML con formato profesional de screenplay cinematográfico. Mantén la estructura exacta sin inventar contenido nuevo.
    
    Reglas de formato:
    • Fuente: Courier Prime o Courier New, tamaño 12pt.
    • Título: centrado, MAYÚSCULAS, negrita y subrayado, margin-bottom: 30px.
    • Encabezados de escena (INT./EXT.): mayúsculas, negrita, alineados a la izquierda, margin-top: 25px, margin-bottom: 15px.
    
    ESPACIADO CRÍTICO (muy importante):
    • Acciones/Descripciones: texto normal, alineado a la izquierda, margin-bottom: 20px.
    • Nombres de personaje: centrados, MAYÚSCULAS, negrita, margin-top: 20px, margin-bottom: 0px.
    • Acotaciones (entre paréntesis): centradas, cursiva, margin-top: 0px, margin-bottom: 0px.
    • Diálogos: centrados, max-width 70%, margin: 0 auto, margin-bottom: 5px.
    
    • Después de cada bloque de diálogo (antes del siguiente personaje o acción): margin-bottom: 15px.
    • Usa <hr> para separar páginas si el PDF lo indicaba.
    
    IMPORTANTE: El espaciado entre elementos es CRUCIAL para la legibilidad profesional. Cada bloque de personaje+diálogo debe estar visualmente separado del siguiente.
    
    Entrega SOLO el HTML sin comentarios ni markdown.
    
    GUION:
    ${text}`;
    
            try {
              const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content: "Eres un experto en formateo de guiones cinematográficos. Conviertes texto plano en HTML profesional siguiendo estándares de screenplay."
                    },
                    {
                      role: "user",
                      content: prompt
                    }
                  ],
                  temperature: 0.3,
                  max_tokens: 16000
                })
              });
    
              if (!openaiResponse.ok) {
                const errorText = await openaiResponse.text();
                console.error("OpenAI API error:", errorText);
                throw new Error(`OpenAI API error: ${openaiResponse.status}`);
              }
    
              const openaiData = await openaiResponse.json();
              const htmlContent = openaiData.choices[0]?.message?.content || "";
              
              try {
                  const { logApiUsage } = await import('../_shared/api_usage.ts');
                  await logApiUsage({
                      userId: null,
                      provider: 'openai_analysis',
                      tokens: openaiData.usage?.total_tokens || 0,
                      scriptId: scriptId,
                      mode: 'parse-pdf-html'
                  });
              } catch (e) { console.warn('Failed to log usage:', e); }
    
              if (!htmlContent) {
                throw new Error("OpenAI returned empty HTML content");
              }
    
              // STEP 3: Save HTML to script_html
              console.log("Saving HTML to script_html...");
              const { error: updateHtmlError } = await supabase
                .from("scripts")
                .update({
                  script_html: htmlContent
                })
                .eq("id", scriptId);
    
              if (updateHtmlError) throw updateHtmlError;
    
            } catch (openaiError) {
              console.error("Error converting to HTML:", openaiError);
              // Continue to parsing even if HTML fails
            }
        }
    }

    // STEP 4: Parse scenes and lines for Studio Mode
    console.log("Parsing scenes and lines for Studio Mode...");
    let parsed;
    
    // Try OpenAI parsing first (as requested)
    try {
        console.log("Attempting OpenAI parsing for Studio Mode structure...");
        parsed = await parseScreenplayWithOpenAI(text);
    } catch (openaiError) {
        console.error("OpenAI parsing failed, falling back to local regex parser:", openaiError);
        parsed = parseScreenplay(text);
    }
    
    // Create admin client for inserting scenes and lines (bypasses RLS)
    const supabaseAdmin = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
    
    // Delete existing scenes (cascade delete lines)
    const { error: deleteError } = await supabaseAdmin
        .from('scenes')
        .delete()
        .eq('script_id', scriptId);

    if (deleteError) throw deleteError;

    // Insert new scenes and lines
    for (const scene of parsed.scenes) {
        // Construct a text representation of the scene content for the 'content' column
        // This satisfies the NOT NULL constraint and provides a fallback/summary
        let sceneContentText = scene.content && Array.isArray(scene.content)
            ? scene.content.map((c: any) => `${c.characterName}: ${c.text}`).join('\n')
            : '';
        
        if (!sceneContentText || sceneContentText.trim() === '') {
            sceneContentText = '[Sin contenido]';
        }

        console.log(`Inserting scene ${scene.scene_number} with content length: ${sceneContentText.length}`);

        const { data: sceneData, error: sceneError } = await supabaseAdmin
            .from('scenes')
            .insert({
                script_id: scriptId,
                scene_number: scene.scene_number,
                heading: scene.heading || 'ESCENA SIN TÍTULO',
                order_index: scene.order_index,
                content: sceneContentText // Added content field
            })
            .select()
            .single();

        if (sceneError) throw sceneError;

        const EMOTION_PATTERNS = {
            whispering: [/susurr/i, /suave/i, /en voz baja/i, /whisper/i],
            shouting:   [/grit/i, /vocea/i, /gritando/i, /a voces/i, /shout/i],
            crying:     [/llor/i, /solloz/i, /entre lágrimas/i, /llorando/i],
            laughing:   [/ríe/i, /carcajada/i, /riendo/i, /risas/i],
            angry:      [/enfad/i, /furios/i, /irad/i, /rabios/i, /enojad/i],
            excited:    [/emocionad/i, /entusiasmad/i, /eufóric/i, /nervios/i],
            sad:        [/triste/i, /apagad/i, /melancól/i, /deprimid/i],
            fearful:    [/mied/i, /aterrad/i, /pánic/i, /temblando/i],
            tender:     [/tiern/i, /cariñ/i, /dulce/i, /ternura/i],
            neutral:    [],
        };

        function extractEmotionFromText(rawText: string) {
            const bracketMatch = rawText.match(/[\\(\\[]([^\\)\\]]+)[\\)\\]]/);
            let emotion = 'neutral';
            let detectedFrom;
            let intensity = 0.5;

            if (bracketMatch) {
                detectedFrom = bracketMatch[0];
                const innerText = bracketMatch[1];
                for (const [emo, patterns] of Object.entries(EMOTION_PATTERNS)) {
                    if (patterns.some(p => p.test(innerText))) {
                        emotion = emo;
                        intensity = 0.8;
                        break;
                    }
                }
            }
            return { direction: { emotion, intensity, detectedFrom } };
        }

        if (scene.content.length > 0) {
            const linesToInsert = scene.content.map((line: any, idx: number) => {
                const { direction } = extractEmotionFromText(line.text || '');
                return {
                    scene_id: sceneData.id,
                    character_name: line.characterName,
                    content: line.text,
                    order_index: idx,
                    prosody_hints: line.prosodyHints,
                    voice_direction: direction.emotion === 'neutral' ? null : direction
                };
            });


            const { error: linesError } = await supabaseAdmin
                .from('lines')
                .insert(linesToInsert);

            if (linesError) throw linesError;
        }
    }

    return new Response(JSON.stringify({
        success: true,
        message: "Script processed successfully. Studio Mode updated.",
        sceneCount: parsed.scenes.length
    }), {
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return new Response(JSON.stringify({
        error: error?.message ?? "Unknown error",
        hint: "Check storage path, PDF integrity, and function logs."
    }), {
        status: 500,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
  }
});

async function parseScreenplayWithOpenAI(text: string) {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
        console.error('❌ OPENAI_API_KEY not configured');
        throw new Error('OPENAI_API_KEY not configured');
    }

    console.log('🤖 Starting OpenAI parsing for Studio Mode...');
    console.log(`📝 Text length: ${text.length} characters`);

    const systemPrompt = `You are an expert screenplay parser. Your job is to extract dialogues AND action lines from a screenplay into JSON format.
    
    CRITICAL RULES:
    1. Extract ALL dialogues and ALL action lines (scene descriptions/actions).
    2. Ignore ONLY scene headers (INT./EXT.), transitions, or page numbers.
    3. For each scene, extract the dialogues AND the action lines in the exact order they appear.
    4. For action lines, set "characterName" to "ACCIÓN" and "text" to the action line content.
    5. INCLUDE parentheticals (stage directions like (susurrando)) IN THE DIALOGUE TEXT. DO NOT extract parentheticals as action lines!
       Example: "(susurrando) Esto es un secreto." -> dialogue text: "(susurrando) Esto es un secreto."
    6. Ignore ONLY character name modifiers like (CONT'D), (V.O.), (O.S.) that appear after the character name.
    
    Output format:
    {
      "scenes": [
        {
          "scene_number": 1,
          "heading": "INT. KITCHEN - DAY",
          "order_index": 0,
          "content": [
            {
              "characterName": "ACCIÓN",
              "text": "John walks into the kitchen and sighs."
            },
            {
              "characterName": "JOHN",
              "text": "(susurrando) Hello, how are you?",
              "prosodyHints": {
                "emotion": "neutral",
                "pace": "normal",
                "hasQuestion": true,
                "hasExclamation": false,
                "emphasis": 0
              }
            }
          ]
        }
      ]
    }
    
    IMPORTANT: 
    - Return ONLY valid JSON
    - Include ALL dialogues and actions from the script
    - KEEP stage directions like (susurrando), (emocionado) in the dialogue text. DO NOT create "ACCIÓN" for them.
    - Each content block must have characterName and text
    - Set hasQuestion=true if dialogue ends with "?"
    - Set hasExclamation=true if dialogue contains "!"`;

    const textToSend = text.substring(0, 50000);
    console.log(`📤 Sending ${textToSend.length} characters to OpenAI...`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Extract all dialogues and actions from this screenplay:\n\n${textToSend}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        }),
    });

    console.log(`📥 OpenAI response status: ${response.status}`);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenAI API error: ${response.status} - ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    try {
        const { logApiUsage } = await import('../_shared/api_usage.ts');
        await logApiUsage({
            userId: null,
            provider: 'openai_analysis',
            tokens: data.usage?.total_tokens || 0,
            mode: 'parse-pdf-structured'
        });
    } catch (e) { console.warn('Failed to log usage:', e); }
    
    if (!content) {
        console.error('❌ Empty content from OpenAI');
        throw new Error('Empty response from OpenAI');
    }

    console.log(`📋 Received content length: ${content.length} characters`);
    
    const parsed = JSON.parse(content);
    
    const sceneCount = parsed.scenes?.length || 0;
    const dialogueCount = parsed.scenes?.reduce((acc: number, scene: any) => 
        acc + (scene.content?.length || 0), 0) || 0;
    
    console.log(`✅ OpenAI parsing successful:`);
    console.log(`   - Scenes: ${sceneCount}`);
    console.log(`   - Total dialogues: ${dialogueCount}`);
    
    if (dialogueCount === 0) {
        console.warn('⚠️ WARNING: No dialogues extracted by OpenAI!');
    }

    return parsed;
}

/**
 * Función mejorada para analizar el texto plano de un guion y extraer los diálogos.
 * Esta versión maneja mejor los bloques de diálogo que ocupan varias líneas
 * y filtra las acotaciones entre paréntesis.
 * @param text El contenido completo del guion en texto plano.
 * @returns Un objeto con un array de escenas estructuradas.
 */ function parseScreenplay(text) {
  // 1. Limpieza inicial del texto
  // Reemplazar saltos de línea múltiples con uno solo para normalizar
  const cleanedText = text.replace(/(\r\n|\n|\r){2,}/g, '\n\n').trim();
  // 2. Dividir el guion en bloques (aproximadamente por párrafos o líneas)
  // Usamos el texto completo para el análisis línea por línea para mantener la estructura
  const lines = text.split('\n').map((line)=>line.trimEnd());
  const scenes = [];
  let currentScene = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let lastCharacterName = null;
  let dialogueBuffer = [];
  let dialogueIndent = null;
  // Patrones de RegEx
  // A. Nombre de Personaje: Línea que contiene solo MAYÚSCULAS, números, espacios y guiones.
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})(?:\s*\([^)]*\))?$/;
  // B. Encabezado de Escena (para iniciar una nueva escena)
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|-|:)\s*$/i;
  // C. Acotación: Texto entre paréntesis, incluyendo (CONT'D) o (O.S.)
  const PARENTHETICAL_REGEX = /^\s*(\([^\)]+\))$/;
  // Función auxiliar para guardar el diálogo acumulado
  const saveDialogue = ()=>{
    if (lastCharacterName && dialogueBuffer.length > 0 && currentScene) {
      const dialogueText = dialogueBuffer.join(' ').replace(/\s+/g, ' ').trim();
      // Si el diálogo no está vacío, lo guardamos
      if (dialogueText.length > 0) {
        currentScene.content.push({
          characterName: lastCharacterName,
          text: dialogueText,
          // Mantenemos los prosodyHints si los necesitas, aunque se pueden simplificar
          prosodyHints: {
            hasQuestion: dialogueText.includes("?"),
            hasExclamation: dialogueText.includes("!"),
            emphasis: (dialogueText.match(/!/g) || []).length,
            emotion: "neutral",
            pace: "normal"
          }
        });
      }
    }
    // Limpiamos el buffer para el siguiente diálogo
    dialogueBuffer = [];
    dialogueIndent = null;
  };
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const leadingSpaces = (line || '').match(/^ */)[0].length;
    if (!line || line.match(/^\s*$/)) {
      // Línea vacía: puede indicar el final de un bloque de diálogo o de una acotación.
      // Guardamos el diálogo si hay algo en el buffer.
      saveDialogue();
      lastCharacterName = null; // Reseteamos el personaje activo si hay una línea vacía
      continue;
    }
    // 1. Detectar un nuevo encabezado de escena
    if (SCENE_HEADING_REGEX.test(line)) {
      // Finalizar la escena anterior si existe y tiene contenido
      if (currentScene && currentScene.content.length > 0) {
        scenes.push(currentScene);
      }
      // Guardar cualquier diálogo pendiente antes de cambiar de escena
      saveDialogue();
      // Iniciar nueva escena
      sceneCounter++;
      currentScene = {
        scene_number: sceneCounter,
        heading: line,
        content: [],
        order_index: orderIndex++
      };
      lastCharacterName = null;
      continue;
    }
    // Si no hay escena activa, creamos una por defecto (maneja el contenido antes del primer INT/EXT)
    if (!currentScene) {
      currentScene = {
        scene_number: ++sceneCounter,
        heading: "INICIO DEL GUION",
        content: [],
        order_index: orderIndex++
      };
    }
    if (SCENE_NUMBER_REGEX.test(line)) {
      continue;
    }
    // 2. Detectar un Nombre de Personaje
    if (CHARACTER_NAME_REGEX.test(line)) {
      // Guardar el diálogo anterior (si existe)
      saveDialogue();
      // Establecer el nuevo personaje activo
      lastCharacterName = line.trim();
      dialogueIndent = null;
      continue;
    }
    // 3. Detectar Acotación (stage direction): INCLUIR en el diálogo, no ignorar
    // Las acotaciones entre paréntesis se añaden al buffer de diálogo si hay personaje activo
    if (PARENTHETICAL_REGEX.test(line)) {
      if (lastCharacterName) {
        // Include stage direction in dialogue buffer
        dialogueBuffer.push(line.trim());
      }
      continue;
    }
    // 4. Detectar Diálogo
    // Si tenemos un personaje activo y la línea no es una acotación, es diálogo.
    if (lastCharacterName) {
      if (dialogueBuffer.length === 0) {
        dialogueIndent = leadingSpaces;
        dialogueBuffer.push(line.trim());
      } else {
        const indentDrop = leadingSpaces < Math.max(0, (dialogueIndent ?? 0) - 2);
        const looksSceneHeading = SCENE_HEADING_REGEX.test(line.trim());
        const looksCharacter = CHARACTER_NAME_REGEX.test(line.trim());
        if (indentDrop || looksSceneHeading || looksCharacter) {
          saveDialogue();
          lastCharacterName = null;
          if (looksSceneHeading || looksCharacter) {
            idx--;
          }
        } else {
          dialogueBuffer.push(line.trim());
        }
      }
    }
  }
  // Guardar el último diálogo y la última escena
  saveDialogue();
  if (currentScene && currentScene.content.length > 0) {
    scenes.push(currentScene);
  }
  for (const scene of scenes) {
    const merged = [];
    for (const item of scene.content) {
      const last = merged[merged.length - 1];
      if (last && last.characterName === item.characterName) {
        const text = `${last.text} ${item.text}`.replace(/\s+/g, ' ').trim();
        merged[merged.length - 1] = {
          ...last,
          text,
          prosodyHints: {
            hasQuestion: text.includes('?'),
            hasExclamation: text.includes('!'),
            emphasis: (text.match(/!/g) || []).length,
            emotion: 'neutral',
            pace: 'normal'
          }
        };
      } else {
        merged.push(item);
      }
    }
    scene.content = merged;
  }
  return {
    scenes
  };
}

function parseScreenplayFromLayoutAdvanced(layoutPages: Array<{ width: number; height: number; items: Array<{ str: string; x: number; y: number; width: number; fontSize: number }> }>) {
  console.log('🎯 ANALIZANDO FORMATO AVANZADO: Detectando diálogos por posición');
  
  // Patrones mejorados para detección
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|\-|:)\s*$/i;
  const PAGE_NUMBER_REGEX = /^\s*\d+\s*$/; // Números de página solos
  const TIME_WORD_REGEX = /(^|\s)(DÍA|NOCHE)(\s|$)/i; // Palabras de tiempo
  const CHARACTER_NAME_REGEX = /^[A-ZÁÉÍÓÚÑ \-]{2,}$/; // Solo MAYÚSCULAS (espacios/guiones)
  const TRANSITION_REGEX = /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH TO|MATCH CUT)/i;
  
  // Procesar todas las líneas con información de posición
  const allLines: Array<{ 
    text: string; 
    x: number; 
    y: number; 
    page: number; 
    width: number;
    fontSize: number;
    centered: boolean;
    leftAligned: boolean;
    normX: number;
  }> = [];
  
  for (let p = 0; p < layoutPages.length; p++) {
    const page = layoutPages[p];
    const rows: Record<string, Array<{ str: string; x: number; y: number; width: number; fontSize: number }>> = {};
    
    // Agrupar por línea horizontal (misma coordenada Y)
    for (const it of page.items) {
      const yKey = Math.round(it.y);
      (rows[yKey] = rows[yKey] || []).push({ str: it.str, x: it.x, y: it.y, width: it.width, fontSize: it.fontSize });
    }
    
    // Procesar cada línea
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const yKey of rowKeys) {
      const row = rows[String(yKey)].sort((a, b) => a.x - b.x);
      const text = row.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      
      const xMin = row[0].x;
      const pageWidth = page.width;
      const normX = xMin / pageWidth;
      
      // Determinar alineación (tolerancia más amplia para formatos irregulares)
      const centered = normX >= 0.20 && normX <= 0.80;
      const leftAligned = normX < 0.20;
      
      allLines.push({
        text,
        x: xMin,
        y: yKey,
        page: p,
        width: page.width,
        fontSize: row[0].fontSize,
        centered,
        leftAligned,
        normX
      });
    }
  }
  
  // Ordenar por página y posición vertical
  allLines.sort((a, b) => a.page === b.page ? b.y - a.y || a.x - b.x : a.page - b.page);
  
  console.log(`📄 Total de líneas procesadas: ${allLines.length}`);
  
  // Resultados
  const scenes: Array<{ scene_number: number; heading: string; content: Array<{ characterName: string; text: string; prosodyHints: any }>; order_index: number }> = [];
  const structuredLines: Array<{ type: 'scene' | 'character' | 'dialogue' | 'action'; text?: string; name?: string; x?: number; page?: number }> = [];
  
  let currentScene: any = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let activeCharacter: string | null = null;
  let dialogueBuffer: string[] = [];
  let lastDialogueX: number | null = null;
  
  const commitDialogue = () => {
    if (activeCharacter && dialogueBuffer.length > 0 && currentScene) {
      const dialogueText = dialogueBuffer.join(' ').replace(/\s+/g, ' ').trim();
      if (dialogueText.length > 0) {
        currentScene.content.push({
          characterName: activeCharacter,
          text: dialogueText,
          prosodyHints: {
            hasQuestion: dialogueText.includes('?'),
            hasExclamation: dialogueText.includes('!'),
            emphasis: (dialogueText.match(/!/g) || []).length,
            emotion: 'neutral',
            pace: 'normal'
          }
        });
        structuredLines.push({ type: 'dialogue', text: dialogueText, x: lastDialogueX, page: currentPage });
        console.log(`🗣️ Diálogo detectado: ${activeCharacter} - "${dialogueText.substring(0, 50)}..."`);
      }
    }
    dialogueBuffer = [];
    lastDialogueX = null;
  };
  
  let currentPage = 0;
  
  // Procesar cada línea
  for (const line of allLines) {
    const { text, centered, leftAligned, normX, page } = line;
    currentPage = page;
    
    // Ignorar números de página
    if (PAGE_NUMBER_REGEX.test(text) && text.length <= 3) {
      console.log(`📄 Ignorando número de página: "${text}"`);
      continue;
    }
    
    // 1. Detectar encabezado de escena (izquierda) o líneas de tiempo (DÍA/NOCHE) en izquierda
    if ((SCENE_HEADING_REGEX.test(text) && leftAligned) || (TIME_WORD_REGEX.test(text) && leftAligned)) {
      commitDialogue();
      if (currentScene && currentScene.content.length > 0) {
        scenes.push(currentScene);
      }
      activeCharacter = null;
      
      sceneCounter++;
      currentScene = {
        scene_number: sceneCounter,
        heading: text,
        content: [],
        order_index: orderIndex++
      };
      
      structuredLines.push({ type: 'scene', text, x: normX, page });
      console.log(`🎬 Nueva escena detectada: "${text}"`);
      continue;
    }
    
    // 2. Detectar transiciones
    if (TRANSITION_REGEX.test(text.toUpperCase()) && centered) {
      commitDialogue();
      activeCharacter = null;
      console.log(`🔄 Transición detectada: "${text}"`);
      continue;
    }
    
    // 3. Detectar número de escena
    if (SCENE_NUMBER_REGEX.test(text)) {
      commitDialogue();
      activeCharacter = null;
      console.log(`🔢 Número de escena: "${text}"`);
      continue;
    }
    
    // 4. Detectar NOMBRE DE PERSONAJE (en mayúsculas, tolerando margen irregular)
    if (CHARACTER_NAME_REGEX.test(text) && text === text.toUpperCase()) {
      commitDialogue();
      activeCharacter = text.trim();
      
      structuredLines.push({ type: 'character', name: activeCharacter, x: normX, page });
      console.log(`👤 Personaje detectado: "${activeCharacter}" (centrado: ${centered})`);
      continue;
    }
    
    // 5. Detectar DIÁLOGO (sigue a un personaje; tolera márgenes irregulares)
    if (activeCharacter && !leftAligned && !SCENE_HEADING_REGEX.test(text) && !TIME_WORD_REGEX.test(text) && !/^\s*\([^)]*\)\s*$/.test(text)) {
      dialogueBuffer.push(text);
      lastDialogueX = normX;
      continue;
    }
    
    // 6. Acotaciones entre paréntesis (centradas) - INCLUIR en el diálogo si hay personaje activo
    if (text.startsWith('(') && text.endsWith(')') && centered) {
      if (activeCharacter) {
        // Include stage direction in dialogue buffer
        dialogueBuffer.push(text);
        console.log(`📝 Acotación incluida en diálogo: "${text}"`);
      } else {
        console.log(`📝 Acotación sin personaje ignorada: "${text}"`);
      }
      continue;
    }
    
    // 7. Acotaciones/descripciones (alineadas a la izquierda) o paréntesis
    if (leftAligned || /^\s*\([^)]*\)\s*$/.test(text)) {
      commitDialogue();
      activeCharacter = null;
      structuredLines.push({ type: 'action', text, x: normX, page });
      console.log(`📋 Acotación/descripción ignorada: "${text.substring(0, 50)}..."`);
      continue;
    }
    
    // 8. Cualquier otro texto centrado podría ser diálogo si hay personaje activo
    if (activeCharacter && centered) {
      dialogueBuffer.push(text);
      lastDialogueX = normX;
      continue;
    }
    
    // 9. Texto no categorizado - tratar como acotación
    commitDialogue();
    activeCharacter = null;
    console.log(`❓ Texto no categorizado ignorado: "${text.substring(0, 50)}..."`);
  }
  
  // Guardar último diálogo y escena
  commitDialogue();
  if (currentScene && currentScene.content.length > 0) {
    scenes.push(currentScene);
  }
  
  console.log(`✅ ANÁLISIS COMPLETADO:`);
  console.log(`   - Escenas detectadas: ${scenes.length}`);
  console.log(`   - Líneas estructuradas: ${structuredLines.length}`);
  console.log(`   - Total diálogos: ${scenes.reduce((acc, scene) => acc + scene.content.length, 0)}`);
  
  return { scenes, structuredLines };
}

function parseScreenplayFromLayout(layoutPages: Array<{ width: number; height: number; items: Array<{ str: string; x: number; y: number; width: number; fontSize: number }> }>) {
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|-|:)\s*$/i;
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})$/;
  const lines: Array<{ text: string; x: number; y: number; page: number; width: number }> = [];
  for (let p = 0; p < layoutPages.length; p++) {
    const page = layoutPages[p];
    const rows: Record<string, Array<{ str: string; x: number; y: number; width: number }>> = {};
    for (const it of page.items) {
      const yKey = Math.round(it.y);
      const key = String(yKey);
      (rows[key] = rows[key] || []).push({ str: it.str, x: it.x, y: it.y, width: it.width });
    }
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const yKey of rowKeys) {
      const row = rows[String(yKey)].sort((a, b) => a.x - b.x);
      const text = row.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const xMin = row[0].x;
      const width = page.width;
      lines.push({ text, x: xMin, y: yKey, page: p, width });
    }
  }
  lines.sort((a, b) => a.page === b.page ? b.y - a.y || a.x - b.x : a.page - b.page);
  const scenes: Array<{ scene_number: number; heading: string; content: Array<{ characterName: string; text: string; prosodyHints: any }>; order_index: number }> = [];
  const structuredLines: Array<{ type: 'scene' | 'character' | 'dialogue' | 'action'; text?: string; name?: string; x?: number; page?: number }> = [];
  let currentScene: any = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let activeCharacter: string | null = null;
  let dialogueBuffer: string[] = [];
  const commitDialogue = () => {
    if (activeCharacter && dialogueBuffer.length > 0 && currentScene) {
      const t = dialogueBuffer.join(' ').replace(/\s+/g, ' ').trim();
      currentScene.content.push({
        characterName: activeCharacter,
        text: t,
        prosodyHints: {
          hasQuestion: t.includes('?'),
          hasExclamation: t.includes('!'),
          emphasis: (t.match(/!/g) || []).length,
          emotion: 'neutral',
          pace: 'normal'
        }
      });
      structuredLines.push({ type: 'dialogue', text: t });
      dialogueBuffer = [];
    }
  };
  for (const line of lines) {
    const normX = line.x / (line.width || 1);
    const centered = normX >= 0.40 && normX <= 0.60;
    const leftAligned = normX < 0.25;
    const text = line.text;
    if (SCENE_HEADING_REGEX.test(text)) {
      commitDialogue();
      if (currentScene && currentScene.content.length > 0) scenes.push(currentScene);
      sceneCounter++;
      currentScene = { scene_number: sceneCounter, heading: text, content: [], order_index: orderIndex++ };
      structuredLines.push({ type: 'scene', text, x: normX, page: line.page });
      activeCharacter = null;
      continue;
    }
    if (SCENE_NUMBER_REGEX.test(text)) {
      commitDialogue();
      activeCharacter = null;
      continue;
    }
    if (CHARACTER_NAME_REGEX.test(text) && centered) {
      commitDialogue();
      activeCharacter = text.trim();
      structuredLines.push({ type: 'character', name: activeCharacter, x: normX, page: line.page });
      continue;
    }
    if (activeCharacter && centered) {
      dialogueBuffer.push(text);
      structuredLines.push({ type: 'dialogue', text, x: normX, page: line.page });
      continue;
    }
    // Acción/descripción
    commitDialogue();
    if (currentScene) {
      currentScene.content.push({
        characterName: 'ACCIÓN',
        text,
        prosodyHints: {
          hasQuestion: false,
          hasExclamation: false,
          emphasis: 0,
          emotion: 'neutral',
          pace: 'normal'
        }
      });
    }
    structuredLines.push({ type: 'action', text, x: normX, page: line.page });
    activeCharacter = null;
  }
  commitDialogue();
  if (currentScene && currentScene.content.length > 0) scenes.push(currentScene);
  return { scenes, structuredLines };
}

// Fallback básico: extrae líneas en MAYÚSCULAS como personaje y siguientes líneas como diálogo hasta línea vacía
function simpleRegexFallback(rawText: string) {
  const lines = String(rawText || '').split(/\r?\n/);
  const dialogues: Array<{ character: string; dialogue: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const l = (lines[i] || '').trim();
    if (/^[A-ZÁÉÍÓÚÑ0-9 \-]{2,}$/.test(l) && l === l.toUpperCase()) {
      const character = l;
      i++;
      const buff: string[] = [];
      while (i < lines.length && (lines[i] || '').trim() !== '' && !/^[A-ZÁÉÍÓÚÑ0-9 \-]{2,}$/.test((lines[i] || '').trim())) {
        const ln = (lines[i] || '').trim();
        if (!/^\(.*\)$/.test(ln)) buff.push(ln);
        i++;
      }
      const dialogue = buff.join(' ').replace(/\s+/g, ' ').trim();
      if (dialogue) dialogues.push({ character, dialogue });
    } else {
      i++;
    }
  }
  return {
    success: true,
    sceneCount: dialogues.length,
    scenes: dialogues.map((d, idx) => ({ character: d.character, dialogue: d.dialogue, sceneNumber: idx + 1 })),
    fallbackUsed: true,
  };
}

async function callOpenAIExtract(text: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const systemPrompt = `You are a reliable script parser. Given raw text extracted from a screenplay PDF, return a JSON object with dialogues AND action lines.
Rules:
- Ignore scene headers (INT./EXT., DAY, NIGHT, etc.).
- Ignore parenthetical directions (e.g., (whispering)) if they are standalone, or include them in the dialogue.
- Extract action lines and assign the characterName "ACCIÓN" to them.
- Identify character names (usually uppercase) and associate the immediate following lines as that character's dialogue.
- Output a JSON with top-level keys: success (bool), sceneCount (number), scenes (array).
- scenes: each item { character: "NAME", dialogue: "line text", sceneNumber: n }. For actions, character should be "ACCIÓN".
- If you are not certain, try conservative extraction (better to omit ambiguous text than include wrong dialogue).
Return ONLY the JSON object — no extra text.`;
  const userPrompt = `\nParse the following text and extract dialogues only. Preserve the order. Text below:\n---\n${text}\n---`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.0,
      max_tokens: 1500,
    }),
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${txt}`);
  }
  const j = await response.json();
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI response empty');
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    const cleaned = String(content).replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  }
  return parsed;
}
// Fallback: ignorar márgenes y construir diálogos por mayúsculas y salto de línea
function fallbackBuildDialoguesFromText(fullText: string) {
  const lines = String(fullText || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
  const CHARACTER_NAME_REGEX = /^[A-ZÁÉÍÓÚÑ \-]{2,}$/;
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const TIME_WORD_REGEX = /(^|\s)(DÍA|NOCHE)(\s|$)/i;
  const PAGE_NUMBER_REGEX = /^\s*\d+\s*$/;
  const scenes: Array<{ scene_number: number; heading: string; content: Array<{ characterName: string; text: string }>; order_index: number }> = [];
  const structuredLines: Array<{ type: 'scene' | 'character' | 'dialogue' | 'action'; text?: string; name?: string }> = [];

  let sceneCounter = 0;
  let orderIndex = 0;
  let currentScene: any = { scene_number: ++sceneCounter, heading: 'INICIO', content: [], order_index: orderIndex++ };
  let activeCharacter: string | null = null;
  let buffer: string[] = [];

  const commit = () => {
    if (activeCharacter && buffer.length > 0) {
      const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        currentScene.content.push({ characterName: activeCharacter!, text });
        structuredLines.push({ type: 'dialogue', text });
      }
    }
    buffer = [];
  };

  for (const raw of lines) {
    if (!raw) { commit(); activeCharacter = null; continue; }
    if (PAGE_NUMBER_REGEX.test(raw)) { continue; }
    if (SCENE_HEADING_REGEX.test(raw) || TIME_WORD_REGEX.test(raw)) {
      commit();
      if (currentScene.content.length > 0) scenes.push(currentScene);
      currentScene = { scene_number: ++sceneCounter, heading: raw, content: [], order_index: orderIndex++ };
      structuredLines.push({ type: 'scene', text: raw });
      activeCharacter = null;
      continue;
    }
    if (/^\s*\([^)]*\)\s*$/.test(raw)) { continue; }
    if (CHARACTER_NAME_REGEX.test(raw) && raw === raw.toUpperCase()) {
      commit();
      activeCharacter = raw.trim();
      structuredLines.push({ type: 'character', name: activeCharacter });
      continue;
    }
    if (activeCharacter) {
      buffer.push(raw);
    } else {
      commit();
      currentScene.content.push({ characterName: 'ACCIÓN', text: raw });
      structuredLines.push({ type: 'action', text: raw });
    }
  }

  commit();
  if (currentScene.content.length > 0) scenes.push(currentScene);
  return { scenes, structuredLines };
}
