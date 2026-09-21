const { extractPdfText, extractPdfLayoutText } = require('./pdfText');
const { sanitizeParsedScript } = require('./scriptSanitizer');
const { redactSecrets } = require('./env');
const mammoth = require('mammoth');
const { repairEmptyParentheticals } = require('./textRepair');

// Same figure as API_COSTS.openai_analysis in index.js (EUR per token).
const OPENAI_ANALYSIS_EUR_PER_TOKEN = 0.000005;

// Writes to the real columns of `api_usage` (see migration 20260716113000): tokens_count, mode,
// estimated_cost_eur... This helper used to insert `tokens_used` / `action_type`, which do not exist,
// so every insert failed silently and the analysis cost was never recorded.
async function logApiUsage(supabase, { user_id, provider, tokens_used = 0, script_id, action_type }) {
    try {
        const { error } = await supabase.from('api_usage').insert({
            user_id: user_id || null,
            provider,
            tokens_count: tokens_used,
            estimated_cost_eur: tokens_used * OPENAI_ANALYSIS_EUR_PER_TOKEN,
            script_id: script_id || null,
            mode: action_type || null,
        });
        if (error) console.warn('Failed to log API usage:', error);
    } catch (e) {
        console.warn('Failed to log API usage:', e);
    }
}

async function parseScreenplayWithOpenAI(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const systemPrompt = `You are an expert screenplay parser. Your job is to extract dialogues AND action lines from a screenplay into JSON format. The screenplay is usually in Spanish.

    HOW A SCREENPLAY IS LAID OUT (the text keeps the original horizontal indentation when available):
    - CHARACTER NAMES are written in CAPITAL LETTERS, centered or indented far from the left margin, alone on their line, right before their dialogue.
    - DIALOGUE is the indented block under a character name.
    - ACTION LINES (what is seen or happens) sit at the LEFT MARGIN, not indented, in normal sentence case.
    - SCENE HEADERS start with INT./EXT.

    CRITICAL RULES:
    1. Extract ALL dialogues and ALL action lines, in the exact order they appear. Never reorder, merge across characters, summarize or invent. Copy the text verbatim.
    2. Ignore ONLY scene headers (INT./EXT.), transitions (CORTE A:, FADE OUT), page numbers and (MORE)/(CONTINUED) markers.
    3. CHARACTERS: only a name that is followed by spoken dialogue is a character. Output the bare name, e.g. "JUAN".
    4. (CONT'D) / (cont'd) / (CONT.) / (V.O.) / (O.S.) / (O.C.) written after a name are NOT part of the name and do NOT mean a new character. "JUAN (cont'd)" is just JUAN continuing to speak: output characterName "JUAN".
    5. ACTION LINES: every paragraph at the left margin is an action. Set "characterName" to "ACCIÓN" and "text" to the paragraph. Each action paragraph is its own entry. NEVER put action text inside a dialogue and NEVER attribute an action paragraph to a character, even if it mentions that character or comes right after their line. A dialogue ends where the next left-margin paragraph, character name or scene header begins.
    6. IGNORE the cover / title page: title, author ("Escrito por"), production companies, logos, foundations, emails, phone numbers, websites, dates. They are NOT characters and NOT actions. Only the story starts at the first scene header.
    7. INCLUDE parentheticals (stage directions like (susurrando) written under a character name) IN THE DIALOGUE TEXT. DO NOT extract them as action lines.
       Example: "(susurrando) Esto es un secreto." -> dialogue text: "(susurrando) Esto es un secreto."
    8. Parentheses inside an action paragraph, such as ages "PABLO (14)", stay in the action text.

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
    - Each content block must have characterName and text
    - Set hasQuestion=true if dialogue ends with "?"
    - Set hasExclamation=true if dialogue contains "!"`;

    const textToSend = text.substring(0, 50000);
    const fetch = require('node-fetch');
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
                { role: 'user', content: `Extract all dialogues and actions from this screenplay (the horizontal indentation of the original page is preserved when available):\n\n${textToSend}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return { parsed: JSON.parse(data.choices[0]?.message?.content || '{}'), tokens: data.usage?.total_tokens || 0 };
}

function parseScreenplay(text) {
  const cleanedText = text.replace(/(\r\n|\n|\r){2,}/g, '\n\n').trim();
  const lines = text.split('\n').map((line)=>line.trimEnd());
  const scenes = [];
  let currentScene = null;
  let sceneCounter = 0;
  let orderIndex = 0;
  let lastCharacterName = null;
  let dialogueBuffer = [];
  let dialogueIndent = null;
  
  const CHARACTER_NAME_REGEX = /^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})(?:\s*\([^)]*\))?$/;
  const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|INTERIOR|EXTERIOR)/i;
  const SCENE_NUMBER_REGEX = /^\s*\d+(\.|-|:)\s*$/i;
  const PARENTHETICAL_REGEX = /^\s*(\([^\)]+\))$/;
  
  const saveDialogue = ()=>{
    if (lastCharacterName && dialogueBuffer.length > 0 && currentScene) {
      const dialogueText = dialogueBuffer.join(' ').replace(/\s+/g, ' ').trim();
      if (dialogueText.length > 0) {
        currentScene.content.push({
          characterName: lastCharacterName,
          text: dialogueText,
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
    dialogueBuffer = [];
    dialogueIndent = null;
  };
  
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const leadingSpaces = (line || '').match(/^ */)[0].length;
    if (!line || line.match(/^\s*$/)) {
      saveDialogue();
      lastCharacterName = null;
      continue;
    }
    if (SCENE_HEADING_REGEX.test(line)) {
      if (currentScene && currentScene.content.length > 0) {
        scenes.push(currentScene);
      }
      saveDialogue();
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
    if (!currentScene) {
      currentScene = {
        scene_number: ++sceneCounter,
        heading: "INICIO DEL GUION",
        content: [],
        order_index: orderIndex++
      };
    }
    if (SCENE_NUMBER_REGEX.test(line)) continue;
    if (CHARACTER_NAME_REGEX.test(line)) {
      saveDialogue();
      lastCharacterName = line.trim();
      dialogueIndent = null;
      continue;
    }
    if (PARENTHETICAL_REGEX.test(line)) {
      if (lastCharacterName) dialogueBuffer.push(line.trim());
      continue;
    }
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
          if (looksSceneHeading || looksCharacter) idx--;
        } else {
          dialogueBuffer.push(line.trim());
        }
      }
    }
  }
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
        merged[merged.length - 1] = { ...last, text };
      } else {
        merged.push(item);
      }
    }
    scene.content = merged;
  }
  return { scenes };
}

module.exports = {
  setupParsePdf: (app, supabase, requireUser = (req, res, next) => next()) => {
    app.post('/api/parse-pdf', requireUser, async (req, res) => {
      try {
        const { scriptId, fileContent, filePath, fileName, text: rawText, preserveFormatting } = req.body;
        const authHeader = req.headers.authorization;
        let text = "";
        let layoutText = null; // same text with its indentation (PDF + poppler only), for OpenAI

        if (rawText && rawText.trim().length > 0) {
          text = rawText;
        } else {
          let fileBuffer = null;
          if (filePath) {
            const { data, error } = await supabase.storage.from("scripts").download(filePath);
            if (error) throw error;
            fileBuffer = Buffer.from(await data.arrayBuffer());
          } else if (fileContent) {
            let base64Data = fileContent;
            if (typeof base64Data === "string" && base64Data.startsWith("data:")) {
              base64Data = fileContent.split(",")[1] ?? "";
            }
            fileBuffer = Buffer.from(base64Data || "", 'base64');
          } else {
            throw new Error("No filePath, fileContent, or raw text provided");
          }

          if (!fileBuffer || fileBuffer.byteLength === 0) {
            throw new Error("File buffer is empty or invalid");
          }

          const isDocx = fileName && fileName.toLowerCase().endsWith('.docx');
          if (isDocx) {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            if (!result || !result.value || result.value.trim().length === 0) {
              throw new Error("Failed to extract text from DOCX");
            }
            text = result.value;
          } else {
            const extracted = await extractPdfText(fileBuffer);
            if (!extracted.text || extracted.text.trim().length === 0) {
              throw new Error("Failed to extract text from PDF");
            }
            console.log(`PDF text extracted with ${extracted.engine}`);
            text = extracted.text;
            layoutText = await extractPdfLayoutText(fileBuffer);
          }
        }

        text = repairEmptyParentheticals(text);
        if (layoutText) layoutText = repairEmptyParentheticals(layoutText);

        // Owner of the script, to attribute the OpenAI usage to them (shown in /usage/summary)
        let ownerId = null;
        try {
          const { data: owner } = await supabase.from("scripts").select("user_id").eq("id", scriptId).single();
          ownerId = owner?.user_id ?? null;
        } catch (ownerError) {
          console.warn("Could not resolve script owner for usage logging:", ownerError && ownerError.message);
        }

        // STEP 1: Save raw text
        console.log("Saving raw text to script_raw...");
        await supabase
          .from("scripts")
          .update({ script_raw: text, parsed_text: text })
          .eq("id", scriptId);

        // STEP 2: HTML Conversion
        if (!preserveFormatting) {
          const openaiApiKey = process.env.OPENAI_API_KEY;
          if (openaiApiKey) {
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
              const fetch = require('node-fetch');
              const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: "Eres un experto en formateo de guiones cinematográficos. Conviertes texto plano en HTML profesional siguiendo estándares de screenplay." },
                    { role: "user", content: prompt }
                  ],
                  temperature: 0.3,
                  max_tokens: 16000
                })
              });

              if (openaiResponse.ok) {
                const openaiData = await openaiResponse.json();
                const htmlContent = openaiData.choices[0]?.message?.content || "";
                
                await logApiUsage(supabase, {
                  user_id: ownerId,
                  provider: 'openai_analysis',
                  tokens_used: openaiData.usage?.total_tokens || 0,
                  script_id: scriptId,
                  action_type: 'parse-pdf-html'
                });

                if (htmlContent) {
                  await supabase.from("scripts").update({ script_html: htmlContent }).eq("id", scriptId);
                }
              }
            } catch (openaiError) {
              console.error("Error converting to HTML:", redactSecrets(openaiError && openaiError.message));
            }
          }
        }

        // STEP 4: Parse scenes and lines
        let parsed;
        let parserUsed = 'openai';
        try {
          const res = await parseScreenplayWithOpenAI(layoutText || text);
          parsed = res.parsed;
          await logApiUsage(supabase, {
            user_id: ownerId,
            provider: 'openai_analysis',
            tokens_used: res.tokens || 0,
            script_id: scriptId,
            action_type: 'parse-pdf-structured'
          });
        } catch (openaiError) {
          // The local parser is much less accurate (no action cards, any UPPERCASE line becomes a
          // character), so make it very visible in the logs when it is the one being used.
          console.error("⚠️ OpenAI parsing failed, FALLING BACK to the local regex parser (lower quality):", redactSecrets(openaiError && openaiError.message));
          parsed = parseScreenplay(text);
          parserUsed = 'fallback-regex';
        }

        const sanitized = sanitizeParsedScript(parsed);
        parsed = { scenes: sanitized.scenes };
        console.log(`Parsed with ${parserUsed}: ${parsed.scenes.length} scenes, ${sanitized.dropped} entries dropped by the sanitizer`);

        await supabase.from('scenes').delete().eq('script_id', scriptId);

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
            sarcastic:  [/sarcástic/i, /sarcastic/i, /ironía/i, /irónic/i],
            curious:    [/curios/i, /intrigad/i],
            mischievous:[/travies/i, /pícar/i, /juguetón/i],
            sighing:    [/suspir/i, /resopl/i],
            breathless: [/sin aliento/i, /jade/i, /asfixiad/i],
            hesitant:   [/dudad/i, /dudando/i, /tartamud/i, /vacil/i],
            resigned:   [/resignad/i, /vencid/i, /abatid/i],
            cheerful:   [/alegr/i, /content/i, /feliz/i],
            deadpan:    [/monóton/i, /plano/i, /inexpresiv/i, /seco/i],
            playful:    [/juguetón/i, /brome/i],
            surprised:  [/sorprendid/i, /asombrad/i, /estupefact/i, /jadeo/i],
            nervous:    [/nervios/i, /traga saliva/i, /ansios/i],
            clears_throat: [/aclara/i, /carraspe/i, /garganta/i],
            desperate:  [/desesperad/i, /angustiad/i],
            threatening:[/amenaz/i, /intimid/i],
            pleading:   [/suplic/i, /rog/i, /ruego/i],
            proud:      [/orgullos/i, /altiv/i, /soberbi/i],
            embarrassed:[/avergonzad/i, /ruborizad/i, /cortad/i],
            exhausted:  [/agotad/i, /cansad/i, /exhaust/i, /fatigad/i],
            jealous:    [/celos/i, /envidi/i, /despechad/i],
            hopeful:    [/esperanzad/i, /ilusionad/i, /optimist/i],
            confused:   [/confundid/i, /desconcertad/i, /perplej/i],
            neutral:    [],
        };

        function extractEmotionFromText(rawText) {
            const bracketMatch = rawText.match(/[\(\[]([^\)\]]+)[\)\]]/);
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

        for (const scene of (parsed.scenes || [])) {
            let sceneContentText = scene.content && Array.isArray(scene.content)
                ? scene.content.map(c => `${c.characterName}: ${c.text}`).join('\n')
                : '';
            
            if (!sceneContentText || sceneContentText.trim() === '') {
                sceneContentText = '[Sin contenido]';
            }

            const { data: sceneData, error: sceneError } = await supabase
                .from('scenes')
                .insert({
                    script_id: scriptId,
                    scene_number: scene.scene_number,
                    heading: scene.heading || 'ESCENA SIN TÍTULO',
                    order_index: scene.order_index,
                    content: sceneContentText
                })
                .select()
                .single();

            if (sceneError) throw sceneError;

            if (scene.content && scene.content.length > 0) {
                const linesToInsert = scene.content.map((line, idx) => {
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

                const { error: linesError } = await supabase
                    .from('lines')
                    .insert(linesToInsert);

                if (linesError) throw linesError;
            }
        }

        res.json({
            success: true,
            message: "Script processed successfully.",
            sceneCount: (parsed.scenes || []).length,
            parser: parserUsed
        });
      } catch (error) {
        console.error("Error parsing PDF:", error);
        res.status(500).json({
            error: error.message || "Unknown error",
            hint: "Check server logs."
        });
      }
    });
  }
};
