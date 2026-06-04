const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '200mb' })); // Increased for large video files
app.use('/download', express.static(path.join(__dirname, 'public'))); // Serve processed videos

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

console.log('🚀 Server starting - Version: AUDIO_NORM_V4 - Date:', new Date().toISOString());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Merge endpoint
app.post('/merge', async (req, res) => {
    const { segments, userId, scriptId } = req.body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
        return res.status(400).json({ error: 'Invalid segments array' });
    }

    if (!userId || !scriptId) {
        return res.status(400).json({ error: 'Missing userId or scriptId' });
    }

    const tempDir = path.join(__dirname, 'temp', `${Date.now()}`);
    const listFile = path.join(tempDir, 'list.txt');
    const outputFile = path.join(tempDir, 'output.m4a');

    try {
        // Create temp directory
        await fs.promises.mkdir(tempDir, { recursive: true });

        console.log(`[Merge] Processing ${segments.length} segments for user ${userId}`);
        console.log('[Merge] Segments:', JSON.stringify(segments, null, 2));

        // Download all segments
        const downloadedFiles = [];
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            // Preserve original extension
            const extension = segment.path.endsWith('.mp3') ? 'mp3' : 'm4a';
            const localPath = path.join(tempDir, `segment_${i}.${extension}`);

            console.log(`[Merge] Downloading segment ${i + 1}/${segments.length}: ${segment.path}`);

            // Download from Supabase Storage
            const { data, error } = await supabase.storage
                .from('recordings')
                .download(segment.path);

            if (error) {
                throw new Error(`Failed to download segment ${i}: ${error.message}`);
            }

            // Write to local file
            const arrayBuffer = await data.arrayBuffer();
            await fs.promises.writeFile(localPath, Buffer.from(arrayBuffer));
            downloadedFiles.push(localPath);
        }



        // Run FFmpeg with concat filter (more robust for mixed formats)
        await new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Add all inputs
            downloadedFiles.forEach(file => {
                command.input(file);
            });

            // Construct complex filter for concatenation
            // [0:a][1:a][2:a]concat=n=3:v=0:a=1[outa]
            const inputLabels = downloadedFiles.map((_, i) => `[${i}:a]`).join('');

            command
                .complexFilter(`${inputLabels}concat=n=${downloadedFiles.length}:v=0:a=1[outa]`)
                .map('[outa]')
                .audioCodec('aac')
                .audioBitrate('128k')
                .audioChannels(1)
                .audioFrequency(44100)
                .output(outputFile)
                .on('start', (cmd) => {
                    console.log('[FFmpeg] Command:', cmd);
                })
                .on('progress', (progress) => {
                    console.log(`[FFmpeg] Processing: ${progress.percent?.toFixed(1)}%`);
                })
                .on('end', () => {
                    console.log('[FFmpeg] Merge completed');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('[FFmpeg] Error:', err);
                    reject(err);
                })
                .run();
        });

        // Upload merged file to Supabase
        const mergedFileName = `${userId}/${Date.now()}_merged.m4a`;
        const mergedBuffer = await fs.promises.readFile(outputFile);

        console.log('[Merge] Uploading merged file to Supabase...');

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('recordings')
            .upload(mergedFileName, mergedBuffer, {
                contentType: 'audio/m4a',
                upsert: false
            });

        if (uploadError) {
            throw new Error(`Failed to upload merged file: ${uploadError.message}`);
        }

        console.log('[Merge] Success! File uploaded:', mergedFileName);

        // Cleanup temp files
        await fs.promises.rm(tempDir, { recursive: true, force: true });

        // Return success with file path
        res.json({
            success: true,
            path: mergedFileName,
            segmentCount: segments.length
        });

    } catch (error) {
        console.error('[Merge] Error:', error);

        // Cleanup on error
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch { }

        res.status(500).json({
            error: 'Merge failed',
            message: error.message
        });
    }
});

const multer = require('multer');

