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

console.log('🚀 Server starting - Version: AUDIO_NORM_V2 - Date:', new Date().toISOString());

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
        // -12 LUFS = louder than AI, user is the star of the selftape
        // LRA=7 = reduced loudness range for consistent volume
        // dynaudnorm = brings up quiet parts without distorting loud parts
        filterParts.push('[0:a]highpass=f=80,loudnorm=I=-12:TP=-1.0:LRA=7,dynaudnorm=f=200:g=5:p=0.95[user_normalized]');


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
        // -16 LUFS = slightly quieter than user, so user stands out
        aiSegments.forEach((segment, idx) => {
            const delayMs = Math.round(segment.startTime * 1000);
            filterParts.push(
                `[${idx + 1}:a]highpass=f=80,loudnorm=I=-16:TP=-1.0:LRA=7,adelay=${delayMs}|${delayMs}[ai${idx}]`
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

    const { recordingPath, userId, scriptId, recordingType, recordingId } = req.body;

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

                    scriptContext = `\n\nCONTEXTO DEL GUION "${script?.title || 'Sin título'}":\n${scriptLines}\n\nEl usuario interpreta al personaje: ${userCharacterName}`;
                    console.log('[Coach] Script context added, length:', scriptContext.length);
                }
            } catch (e) {
                console.error('[Coach] Error fetching script context:', e);
                // Continue without context
            }
        }

        // Construct the prompt
        // We ask for JSON for easier UI rendering
        const systemPrompt = `You are a professional acting coach. Analyze the audio performance.

IMPORTANTE: El audio contiene una interpretación de una escena con múltiples personajes. El usuario está interpretando SOLO al personaje "${userCharacterName}". Las otras voces son generadas por IA para dar contexto.

Tu análisis debe centrarse EXCLUSIVAMENTE en las líneas interpretadas por ${userCharacterName}. Ignora las voces de IA.${scriptContext}

Return ONLY valid JSON with this exact structure:
{
  "feedback": {
    "ritmo": "Analysis of rhythm...",
    "diccion": "Analysis of diction...",
    "intencion": "Analysis of intention...",
    "emociones": "Analysis of emotions...",
    "proyeccion": "Analysis of projection...",
    "naturalidad": "Analysis of naturalness...",
    "pausas": "Analysis of pauses..."
  },
  "sugerencias": ["Suggestion 1", "Suggestion 2", ...],
  "comparacion": "Comparison with previous takes (or general comment if none)...",
  "recomendaciones_personaje": "Character specific advice for ${userCharacterName}...",
  "ejercicios": [
    { "nombre": "Exercise Name", "descripcion": "Exercise Description" }
  ]
}
Do not return markdown formatting like \`\`\`json. Return raw JSON only. Language: Spanish.`;

        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-4o-audio-preview",
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
            const jsonString = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            analysisData = JSON.parse(jsonString);
        } catch (e) {
            console.error('[Coach] Failed to parse JSON from AI, using raw text to fallback structure');
            console.error('[Coach] Content was:', content.substring(0, 200));
            // Fallback structure so UI doesn't crash but shows something
            analysisData = {
                feedback: { error: "No se pudo generar el formato correcto. Lectura raw abajo." },
                comparacion: content
            };
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

app.listen(PORT, () => {
    console.log(`🎵 Audio Merge Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
