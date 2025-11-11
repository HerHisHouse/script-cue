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
      const parsedPdf = await pdfParse(pdfBuffer);
      if (!parsedPdf || !parsedPdf.text || parsedPdf.text.trim().length === 0) {
        throw new Error("Failed to extract text from PDF");
      }
      text = parsedPdf.text;
    }
    const parsed = parseScreenplay(text);
    await supabase.from("scripts").update({
      parsed_text: text,
      metadata: {
        sceneCount: parsed.scenes.length
      }
    }).eq("id", scriptId);
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
  // Patrones de RegEx
  // A. Nombre de Personaje: Línea que contiene solo MAYÚSCULAS, números, espacios y guiones.
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})$/;
  // B. Encabezado de Escena (para iniciar una nueva escena)
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
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
  };
  for (const line of lines){
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
    // 2. Detectar un Nombre de Personaje
    if (CHARACTER_NAME_REGEX.test(line)) {
      // Guardar el diálogo anterior (si existe)
      saveDialogue();
      // Establecer el nuevo personaje activo
      lastCharacterName = line.trim();
      continue;
    }
    // 3. Detectar Acotación
    if (PARENTHETICAL_REGEX.test(line)) {
      continue;
    }
    // 4. Detectar Diálogo
    // Si tenemos un personaje activo y la línea no es una acotación, es diálogo.
    if (lastCharacterName) {
      dialogueBuffer.push(line);
    }
  }
  // Guardar el último diálogo y la última escena
  saveDialogue();
  if (currentScene && currentScene.content.length > 0) {
    scenes.push(currentScene);
  }
  return {
    scenes
  };
} // Nota: Esta función reemplaza la función parseScreenplay existente en tu index.ts.
 // Debes asegurarte de que la llamada a esta función en la línea 94 de tu index.ts
 // (`const parsed = parseScreenplay(text);`) permanezca igual.