// Configure multer for disk storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Process Casting Video endpoint
// Now accepts multipart/form-data
// Fields:
// - video: The video file
// - aiAudio_0, aiAudio_1, ...: AI audio files
// - scriptId, userId: text fields
// - lineTimings: JSON string
app.post('/process-casting', upload.any(), async (req, res) => {
    console.log('[Casting] Received request');

    let processTempDir = null; // Declare processTempDir here for broader scope

    try {
        const { scriptId, userId, lineTimings: lineTimingsJson } = req.body;
        const files = req.files;

        if (!files || files.length === 0 || !scriptId || !userId || !lineTimingsJson) {
            return res.status(400).json({ error: 'Missing required fields or files' });
        }

        const lineTimings = JSON.parse(lineTimingsJson);
        processTempDir = path.join(__dirname, 'temp', `casting_${Date.now()}`);

        // Create specific temp dir for this process
        await fs.promises.mkdir(processTempDir, { recursive: true });

        // Identify video file
        const videoUpload = files.find(f => f.fieldname === 'video');
        if (!videoUpload) {
            throw new Error('No video file uploaded');
        }

        const videoFile = path.join(processTempDir, 'input.mp4');
        // Move video from multer temp to our processing dir
        await fs.promises.rename(videoUpload.path, videoFile);

        console.log(`[Casting] Processing video for user ${userId}, script ${scriptId}`);
        console.log(`[Casting] Video saved: ${videoFile} (${(videoUpload.size / 1024 / 1024).toFixed(2)} MB)`);

        const userAudioFile = path.join(processTempDir, 'user_audio.m4a');
        const mixedAudioFile = path.join(processTempDir, 'mixed_audio.m4a');
        const outputFile = path.join(processTempDir, 'output.mp4');

        // 2. Extract user audio from video
        console.log('[Casting] Extracting user audio from video...');
        await new Promise((resolve, reject) => {
            ffmpeg(videoFile)
                .output(userAudioFile)
                .audioCodec('aac')
                .noVideo()
                .on('end', () => {
                    console.log('[Casting] User audio extracted');
                    resolve();
                })
                .on('error', reject)
                .run();
        });

        // 3. Process AI audio files
        console.log('[Casting] Processing AI audio files...');
        const aiSegments = [];

        // Map uploaded files to timings
        // We expect files to be named like aiAudio_{index} in the form data
        for (const timing of lineTimings) {
            if (timing.type === 'ai') {
                const fieldName = `aiAudio_${timing.index}`;
                const upload = files.find(f => f.fieldname === fieldName);

                if (upload) {
                    const aiAudioFile = path.join(processTempDir, `ai_${timing.index}.mp3`);
                    await fs.promises.rename(upload.path, aiAudioFile);

                    aiSegments.push({
                        file: aiAudioFile,
                        startTime: timing.startTime,
                        duration: timing.duration
                    });
                    console.log(`[Casting] Found audio for line ${timing.index}`);
                } else {
                    console.warn(`[Casting] No audio file found for AI line ${timing.index}`);
                }
            }
        }

        console.log(`[Casting] Processed ${aiSegments.length} AI audio segments`);

        // 4. Create mixed audio track with AI voice replacement
        console.log('[Casting] Mixing audio tracks with AI voice replacement...');

        // NEW STRATEGY:
        // Instead of mixing user audio with AI audio (which causes echo),
        // we'll mute the user audio during AI sections and use only the cached TTS audio.
        // This eliminates echo completely when recording without headphones.

        const filterParts = [];

        // Step 1: Normalize user audio with aggressive settings
        // -10 LUFS = significantly louder, user is the star of the selftape
        // LRA=7 = reduced loudness range for consistent volume
        // dynaudnorm = brings up quiet parts without distorting loud parts
        filterParts.push('[0:a]highpass=f=80,loudnorm=I=-10:TP=-1.0:LRA=7,dynaudnorm=f=200:g=5:p=0.95[user_normalized]');


        // Step 2: Create volume control filters for each AI segment
        // We'll use volume=enable to mute user audio during AI speaking times
        let volumeExpression = '1'; // Default: full volume

        // Build expression to mute user audio during AI segments
        if (aiSegments.length > 0) {
            // Create individual conditions for each segment
            const conditions = aiSegments.map(segment => {
                const start = segment.startTime;
                const end = start + segment.duration;
                // Return 1 if time is between start and end (AI speaking), else 0
                return `between(t,${start},${end})`;
            });

            // Combine conditions with OR logic (gte = greater than or equal)
            // If ANY condition is true (value >= 1), we're in an AI section
            const combinedCondition = conditions.join('+');

            // If combined condition >= 1 (any AI speaking), volume=0 (mute), else volume=1 (full)
            volumeExpression = `if(gte(${combinedCondition},1),0,1)`;
        }

        // Apply dynamic volume control to user audio with fade to avoid clicks
        filterParts.push(`[user_normalized]volume='${volumeExpression}':eval=frame[user_controlled]`);

        // Step 3: Process each AI segment with delay and normalization
        // -20 LUFS = quieter than user, supporting role for the actor
        aiSegments.forEach((segment, idx) => {
            const delayMs = Math.round(segment.startTime * 1000);
            filterParts.push(
                `[${idx + 1}:a]highpass=f=80,loudnorm=I=-20:TP=-1.0:LRA=7,adelay=${delayMs}|${delayMs}[ai${idx}]`
            );
        });

        // Step 4: Add AI segments on top of muted user audio using sequential mixing
        // User audio is already muted during AI sections, so we add them one by one
        if (aiSegments.length > 0) {
            // Start with user_controlled as base
            let currentStream = '[user_controlled]';

            // Add each AI segment sequentially
            aiSegments.forEach((segment, idx) => {
                const nextStream = idx === aiSegments.length - 1 ? '[mixed]' : `[mix${idx}]`;
                // Use amix with normalize=0 and weights to preserve volume
                // Since user is muted during AI, we're just adding the AI on top
                filterParts.push(
                    `${currentStream}[ai${idx}]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0:weights=1 1${nextStream}`
                );
                currentStream = nextStream;
            });

            // Apply compression + limiting for cohesive final mix
            // acompressor: glues the mix together, reduces dynamic range further
            // alimiter: prevents any clipping
            filterParts.push(
                '[mixed]acompressor=threshold=-18dB:ratio=3:attack=5:release=100,alimiter=limit=0.95:attack=1:release=50[outa]'
            );
        } else {
            // No AI segments, apply same processing to user audio only
            filterParts.push('[user_controlled]acompressor=threshold=-18dB:ratio=3:attack=5:release=100,alimiter=limit=0.95:attack=1:release=50[outa]');
        }

        const filterComplex = filterParts.join(';');

        console.log('[Casting] Filter complex:', filterComplex);

        await new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Add user audio as first input
            command.input(userAudioFile);

            // Add all AI segments as inputs
            aiSegments.forEach(segment => {
                command.input(segment.file);
            });

            command
                .complexFilter(filterComplex)
                .map('[outa]')
                .audioCodec('aac')
                .audioBitrate('192k') // Increased bitrate for better quality
                .audioChannels(1) // Mono to reduce echo from stereo artifacts
                .audioFrequency(44100)
                .output(mixedAudioFile)
                .on('start', (cmd) => console.log('[FFmpeg] Mix command:', cmd))
                .on('progress', (progress) => console.log(`[FFmpeg] Mixing: ${progress.percent?.toFixed(1)}%`))
                .on('end', () => {
                    console.log('[Casting] Audio mixing completed with AI voice replacement');
                    resolve();
                })
                .on('error', reject)
                .run();
        });

        // 5. Replace video audio with mixed audio (OPTIMIZED FOR SPEED)
        console.log('[Casting] Replacing video audio track...');
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoFile)
                .input(mixedAudioFile)
                .outputOptions([
                    '-c:v copy',           // Copy video stream WITHOUT re-encoding (FAST!)
                    '-c:a aac',            // Encode audio as AAC
                    '-b:a 128k',           // Audio bitrate
                    '-map 0:v:0',          // Map video from first input
                    '-map 1:a:0',          // Map audio from second input
                    '-shortest',           // Match shortest stream duration
                    '-movflags +faststart' // Optimize for web playback
                ])
                .output(outputFile)
                .on('start', (cmd) => console.log('[FFmpeg] Final command:', cmd))
                .on('progress', (progress) => console.log(`[FFmpeg] Finalizing: ${progress.percent?.toFixed(1)}%`))
                .on('end', () => {
                    console.log('[Casting] Video processing completed');
                    resolve();
                })
                .on('error', reject)
                .run();
        });

        // 6. Instead of uploading to Supabase, save to server's public folder
        // and provide a download URL for the client to fetch
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        const fileName = `casting_${userId}_${Date.now()}.mp4`;
        const publicPath = path.join(publicDir, fileName);

        console.log('[Casting] Moving processed video to public folder...');
        await fs.promises.rename(outputFile, publicPath);

        // Get file size for logging
        const stats = await fs.promises.stat(publicPath);
        console.log(`[Casting] File ready for download: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Cleanup temp files
        await fs.promises.rm(processTempDir, { recursive: true, force: true });

        // Return download URL
        const downloadUrl = `${req.protocol}://${req.get('host')}/download/${fileName}`;
        console.log('[Casting] Success! Download URL:', downloadUrl);

        res.json({
            success: true,
            downloadUrl: downloadUrl,
            fileName: fileName,
            message: 'Video processed successfully'
        });

    } catch (error) {
        console.error('[Casting] Error:', error);

        // Cleanup on error
        if (processTempDir) { // Only try to remove if it was successfully created
            try {
                await fs.promises.rm(processTempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error('[Casting] Error cleaning up process temp directory:', cleanupError);
            }
        }

        // Cleanup uploaded files (only if they weren't moved/deleted)
        if (req.files) {
            for (const file of req.files) {
                // Check if file still exists before trying to delete
                try {
                    await fs.promises.access(file.path);
                    await fs.promises.unlink(file.path);
                } catch { }
            }
        }

        res.status(500).json({
            error: 'Video processing failed',
            message: error.message
        });
    }
});

