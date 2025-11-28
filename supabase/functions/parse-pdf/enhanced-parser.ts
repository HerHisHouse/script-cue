// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
// Robust PDF text extraction
import pdfParse from "npm:pdf-parse@1.1.1";

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

    const { scriptId, fileContent, filePath, fileName, skipCharacterDetection, text: rawText } = await req.json();
    let text = "";
    let layoutPages: Array<{ width: number; height: number; items: Array<{ str: string; x: number; y: number; width: number; fontSize: number }> }> = [];
    
    // Support raw text directly (OCR/scanned images flow)
    if (rawText && rawText.trim().length > 0) {
      text = rawText;
    } else {
      // Extract text from PDF
      let pdfBuffer = null;
      if (filePath) {
        const { data, error } = await supabase.storage.from("scripts").download(filePath);
        if (error) throw error;
        if (typeof data.arrayBuffer === "function") {
          const buf = await data.arrayBuffer();
          pdfBuffer = new Uint8Array(buf);
        } else if (typeof data.stream === "function") {
          // Edge: some environments return a Response-like object
          const respBuf = await data.arrayBuffer();
          pdfBuffer = new Uint8Array(respBuf);
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
        pdfBuffer = bytes;
      } else {
        throw new Error("No filePath, fileContent, or raw text provided");
      }
      
      // Validate before parsing
      if (!pdfBuffer || pdfBuffer.byteLength === 0) {
        throw new Error("PDF buffer is empty or invalid");
      }
      
      const parsedPdf = await pdfParse(pdfBuffer, {
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
    
    // Parse with enhanced layout detection
    let parsed = parseScreenplay(text);
    let structuredLines: Array<{ type: 'scene' | 'character' | 'dialogue' | 'action'; text?: string; name?: string; x?: number; page?: number; fontSize?: number; originalText?: string }> = [];
    
    try {
      if (layoutPages.length > 0) {
        const layoutResult = parseScreenplayFromLayoutEnhanced(layoutPages);
        if (layoutResult && layoutResult.scenes && layoutResult.scenes.length > 0) {
          parsed = { scenes: layoutResult.scenes } as any;
          structuredLines = layoutResult.structuredLines;
        }
      }
    } catch (error) {
      console.error("Error in enhanced layout parsing:", error);
    }
    
    // Store results with enhanced metadata
    await supabase.from("scripts").update({
      parsed_text: text,
      metadata: {
        sceneCount: parsed.scenes.length,
        structuredLines,
        hasLayoutData: layoutPages.length > 0,
        parsingVersion: "2.0-enhanced"
      }
    }).eq("id", scriptId);
    
    // Store scenes
    for (const scene of parsed.scenes){
      await supabase.from("scenes").insert({
        script_id: scriptId,
        scene_number: scene.scene_number,
        heading: scene.heading,
        content: scene.content,
        order_index: scene.order_index
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      sceneCount: parsed.scenes.length,
      hasLayoutData: layoutPages.length > 0
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

/**
 * Enhanced screenplay parser with advanced stage direction detection
 * This version better handles stage directions after dialogue with left alignment
 */
function parseScreenplayFromLayoutEnhanced(layoutPages: Array<{ 
  width: number; 
  height: number; 
  items: Array<{ str: string; x: number; y: number; width: number; fontSize: number }> 
}>) {
  
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|\-|:)\s*$/i;
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-\.]{2,40})(?:\s*\([^)]*\))?$/;
  const PAGE_NUMBER_REGEX = /^\s*\d+\s*$/;
  const TRANSITION_REGEX = /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT)/i;
  
  // Enhanced patterns for stage direction detection
  const STAGE_DIRECTION_INDICATORS = [
    /^\s*\([^)]*\)\s*$/,           // Parentheses
    /^\s*[a-záéíóúñ][a-z\s,]*\s*$/i, // Starts with lowercase
    /^\s*(he|she|they|we|it)\s+/i,   // Pronoun starts
    /^\s*(suspira|mira|camina|se\s|la|el|un|una)\s+/i, // Spanish action words
    /\s*\([^)]*\)\s*$/,              // Ends with parentheses
    /^(beat|pause|silence|quiet)\s*$/i // English stage terms
  ];
  
  const lines: Array<{ 
    text: string; 
    x: number; 
    y: number; 
    page: number; 
    width: number; 
    fontSize: number;
    isAllCaps: boolean;
    hasParentheses: boolean;
  }> = [];
  
  // Process pages and extract lines with enhanced metadata
  for (let p = 0; p < layoutPages.length; p++) {
    const page = layoutPages[p];
    const rows: Record<string, Array<{ str: string; x: number; y: number; width: number; fontSize: number }>> = {};
    
    // Group text items by vertical position (Y coordinate)
    for (const it of page.items) {
      const yKey = Math.round(it.y);
      const key = String(yKey);
      (rows[key] = rows[key] || []).push({ 
        str: it.str, 
        x: it.x, 
        y: it.y, 
        width: it.width, 
        fontSize: it.fontSize 
      });
    }
    
    // Process each row
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const yKey of rowKeys) {
      const row = rows[String(yKey)].sort((a, b) => a.x - b.x);
      const text = row.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      
      const xMin = row[0].x;
      const avgFontSize = row.reduce((sum, r) => sum + r.fontSize, 0) / row.length;
      const width = page.width;
      
      // Enhanced text analysis
      const isAllCaps = text === text.toUpperCase() && text.length > 1;
      const hasParentheses = text.includes('(') && text.includes(')');
      
      lines.push({ 
        text, 
        x: xMin, 
        y: yKey, 
        page: p, 
        width,
        fontSize: avgFontSize,
        isAllCaps,
        hasParentheses
      });
    }
  }
  
  // Sort lines by page and vertical position
  lines.sort((a, b) => a.page === b.page ? b.y - a.y || a.x - b.x : a.page - b.page);
  
  const scenes: Array<{ 
    scene_number: number; 
    heading: string; 
    content: Array<{ characterName: string; text: string; prosodyHints: any }>; 
    order_index: number 
  }> = [];
  
  const structuredLines: Array<{ 
    type: 'scene' | 'character' | 'dialogue' | 'action'; 
    text?: string; 
    name?: string; 
    x?: number; 
    page?: number; 
    fontSize?: number; 
    originalText?: string;
    isStageDirection?: boolean;
  }> = [];
  
  let currentScene: any = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let activeCharacter: string | null = null;
  let dialogueBuffer: Array<{ text: string; x: number; fontSize: number; y: number }> = [];
  let lastDialogueX: number | null = null;
  let lastDialogueFontSize: number | null = null;
  let lastDialogueY: number | null = null;
  
  const commitDialogue = () => {
    if (activeCharacter && dialogueBuffer.length > 0 && currentScene) {
      const fullText = dialogueBuffer.map(d => d.text).join(' ').replace(/\s+/g, ' ').trim();
      if (fullText.length > 0) {
        currentScene.content.push({
          characterName: activeCharacter,
          text: fullText,
          prosodyHints: {
            hasQuestion: fullText.includes("?"),
            hasExclamation: fullText.includes("!"),
            emphasis: (fullText.match(/!/g) || []).length,
            emotion: 'neutral',
            pace: 'normal'
          }
        });
        
        // Save each dialogue line with original coordinates
        dialogueBuffer.forEach(line => {
          structuredLines.push({ 
            type: 'dialogue', 
            text: line.text, 
            x: line.x, 
            page: line.page,
            fontSize: line.fontSize,
            originalText: line.text
          });
        });
      }
      dialogueBuffer = [];
      lastDialogueX = null;
      lastDialogueFontSize = null;
      lastDialogueY = null;
    }
  };
  
  // Enhanced line classification
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normX = line.x / (line.width || 1);
    const centered = normX >= 0.38 && normX <= 0.62; // Slightly wider range
    const leftAligned = normX < 0.30;
    const rightAligned = normX > 0.70;
    const text = line.text;
    const fontSize = line.fontSize;
    const y = line.y;
    
    // Filter unwanted elements
    if (SCENE_HEADING_REGEX.test(text) || SCENE_NUMBER_REGEX.test(text) || PAGE_NUMBER_REGEX.test(text) || TRANSITION_REGEX.test(text)) {
      commitDialogue();
      if (SCENE_HEADING_REGEX.test(text)) {
        if (currentScene && currentScene.content.length > 0) scenes.push(currentScene);
        sceneCounter++;
        currentScene = { scene_number: sceneCounter, heading: text, content: [], order_index: orderIndex++ };
        structuredLines.push({ type: 'scene', text, x: normX, page: line.page, fontSize });
      }
      activeCharacter = null;
      continue;
    }
    
    // Enhanced character detection
    const isLikelyCharacter = CHARACTER_NAME_REGEX.test(text) && 
                              (centered || (line.isAllCaps && normX > 0.35)) && 
                              fontSize >= 11 &&
                              text.length <= 40;
    
    if (isLikelyCharacter) {
      commitDialogue();
      activeCharacter = text.trim();
      structuredLines.push({ type: 'character', name: activeCharacter, x: normX, page: line.page, fontSize });
      continue;
    }
    
    // Enhanced dialogue vs stage direction detection
    if (activeCharacter) {
      // Check if this is a continuation of dialogue
      const continuingDialogue = centered && 
        (lastDialogueX === null || Math.abs(normX - lastDialogueX) < 0.20) &&
        (lastDialogueFontSize === null || Math.abs(fontSize - lastDialogueFontSize) < 2) &&
        !line.hasParentheses; // Dialogue shouldn't have parentheses
      
      // Enhanced stage direction detection
      const isStageDirection = leftAligned && (
        // Post-dialogue stage direction indicators
        (lastDialogueX !== null && normX < 0.35) || // Significantly left of last dialogue
        line.hasParentheses || // Has parentheses
        !line.isAllCaps || // Not all caps
        STAGE_DIRECTION_INDICATORS.some(pattern => pattern.test(text)) || // Matches stage direction patterns
        (text.length < 60 && text.match(/^[a-záéíóúñ]/i)) || // Short and starts with lowercase
        (text.includes('(') && text.includes(')')) // Contains parentheses anywhere
      );
      
      if (continuingDialogue && !isStageDirection) {
        // Valid dialogue continuation
        dialogueBuffer.push({ text, x: normX, fontSize, y, page: line.page });
        lastDialogueX = normX;
        lastDialogueFontSize = fontSize;
        lastDialogueY = y;
        continue;
      } else if (isStageDirection) {
        // Stage direction - treat as action but keep character context
        if (dialogueBuffer.length > 0) {
          // If we have dialogue buffer, this is post-dialogue stage direction
          structuredLines.push({ 
            type: 'action', 
            text, 
            x: normX, 
            page: line.page, 
            fontSize,
            isStageDirection: true
          });
        } else {
          // Regular action
          structuredLines.push({ type: 'action', text, x: normX, page: line.page, fontSize });
        }
        // Keep activeCharacter for potential dialogue after this stage direction
        continue;
      }
    }
    
    // If not dialogue, it's action/description
    commitDialogue();
    structuredLines.push({ type: 'action', text, x: normX, page: line.page, fontSize });
    activeCharacter = null;
  }
  
  commitDialogue();
  if (currentScene && currentScene.content.length > 0) scenes.push(currentScene);
  
  return { scenes, structuredLines };
}

/**
 * Función mejorada para analizar el texto plano de un guion y extraer los diálogos.
 * Esta versión maneja mejor los bloques de diálogo que ocupan varias líneas
 * y filtra las acotaciones entre paréntesis.
 * @param text El contenido completo del guion en texto plano.
 * @returns Un objeto con un array de escenas estructuradas.
 */ 
function parseScreenplay(text) {
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
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|\-|:)\s*$/i;
  // C. Acotación: Texto entre paréntesis, incluyendo (CONT'D) o (O.S.)
  const PARENTHETICAL_REGEX = /^\s*(\([^)]*\))$/;
  
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
    
    // 3. Detectar Acotación
    if (PARENTHETICAL_REGEX.test(line)) {
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
  
  // Merge consecutive dialogue blocks from the same character
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