// --- COACH MODE ENDPOINT ---
app.post('/analyze-recording', async (req, res) => {
    console.log('[Coach] ========== NEW ANALYSIS REQUEST ==========');
    console.log('[Coach] Request received at:', new Date().toISOString());
    console.log('[Coach] Body keys:', Object.keys(req.body));

    const { recordingPath, userId, scriptId, sceneId, recordingType, recordingId, characterId, compareWithId } = req.body;

    if (!recordingPath || !userId) {
        console.log('[Coach] ERROR: Missing required fields');
        return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Coach] Processing: ${recordingPath}`);
    console.log(`[Coach] User: ${userId}, Script: ${scriptId}, Type: ${recordingType}`);

    const tempDir = path.join(__dirname, 'temp', `coach_${Date.now()}`);

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });
        console.log(`[Coach] Analyzing recording: ${recordingPath}`);
        console.log('[Coach] Attempting to download from Supabase...');
        console.log('[Coach] Bucket: recordings');
        console.log('[Coach] Path:', recordingPath);

        // 1. Download file from Supabase
        const { data, error } = await supabase.storage
            .from('recordings')
            .download(recordingPath);

        console.log('[Coach] Download response received');
        console.log('[Coach] Has data:', !!data);
        console.log('[Coach] Has error:', !!error);

        if (error) {
            console.error('[Coach] Supabase download error details:', JSON.stringify(error, null, 2));
            throw new Error(`Download failed: ${error.message || JSON.stringify(error)}`);
        }

        if (!data) {
            console.error('[Coach] No data returned from Supabase (but no error either)');
            throw new Error('Download failed: No data returned from Supabase');
        }

        console.log('[Coach] Download successful, data size:', data.size);

        const originalExt = path.extname(recordingPath);
        const localInputPath = path.join(tempDir, `input${originalExt}`);
        const buffer = await data.arrayBuffer();
        await fs.promises.writeFile(localInputPath, Buffer.from(buffer));

        // 2. Extract/Convert Audio for OpenAI
        // OpenAI supports mp3, mp4, mpeg, mpa, m4a, ogg, wav, webm.
        // We'll convert to mp3 128k mono to save size/tokens.
        const audioPath = path.join(tempDir, 'audio.mp3');

        console.log('[Coach] Converting/Extracting audio...');
        await new Promise((resolve, reject) => {
            ffmpeg(localInputPath)
                .toFormat('mp3')
                .audioBitrate('128k')
                .audioChannels(1) // Mono
                .on('end', resolve)
                .on('error', reject)
                .save(audioPath);
        });

        // 3. Prepare Audio for OpenAI API
        // Read file as base64
        const audioBuffer = await fs.promises.readFile(audioPath);
        const base64Audio = audioBuffer.toString('base64');

        console.log('[Coach] Sending to OpenAI...');
        console.log('[Coach] Audio file size (bytes):', audioBuffer.length);
        console.log('[Coach] Base64 length:', base64Audio.length);
        console.log('[Coach] Model: gpt-4o-audio-preview');

        // 4. Fetch script context for better analysis
        let scriptContext = '';
        let userCharacterName = 'el usuario';

        if (scriptId) {
            try {
                console.log('[Coach] Fetching script context...');

                // Get script info
                const { data: script } = await supabase
                    .from('scripts')
                    .select('title')
                    .eq('id', scriptId)
                    .single();

                // Get all characters
                const { data: characters } = await supabase
                    .from('characters')
                    .select('id, name, is_user_character')
                    .eq('script_id', scriptId);

                // Find user's character
                const userCharacter = characters?.find(c => c.is_user_character);
                if (userCharacter?.name) {
                    userCharacterName = userCharacter.name;
                    console.log('[Coach] User character:', userCharacterName);
                }

                // Get dialogue lines
                const { data: dialogues } = await supabase
                    .from('dialogues')
                    .select('character_id, line_text, line_number')
                    .eq('script_id', scriptId)
                    .order('line_number', { ascending: true });

                if (dialogues && dialogues.length > 0) {
                    // Build script context
                    const characterMap = new Map(characters?.map(c => [c.id, c.name]) || []);
                    const scriptLines = dialogues
                        .map(d => {
                            const charName = characterMap.get(d.character_id) || 'NARRADOR';
                            return `${charName}: ${d.line_text}`;
                        })
                        .join('\n');

                    // ISOLATION STRATEGY: List only user lines to prevent confusion
                    const userLinesOnly = dialogues
                        .filter(d => characterMap.get(d.character_id) === userCharacterName)
                        .map((d, i) => `${i + 1}. "${d.line_text}"`)
                        .join('\n');

                    scriptContext = `\n\nCONTEXTO COMPLETO DEL GUION:\n${scriptLines}\n\nLÍNEAS ESPECÍFICAS DE ${userCharacterName} (A ANALIZAR EXCLUSIVAMENTE):\n${userLinesOnly}\n\nEl usuario interpreta al personaje: ${userCharacterName}`;
                    console.log('[Coach] Script context with isolation added.');
                }
            } catch (e) {
                console.error('[Coach] Error fetching script context:', e);
            }
        }

        // 5. Fetch previous analysis for comparison
        let previousTakeInfo = "";
        if (userId && scriptId && sceneId) {
            try {
                let prevFeedbacks;

                if (compareWithId) {
                    console.log(`[Coach] Manual comparison requested with recording: ${compareWithId}`);
                    const { data } = await supabase
                        .from('coach_feedback')
                        .select('feedback, created_at')
                        .eq('recording_id', compareWithId);
                    prevFeedbacks = data;
                } else {
                    console.log(`[Coach] Buscando análisis previo automático para Escena: ${sceneId}`);
                    const { data } = await supabase
                        .from('coach_feedback')
                        .select('feedback, created_at, recordings!inner(script_id, scene_id)')
                        .eq('user_id', userId)
                        .eq('recordings.script_id', scriptId)
                        .eq('recordings.scene_id', sceneId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    prevFeedbacks = data;
                }

                if (prevFeedbacks && prevFeedbacks.length > 0) {
                    const prev = prevFeedbacks[0].feedback;
                    const fecha = new Date(prevFeedbacks[0].created_at).toLocaleDateString();

                    previousTakeInfo = `
TOMA ANTERIOR ANALIZADA (${fecha}):
- Presencia: ${prev.presencia || (prev.feedback?.presencia) || 'Sin datos'}
- Objetivo: ${prev.objetivo || (prev.feedback?.objetivo) || 'Sin datos'}
- Relación: ${prev.relacion || (prev.feedback?.relacion) || 'Sin datos'}
- Ritmo: ${prev.ritmo || (prev.feedback?.ritmo) || 'Sin datos'}

INSTRUCCIÓN DE COMPARACIÓN:
Compara esta nueva toma con la anterior. En el objeto 'comparacion' del JSON indica las diferencias de exploración, riesgo, variedad y descubrimientos.`;
                    console.log('[Coach] Análisis previo encontrado e inyectado.');
                } else {
                    previousTakeInfo = `\nEsta es la primera toma analizada de esta escena O no se ha seleccionado una toma previa válida. INDICA QUE ES EL PRIMER ANÁLISIS. DEJA TODOS LOS CAMPOS DEL OBJETO 'comparacion' COMO null.`;
                    console.log('[Coach] No previous feedback found for this context.');
                }
            } catch (e) {
                console.error('[Coach] Error buscando historial:', e);
            }
        }

        // 6. Construct the prompt with the new professional method-coach persona
        const systemPrompt = `Eres un compañero de exploración escénica con experiencia en laboratorio teatral y dirección de ensayos. Tu papel no es evaluar ni corregir: es abrir caminos, proponer alternativas y estimular la investigación del actor sobre su personaje.

No eres un profesor que examina. Eres alguien que ha visto la escena y propone: "¿Y si lo pruebas así?"

Tu lenguaje es activo, directo y propositivo. Usas palabras como: prueba, explora, experimenta, intenta, observa, juega. Nunca usas: deberías, has fallado, necesitas mejorar, incorrecto, mal.

REGLA CRÍTICA (su incumplimiento invalida el análisis):
El audio contiene voces de IA intercaladas con la voz del actor.
Las voces de IA son sintéticas y NO deben ser analizadas bajo ningún concepto.
Analiza EXCLUSIVAMENTE las intervenciones del personaje "${userCharacterName}" 
que coincidan con la lista de "LÍNEAS ESPECÍFICAS" proporcionada abajo.
Cualquier observación o propuesta basada en líneas que NO pertenezcan a "${userCharacterName}" (es decir, líneas dichas por la IA u otro personaje) es un error gravísimo. Las propuestas deben centrarse ÚNICAMENTE en el texto y actuación de "${userCharacterName}".

${scriptContext}

${previousTakeInfo}

Devuelve SOLO JSON válido con esta estructura exacta, sin markdown ni bloques de código:
{
  "feedback": {
    "presencia": "Análisis de la energía y cuerpo en el espacio sonoro de ${userCharacterName}.",
    "objetivo": "Análisis de lo que busca conseguir ${userCharacterName}.",
    "relacion": "Cómo afecta a ${userCharacterName} el otro personaje.",
    "ritmo": "Cómo fluye el texto y las pausas dramáticas."
  },
  "propuestas": [
    // IMPORTANTE: DEBES generar un mínimo de 5 propuestas y un máximo de 8. Si el guion es muy corto, busca diferentes ángulos (físico, emocional, ritmo) para llegar a 5.
    {
      "titulo": "Título de la propuesta",
      "descripcion": "Instrucciones prácticas para probar en la siguiente toma."
    }
  ],
  "comparacion": {
    "exploracion": "Qué caminos nuevos se han abierto respecto a la toma anterior.",
    "riesgo": "Nivel de riesgo tomado en la interpretación actual respecto a la anterior.",
    "variedad": "Variación de matices y colores usados.",
    "descubrimientos": "Nuevos hallazgos en la toma."
  }
}

Idioma: Español. Tono: constructivo, inspirador y exploratorio.`;

        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-audio",
                modalities: ["text", "audio"],
                audio: { voice: "alloy", format: "mp3" },
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analiza esta interpretación." },
                            { type: "input_audio", input_audio: { data: base64Audio, format: "mp3" } }
                        ]
                    }
                ]
            })
        });

        console.log('[Coach] OpenAI response status:', openAIResponse.status);
        console.log('[Coach] OpenAI response ok:', openAIResponse.ok);

        if (!openAIResponse.ok) {
            const errText = await openAIResponse.text();
            console.error('[Coach] OpenAI error response:', errText);
            throw new Error(`OpenAI API Error: ${openAIResponse.status} ${errText}`);
        }

        const aiResult = await openAIResponse.json();
        console.log('[Coach] OpenAI full response:', JSON.stringify(aiResult, null, 2));

        // For gpt-4o-audio-preview with audio modality, the text response is in audio.transcript
        let content = aiResult.choices?.[0]?.message?.content;

        // If content is null, check audio.transcript
        if (!content || content === null) {
            content = aiResult.choices?.[0]?.message?.audio?.transcript;
            console.log('[Coach] Content was null, using audio.transcript instead');
        }

        if (!content) {
            console.error('[Coach] No content found in either content or audio.transcript');
            content = "{}";
        }

        console.log('[Coach] Raw AI content length:', content.length);
        console.log('[Coach] Raw AI content preview:', content.substring(0, 500));

        let analysisData;
        try {
            // Remove markdown code blocks if present (just in case)
            const jsonString = content
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();
            
            analysisData = JSON.parse(jsonString);
        } catch (e) {
            console.error('[Coach] Failed to parse JSON from AI, attempting brace extraction');
            try {
                const firstBrace = content.indexOf('{');
                const lastBrace = content.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const extracted = content.substring(firstBrace, lastBrace + 1);
                    analysisData = JSON.parse(extracted);
                } else {
                    throw new Error("No braces found");
                }
            } catch (fallbackError) {
                console.error('[Coach] Brace extraction also failed.');
                analysisData = {
                    feedback: { error: "No se pudo generar el formato correcto. Las instrucciones markdown de la IA interfirieron con el parseo." },
                    comparacion: "Error de formato. Por favor intenta de nuevo."
                };
            }
        }

        console.log('[Coach] Analysis complete.');

        // 4. Save to Supabase
        const { data: insertData, error: insertError } = await supabase
            .from('coach_feedback')
            .insert({
                recording_id: null, // We might need to find the recording ID or just use what data we have. 
                // Wait, recordingPath is just a path. We need recording_id for the relation.
                // The client should send recordingId. 
                // But for now, let's assume client sends recordingId if available.
                // If not, we store it loosely or requiring recordingId.
                // I'll add recordingId to request body.
                recording_id: req.body.recordingId,
                user_id: userId,
                feedback: analysisData
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Coach] Failed to save to DB:', insertError);
            // Return result anyway, just not saved
        }

        // Cleanup
        await fs.promises.rm(tempDir, { recursive: true, force: true });

        res.json({
            success: true,
            analysis: analysisData,
            savedId: insertData?.id
        });

    } catch (error) {
        console.error('[Coach] Error:', error);
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { });
        res.status(500).json({ error: error.message });
    }
});


// ============================================================
// ============================================================
// AZURE TEXT-TO-SPEECH
// ============================================================

/**
 * Analiza el texto y extrae contexto emocional y de puntuación.
 * Separa las acotaciones entre paréntesis del texto limpio.
 */
function analyzeTextContext(text) {
    const analysis = {
        hasQuestion: text.includes('?'),
        hasExclamation: text.includes('!'),
        hasEllipsis: text.includes('...'),
        direction: null,
        cleanText: text,
    };

    // Detectar acotaciones entre paréntesis (ej: "(susurrando) No hagas ruido")
    const directionMatch = text.match(/\(([^)]+)\)/);
    if (directionMatch) {
        analysis.direction = directionMatch[1].toLowerCase().trim();
        // Quitar la acotación del texto que se enviará al TTS
        analysis.cleanText = text.replace(/\([^)]+\)/g, '').trim();
    }

    return analysis;
}

/**
 * Mapeo de acotaciones en español a parámetros SSML de prosodia.
 * rate: velocidad de habla   pitch: tono    volume: volumen
 */
const emotionMap = {
    'susurrando':   { volume: '-20dB', rate: '-10%', pitch: '-5%'  },
    'susurra':      { volume: '-20dB', rate: '-10%', pitch: '-5%'  },
    'gritando':     { volume: '+6dB',  rate: '+10%', pitch: '+15%' },
    'grita':        { volume: '+6dB',  rate: '+10%', pitch: '+15%' },
    'enfadado':     { volume: '+4dB',  rate: '+5%',  pitch: '+8%'  },
    'enfadada':     { volume: '+4dB',  rate: '+5%',  pitch: '+8%'  },
    'triste':       { volume: '-10dB', rate: '-15%', pitch: '-10%' },
    'llorando':     { volume: '-10dB', rate: '-15%', pitch: '-10%' },
    'alegre':       { volume: '0dB',   rate: '+5%',  pitch: '+5%'  },
    'feliz':        { volume: '0dB',   rate: '+5%',  pitch: '+5%'  },
    'nervioso':     { volume: '+2dB',  rate: '+20%', pitch: '+12%' },
    'nerviosa':     { volume: '+2dB',  rate: '+20%', pitch: '+12%' },
    'cansado':      { volume: '-15dB', rate: '-20%', pitch: '-8%'  },
    'cansada':      { volume: '-15dB', rate: '-20%', pitch: '-8%'  },
    'sorprendido':  { volume: '+5dB',  rate: '+10%', pitch: '+20%' },
    'sorprendida':  { volume: '+5dB',  rate: '+10%', pitch: '+20%' },
    'asustado':     { volume: '-5dB',  rate: '+15%', pitch: '+18%' },
    'asustada':     { volume: '-5dB',  rate: '+15%', pitch: '+18%' },
    'serio':        { volume: '0dB',   rate: '-5%',  pitch: '-3%'  },
    'seria':        { volume: '0dB',   rate: '-5%',  pitch: '-3%'  },
    'sarcástico':   { volume: '0dB',   rate: '+5%',  pitch: '+8%'  },
    'sarcástica':   { volume: '0dB',   rate: '+5%',  pitch: '+8%'  },
    'irónico':      { volume: '0dB',   rate: '+5%',  pitch: '+8%'  },
    'dudoso':       { volume: '-10dB', rate: '-10%', pitch: '-5%'  },
    'pensativo':    { volume: '-10dB', rate: '-15%', pitch: '-3%'  },
    'pensativa':    { volume: '-10dB', rate: '-15%', pitch: '-3%'  },
};

/**
 * Genera audio TTS usando Azure Cognitive Services.
 * Devuelve el audio como Buffer (MP3).
 */
async function generateAzureTTS({ text, voice }) {
    // .trim() crítico: copiar/pegar keys en Render añade \n al final
    const azureKey = (process.env.AZURE_TTS_KEY || '').trim();
    const azureRegion = (process.env.AZURE_TTS_REGION || '').trim();

    if (!azureKey || !azureRegion) {
        throw new Error('Azure TTS not configured: missing AZURE_TTS_KEY or AZURE_TTS_REGION');
    }

    // PASO 1: Analizar contexto del texto
    const context = analyzeTextContext(text);
    console.log('[Azure TTS] Texto original:', text);
    console.log('[Azure TTS] Contexto detectado:', context);

    // PASO 2: Parámetros base por puntuación
    let rate = '0%';
    let pitch = '0%';
    let volume = '0dB';

    if (context.hasQuestion) {
        pitch = '+8%';
        rate  = '+5%';
    }
    if (context.hasExclamation) {
        pitch  = '+12%';
        rate   = '+8%';
        volume = '+3dB';
    }
    if (context.hasEllipsis) {
        rate = '-10%';
    }

    // PASO 3: Sobrescribir con acotación emocional si existe
    if (context.direction) {
        // Buscar coincidencia exacta primero, luego parcial
        const exactMatch = emotionMap[context.direction];
        if (exactMatch) {
            rate   = exactMatch.rate;
            pitch  = exactMatch.pitch;
            volume = exactMatch.volume;
        } else {
            // Búsqueda parcial: "muy enfadado" → buscar "enfadado"
            const partialKey = Object.keys(emotionMap).find(k => context.direction.includes(k));
            if (partialKey) {
                rate   = emotionMap[partialKey].rate;
                pitch  = emotionMap[partialKey].pitch;
                volume = emotionMap[partialKey].volume;
            }
        }
    }

    console.log('[Azure TTS] Parámetros SSML:', { rate, pitch, volume });

    // PASO 4: Insertar breaks explícitos en el texto limpio
    let finalText = context.cleanText;
    // "..." → pausa larga (ya manejada por rate -10%, pero añadimos break visual)
    finalText = finalText.replace(/\.\.\./g, '<break time="800ms"/>');
    // ". " → pausa media entre frases
    finalText = finalText.replace(/\.\s/g, '.<break time="400ms"/> ');
    // ", " → pausa corta
    finalText = finalText.replace(/,\s/g, ',<break time="200ms"/> ');

    // PASO 5: Construir SSML
    const ssmlRate = rate === '0%' ? 'default' : rate;
    const ssmlPitch = pitch === '0%' ? 'default' : pitch;
    const ssmlVolume = volume === '0dB' ? 'default' : volume;
    const locale = voice.split('-').slice(0, 2).join('-'); // e.g. "es-ES", "es-MX"

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">
  <voice name="${voice}">
    <prosody rate="${ssmlRate}" pitch="${ssmlPitch}" volume="${ssmlVolume}">
      ${finalText}
    </prosody>
  </voice>
</speak>`;

    console.log('[Azure TTS] SSML generado:', ssml);

    const endpoint = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': azureKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        },
        body: ssml,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Azure TTS API error: ${response.status} ${errText}`);
    }

    // Azure devuelve el MP3 binario directamente
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

const activeQuizGenerations = new Map();

// Endpoint: generar quiz de memoria dinámico
app.post('/generate-quiz', async (req, res) => {
    const { script_id, script_text } = req.body;

    if (!script_id || !script_text) {
        return res.status(400).json({ error: 'Missing script_id or script_text' });
    }

    // 1. Calcular longitud del guion
    const lines = script_text.split('\n').filter(line => line.trim().length > 0);
    const lineCount = lines.length;

    // 2. Validar que no sea demasiado corto
    if (lineCount < 5) {
        return res.status(400).json({ 
            error: 'too_short',
            message: 'El guion es demasiado corto para generar un quiz'
        });
    }

    // Si ya hay una generación en curso para este guion, esperamos a que termine
    // para no llamar a OpenAI (y cobrar) dos veces.
    if (activeQuizGenerations.has(script_id)) {
        console.log(`[Quiz] Esperando generación en curso para script ${script_id}...`);
        try {
            const result = await activeQuizGenerations.get(script_id);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: 'Generación paralela falló' });
        }
    }

    const generationPromise = (async () => {
        // 3. Determinar cantidad de preguntas según longitud
        let questionCount;
        if (lineCount < 10) {
            questionCount = 5;   // Escena muy corta
        } else if (lineCount < 20) {
            questionCount = 10;  // Escena corta
        } else if (lineCount < 40) {
            questionCount = 15;  // Escena media
        } else {
            questionCount = 20;  // Escena larga
        }

        console.log(`[Quiz] Guion con ${lineCount} líneas → generando ${questionCount} preguntas`);

        // 4. Llamar a GPT-4o con prompt dinámico
        const prompt = `Eres un experto en pedagogía teatral. Genera EXACTAMENTE ${questionCount} preguntas de opción múltiple sobre este guion teatral para ayudar al actor a comprender profundamente la escena.

Tipos de preguntas (distribuye equitativamente):
1. Motivaciones de personajes (¿Por qué X dice/hace Y?)
2. Direcciones interpretativas (acotaciones entre paréntesis como 'susurrando', 'gritando', 'enfadado')
3. Secuencia de diálogos (¿Qué dice X justo después de Y?)
4. Relaciones entre personajes (tensión, dinámica, conflicto)
5. Subtexto emocional (¿Qué siente realmente el personaje en este momento?)

Reglas importantes:
- Cada pregunta debe tener 4 opciones plausibles
- Solo 1 opción es correcta
- Las opciones incorrectas deben ser creíbles, no obviamente falsas
- Referirse a momentos específicos del guion
- Usar nombres de personajes del guion
- Si hay acotaciones interpretativas entre paréntesis, incluir preguntas sobre ellas

Devuelve SOLO JSON válido sin markdown, con esta estructura exacta:
{
  "questions": [
    {
      "question": "texto de la pregunta",
      "options": ["opción 1", "opción 2", "opción 3", "opción 4"],
      "correct": 0,
      "type": "motivation"
    }
  ]
}

IMPORTANTE: Debes generar exactamente ${questionCount} preguntas, ni más ni menos.

GUION:
${script_text}`;

        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            }),
        });

        if (!openAIResponse.ok) {
            throw new Error(`OpenAI API error: ${await openAIResponse.text()}`);
        }

        const aiData = await openAIResponse.json();
        let content = aiData.choices[0].message.content;

        // 5. Parsear respuesta de GPT-4o
        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            content = content.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(content);

        // Barajar opciones para que la correcta no sea siempre la primera
        if (parsed.questions && Array.isArray(parsed.questions)) {
            parsed.questions = parsed.questions.map(q => {
                const originalCorrectOption = q.options[q.correct];
                // Crear copia y barajar
                const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
                // Encontrar el nuevo índice de la respuesta correcta
                const newCorrectIndex = shuffledOptions.indexOf(originalCorrectOption);
                
                return {
                    ...q,
                    options: shuffledOptions,
                    correct: newCorrectIndex
                };
            });
        }

        // 6. Validar cantidad de preguntas
        if (!parsed.questions || parsed.questions.length !== questionCount) {
            console.warn(`[Quiz] GPT devolvió ${parsed.questions?.length || 0} preguntas, esperábamos ${questionCount}`);
            if (Math.abs((parsed.questions?.length || 0) - questionCount) > 2) {
                throw new Error('Número incorrecto de preguntas generadas');
            }
        }

        // 7. Guardar en DB con metadatos
        console.log('[Quiz] Intentando guardar en DB con script_id:', script_id);
        console.log('[Quiz] Datos a guardar:', JSON.stringify({
            script_id,
            questions: {
                questions: parsed.questions,
                generated_count: parsed.questions.length,
                line_count: lineCount
            }
        }).substring(0, 200));

        const { data: insertedData, error: insertError } = await supabase
            .from('script_quizzes')
            .insert({ 
                script_id,
                questions: {
                    questions: parsed.questions,
                    generated_count: parsed.questions.length,
                    line_count: lineCount
                }
            })
            .select();

        console.log('[Quiz] Resultado insert:', insertedData);
        console.log('[Quiz] Error insert:', insertError);

        if (insertError) {
            console.error('[Quiz] ERROR AL GUARDAR:', insertError);
            throw insertError;
        }

        console.log('[Quiz] ✅ Quiz guardado exitosamente para script:', script_id);

        return { 
            questions: parsed.questions,
            generated_count: parsed.questions.length,
            line_count: lineCount
        };
    })();

    activeQuizGenerations.set(script_id, generationPromise);

    try {
        const result = await generationPromise;
        res.json(result);
    } catch (error) {
        console.error('[Quiz] Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        activeQuizGenerations.delete(script_id);
    }
});

// Endpoint: generar Azure TTS y devolver MP3 binario directamente
// (mismo patrón que OpenAI/ElevenLabs — el cliente lo guarda en fichero local)
app.post('/tts-azure', async (req, res) => {
    const { text, voice, userId } = req.body;

    if (!text || !voice || !userId) {
        return res.status(400).json({ error: 'Missing required fields: text, voice, userId' });
    }

    console.log(`[Azure TTS] Generating audio for voice: ${voice}`);

    try {
        const audioBuffer = await generateAzureTTS({ text, voice });

        console.log(`[Azure TTS] ✅ Returning ${audioBuffer.length} bytes for voice ${voice}`);

        // Devolver MP3 binario — el cliente lo escribe en fichero temporal
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);

    } catch (error) {
        console.error('[Azure TTS] Error:', error);
        res.status(500).json({ error: error.message, fallback: 'system' });
    }
});


app.listen(PORT, () => {
    console.log(`🎵 Audio Merge Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
