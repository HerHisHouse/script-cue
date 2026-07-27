const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

console.log('[Casting] ffmpeg path:', ffmpegPath);
console.log('[Casting] ffprobe path:', ffprobePath);

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

process.on('uncaughtException', (err) => {
  console.error('🔴 [FATAL] Excepción no capturada:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 [FATAL] Promise rechazada sin manejar:', reason);
});
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
// Costes aproximados por proveedor (en euros)
const API_COSTS = {
  openai_tts:        0.000015, // por carácter (0.015€/1000 chars)
  openai_tts_hd:     0.000030, // por carácter (0.030€/1000 chars)
  openai_analysis:   0.000005, // por token
  openai_audio:      0.000100, // por segundo de audio procesado
  elevenlabs:        0.000003, // por carácter (0.003€/1000 chars)
  azure:             0.000004, // por carácter (0.004€/1000 chars)
  hume:              0.000003, // (estimado)
  system:            0,        // voces del sistema, gratis
};

async function logApiUsage({
  userId,
  provider,
  characters = 0,
  tokens = 0,
  durationSeconds = 0,
  scriptId = null,
  mode = null,
}) {
  try {
    const costPerUnit = API_COSTS[provider] || 0;
    const units = characters || tokens || durationSeconds || 0;
    const estimatedCost = units * costPerUnit;

    await supabase.from('api_usage').insert({
      user_id: userId,
      provider,
      characters_count: characters,
      tokens_count: tokens,
      duration_seconds: durationSeconds,
      estimated_cost_eur: estimatedCost,
      script_id: scriptId || null,
      mode: mode || null,
    });
  } catch (e) {
    // No bloquear el flujo principal si falla el log
    console.warn('[Usage] Error registrando uso de API:', e.message);
  }
}


console.log('🚀 Server starting - Version: AUDIO_NORM_V4 - Date:', new Date().toISOString());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Merge endpoint
app.post('/merge', async (req, res) => {
    const { segments, userId, scriptId } = req.body;
    const pauseDuration = parseFloat(req.body.pauseDuration) || 1.5;

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



        // Run FFmpeg with concat filter
        await new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Add all inputs
            downloadedFiles.forEach(file => {
                command.input(file);
            });

            // Construct complex filter for concatenation with silence
            const filterParts = [];
            for (let i = 0; i < downloadedFiles.length; i++) {
                if (i < downloadedFiles.length - 1 && pauseDuration > 0) {
                    filterParts.push(`[${i}:a]apad=pad_dur=${pauseDuration}[padded${i}];`);
                }
            }

            const concatInputs = downloadedFiles.map((_, i) => {
                if (i < downloadedFiles.length - 1 && pauseDuration > 0) {
                    return `[padded${i}]`;
                } else {
                    return `[${i}:a]`;
                }
            }).join('');

            const complexFilterStr = `${filterParts.join('')}${concatInputs}concat=n=${downloadedFiles.length}:v=0:a=1[outa]`;

            command
                .complexFilter(complexFilterStr)
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

// =============================================================================
// AUDIO MIXING STRATEGY — SUPERPOSICIÓN SIMPLE
// =============================================================================
// El audio del usuario NO se silencia en ningún momento.
// La IA se añade como pistas adicionales en sus timestamps exactos.
// Ambas suenan simultáneamente. Sin ducking. Sin silenciado.
// =============================================================================

// Process Casting Video endpoint
// Now accepts multipart/form-data
// Fields:
// - video: The video file
// - aiAudio_0, aiAudio_1, ...: AI audio files
// - scriptId, userId: text fields
// - lineTimings: JSON string
app.post('/process-casting', upload.any(), async (req, res) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Casting] Job iniciado: ${jobId}`);

    const { scriptId, userId, lineTimings: lineTimingsJson, hasHeadphones } = req.body;
    const files = req.files;

    if (!files || files.length === 0 || !scriptId || !userId || !lineTimingsJson) {
        return res.status(400).json({ error: 'Missing required fields or files' });
    }

    // Responder inmediatamente — el cliente puede navegar mientras el servidor procesa
    res.json({ success: true, jobId, message: 'Procesamiento iniciado' });

    // Registrar el job en Supabase
    try {
        const { error } = await supabase.from('casting_jobs').insert({
            job_id: jobId,
            user_id: userId,
            script_id: scriptId,
            status: 'processing',
        });
        if (error) console.error('[Casting] Error registrando job:', error);
    } catch (err) {
        console.error('[Casting] Error registrando job:', err);
    }

    // Procesar en segundo plano (no bloqueante)
    processCastingInBackground(jobId, files, req.body)
        .catch(async (err) => {
            console.error(`[Job ${jobId}] Error fatal:`, err.message);
            try {
                const { error } = await supabase.from('casting_jobs').update({
                    status: 'error',
                    error_message: err.message,
                    updated_at: new Date().toISOString(),
                }).eq('job_id', jobId);
                if (error) console.error('[Casting] Error actualizando job a error:', error);
            } catch (updateErr) {
                console.error('[Casting] Excepción actualizando job:', updateErr);
            }
        });
});

function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

async function processCastingInBackground(jobId, files, body) {
    const { scriptId, userId, lineTimings: lineTimingsJson, hasHeadphones: hasHeadphonesRaw } = body;
    const lineTimings = JSON.parse(lineTimingsJson);
    const hasHeadphones = hasHeadphonesRaw === 'true';

    const tempDir = path.join(__dirname, 'temp', `casting_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const videoFile = path.join(tempDir, 'input.mp4');
    const userAudioFile = path.join(tempDir, 'user_audio.m4a');
    const mixedAudioFile = path.join(tempDir, 'mixed_audio.m4a');
    const outputFile = path.join(tempDir, 'output.mp4');

    try {
        // Mover el vídeo subido a la carpeta temporal
        const uploadedVideo = Array.isArray(files) ? files.find(f => f.fieldname === 'video') : files['video']?.[0];
        if (!uploadedVideo) throw new Error('No video file uploaded');
        fs.renameSync(uploadedVideo.path, videoFile);

        const videoSizeMB = fs.statSync(videoFile).size / (1024 * 1024);
        console.log(`[Job ${jobId}] Vídeo: ${videoSizeMB.toFixed(1)}MB`);

        if (videoSizeMB > 200) {
            throw new Error(
                `Vídeo demasiado grande (${videoSizeMB.toFixed(0)}MB). ` +
                'Usa calidad Básica para escenas largas.'
            );
        }

        // ── PASO 1: Extraer audio del usuario ──────────────────────────────────
        console.log(`[Job ${jobId}] Extrayendo audio del usuario...`);
        await new Promise((resolve, reject) => {
            ffmpeg(videoFile)
                .output(userAudioFile)
                .audioCodec('aac')
                .audioBitrate('192k')
                .noVideo()
                .outputOptions(['-threads', '1', '-bufsize', '2M'])
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        // ── PASO 2: Procesar y mezclar audios de la IA ─────────────────────────
        console.log(`[Job ${jobId}] Procesando audios de la IA...`);
        const aiSegments = [];
        const allFiles = Array.isArray(files) ? files : Object.values(files).flat();

        for (const timing of lineTimings) {
            if (timing.type === 'ai') {
                const upload = allFiles.find(f => f.fieldname === `aiAudio_${timing.index}`);
                if (upload) {
                    const aiAudioFile = path.join(tempDir, `ai_${timing.index}.mp3`);
                    fs.renameSync(upload.path, aiAudioFile);
                    aiSegments.push({
                        file: aiAudioFile,
                        startTime: timing.startTime,
                        duration: timing.duration,
                    });
                    console.log(`[Job ${jobId}] Audio IA línea ${timing.index}`);
                }
            }
        }

        const filterParts = [];

        if (hasHeadphones) {
            filterParts.push('[0:a]highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11[user_clean]');
            aiSegments.forEach((segment, idx) => {
                const delayMs = Math.round(segment.startTime * 1000);
                const duration = segment.duration || 3;
                const fade = Math.min(0.05, duration * 0.1).toFixed(3);
                const fadeOut = Math.max(0, duration - parseFloat(fade)).toFixed(3);
                filterParts.push(
                    `[${idx + 1}:a]loudnorm=I=-16:TP=-1.5:LRA=7,` +
                    `afade=t=in:st=0:d=${fade},` +
                    `afade=t=out:st=${fadeOut}:d=${fade},` +
                    `adelay=${delayMs}|${delayMs}[ai${idx}]`
                );
            });
            const allStreams = ['[user_clean]', ...aiSegments.map((_, i) => `[ai${i}]`)].join('');
            filterParts.push(
                `${allStreams}amix=inputs=${aiSegments.length + 1}:` +
                `duration=longest:dropout_transition=0:normalize=0,` +
                `alimiter=limit=0.95:attack=2:release=50[outa]`
            );
        } else {
            filterParts.push(
                '[0:a]highpass=f=100,afftdn=nf=-25,' +
                'loudnorm=I=-16:TP=-1.5:LRA=11[user_normalized]'
            );
            let volumeExpression = '1';
            if (aiSegments.length > 0) {
                const conditions = aiSegments.map(segment => {
                    const start = Math.max(0, (segment.startTime - 0.08)).toFixed(3);
                    const end = (segment.startTime + segment.duration + 0.08).toFixed(3);
                    return `between(t,${start},${end})`;
                });
                volumeExpression = `if(gte(${conditions.join('+')},1),0,1)`;
            }
            filterParts.push(`[user_normalized]volume='${volumeExpression}':eval=frame[user_controlled]`);
            aiSegments.forEach((segment, idx) => {
                const delayMs = Math.round(segment.startTime * 1000);
                const duration = segment.duration || 3;
                const fade = '0.08';
                const fadeOut = Math.max(0, duration - 0.08).toFixed(3);
                filterParts.push(
                    `[${idx + 1}:a]highpass=f=100,` +
                    `loudnorm=I=-18:TP=-1.5:LRA=7,` +
                    `afade=t=in:st=0:d=${fade},` +
                    `afade=t=out:st=${fadeOut}:d=${fade},` +
                    `adelay=${delayMs}|${delayMs}[ai${idx}]`
                );
            });
            const allStreams = ['[user_controlled]', ...aiSegments.map((_, i) => `[ai${i}]`)].join('');
            filterParts.push(
                `${allStreams}amix=inputs=${aiSegments.length + 1}:` +
                `duration=longest:dropout_transition=0:normalize=0,` +
                `acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150:makeup=1,` +
                `alimiter=limit=0.92:attack=2:release=80[outa]`
            );
        }

        await new Promise((resolve, reject) => {
            const command = ffmpeg();
            command.input(userAudioFile);
            aiSegments.forEach(segment => command.input(segment.file));
            command
                .complexFilter(filterParts.join(';'))
                .map('[outa]')
                .audioCodec('aac')
                .audioBitrate('192k')
                .audioChannels(1)
                .audioFrequency(44100)
                .output(mixedAudioFile)
                .on('start', (cmd) => console.log(`[Job ${jobId}] Mix cmd:`, cmd))
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        // Limpiar audios individuales de IA
        console.log(`[Job ${jobId}] Limpiando audios temporales de IA...`);
        for (const segment of aiSegments) {
            try { if (fs.existsSync(segment.file)) fs.unlinkSync(segment.file); } catch {}
        }
        try { if (fs.existsSync(userAudioFile)) fs.unlinkSync(userAudioFile); } catch {}

        // ── PASO 3: Unir vídeo + audio mezclado (compresión inteligente) ──────
        const needsCompression = videoSizeMB > 45;
        console.log(`[Job ${jobId}] ${needsCompression ? 'Comprimiendo (ultrafast)...' : 'Copia directa...'}`);

        const getInfo = (file) => new Promise((resolve) => {
            ffmpeg.ffprobe(file, (err, meta) => {
                if (err) resolve({ error: err.message });
                else resolve({
                    duration: meta.format.duration,
                    size: meta.format.size,
                    streams: meta.streams.map(s => ({
                        codec: s.codec_name,
                        duration: s.duration,
                        type: s.codec_type
                    }))
                });
            });
        });

        const videoInfo = await getInfo(videoFile);
        const audioInfo = await getInfo(mixedAudioFile);

        console.log(`[Job ${jobId}] Input vídeo info:`, JSON.stringify(videoInfo));
        console.log(`[Job ${jobId}] Codec vídeo: ${videoInfo.streams[0]?.codec}`);
        console.log(`[Job ${jobId}] Input audio info:`, JSON.stringify(audioInfo));

        // Obtener duración del vídeo original para usar -t en lugar de -shortest
        const videoDuration = await getVideoDuration(videoFile);
        console.log(`[Job ${jobId}] Duración del vídeo original: ${videoDuration}s`);

        const videoCodec = videoInfo.streams[0]?.codec || 'h264';
        const isHEVC = videoCodec === 'hevc';
        const crf = isHEVC ? '23' : '28';

        const minAcceptableMB = (videoDuration / 60) * 20;

        console.log(`[Job ${jobId}] Codec: ${videoCodec}, CRF: ${crf}`);
        console.log(`[Job ${jobId}] Mínimo aceptable: ${minAcceptableMB.toFixed(1)}MB`);

        const runFfmpeg = (crfValue) => new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoFile)
                .input(mixedAudioFile)
                .outputOptions([
                    '-c:v libx264',
                    `-crf ${crfValue}`,
                    '-preset ultrafast',
                    '-vf', 'scale=-2:720',
                    '-pix_fmt', 'yuv420p',
                    '-threads 1',
                    '-c:a aac',
                    '-b:a 128k',
                    '-map 0:v:0',
                    '-map 1:a:0',
                    '-movflags +faststart',
                    `-t ${videoDuration}`,
                ])
                .output(outputFile)
                .on('start', (cmd) => console.log(`[Job ${jobId}] Final cmd:`, cmd))
                .on('stderr', (line) => {
                    if (
                        line.includes('Duration') ||
                        line.includes('frame=') ||
                        line.includes('time=') ||
                        line.includes('Output') ||
                        line.includes('error') ||
                        line.includes('Error') ||
                        line.includes('Invalid') ||
                        line.includes('moov atom')
                    ) {
                        console.log(`[Job ${jobId}] [ffmpeg]:`, line);
                    }
                })
                .on('end', resolve)
                .on('error', (err, stdout, stderr) => {
                    console.error(`[Job ${jobId}] [ffmpeg error]:`, err.message);
                    console.error(`[Job ${jobId}] [ffmpeg stderr]:`, stderr);
                    reject(err);
                })
                .run();
        });

        if (needsCompression) {
            await runFfmpeg(crf);
            
            let finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
            console.log(`[Job ${jobId}] Tamaño tras primera compresión: ${finalSizeMB.toFixed(1)}MB`);

            if (finalSizeMB < minAcceptableMB) {
                const betterCrf = isHEVC ? '18' : '20';
                console.log(`[Job ${jobId}] ⚠️ Resultado demasiado pequeño. Reintentando con CRF ${betterCrf}...`);
                
                try { fs.unlinkSync(outputFile); } catch {}
                await runFfmpeg(betterCrf);
                
                finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
                console.log(`[Job ${jobId}] Tamaño tras reintento: ${finalSizeMB.toFixed(1)}MB`);
            }
        } else {
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(videoFile)
                    .input(mixedAudioFile)
                    .outputOptions([
                        '-c:v copy',
                        '-c:a aac',
                        '-b:a 128k',
                        '-map 0:v:0',
                        '-map 1:a:0',
                        '-movflags +faststart',
                        '-t', String(videoDuration),
                    ])
                    .output(outputFile)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
        }

        // Limpiar temporales intermedios
        try { fs.unlinkSync(videoFile); } catch {}
        try { fs.unlinkSync(mixedAudioFile); } catch {}

        // ── PASO 4: Subir a Supabase ───────────────────────────────────────────
        const finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
        console.log(`[Job ${jobId}] Tamaño final: ${finalSizeMB.toFixed(1)}MB`);

        const remotePath = `${userId}/${Date.now()}_casting.mp4`;
        const useLocalOnly = body.useLocalOnly === 'true';

        if (useLocalOnly || finalSizeMB > 49) {
            let message = useLocalOnly 
                ? `Selftape (Modo Local). Tu vídeo ha sido mezclado. Descárgalo ahora — disponible solo 1 hora.` 
                : `Tu vídeo es demasiado grande para la nube (${finalSizeMB.toFixed(0)}MB). Descárgalo ahora — disponible solo 1 hora.`;
                
            console.log(`[Job ${jobId}] ⚠️ Guardando para descarga directa. Razón: ${useLocalOnly ? 'Modo Local' : 'Tamaño excedido'}`);

            const downloadsDir = path.join(__dirname, 'downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
            
            const localDownloadPath = path.join(downloadsDir, `${jobId}.mp4`);
            fs.copyFileSync(outputFile, localDownloadPath);
            
            // Delete file after 1 hour (3600000 ms)
            setTimeout(() => {
                try {
                    if (fs.existsSync(localDownloadPath)) {
                        fs.unlinkSync(localDownloadPath);
                        console.log(`[Job ${jobId}] Deleted local download file after 1 hour.`);
                    }
                } catch (e) {}
            }, 3600000);

            await supabase.from('casting_jobs').update({
                status: 'completed_local',
                error_message: message,
            }).eq('job_id', jobId);

        } else {
            // Subir a Supabase
            const fileBuffer = fs.readFileSync(outputFile);
            const { error: uploadError } = await supabase.storage
                .from('recordings')
                .upload(remotePath, fileBuffer, { contentType: 'video/mp4', upsert: false });

            if (uploadError) {
                throw new Error(`Error subiendo a Supabase: ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage
                .from('recordings')
                .getPublicUrl(remotePath);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) {
                throw new Error('No se pudo generar la URL pública del vídeo');
            }
            if (!publicUrl.includes('/object/public/')) {
                console.error(`[Job ${jobId}] ❌ URL no parece pública: ${publicUrl}`);
                throw new Error(`URL de vídeo no accesible: ${publicUrl}`);
            }
            console.log(`[Job ${jobId}] ✅ URL pública verificada: ${publicUrl}`);

            // Obtener duración del video usando ffprobe
            const durationSeconds = await getVideoDuration(outputFile);
            console.log(`[Job ${jobId}] Duración detectada: ${durationSeconds}s`);

            // Crear registro en recordings
            const { data: recordingData, error: dbError } = await supabase.from('recordings').insert({
                user_id: userId,
                script_id: scriptId,
                title: `Casting - ${new Date().toLocaleDateString('es-ES')}`,
                audio_url: publicUrl,
                type: 'video',
                duration_seconds: Math.round(durationSeconds),
                file_size_bytes: Math.round(finalSizeMB * 1024 * 1024),
            }).select();
            
            if (dbError) {
                console.error(`[Job ${jobId}] ❌ Error guardando en recordings:`, JSON.stringify(dbError));
                throw new Error(`Error en DB: ${dbError.message}`);
            }

            console.log(`[Job ${jobId}] ✅ Guardado en recordings con ID:`, recordingData?.[0]?.id);
            
            // Marcar job como completado al final, tras asegurar éxito total
            const { error: jobUpdateError } = await supabase.from('casting_jobs').update({
                status: 'completed',
                updated_at: new Date().toISOString(),
            }).eq('job_id', jobId);

            if (jobUpdateError) {
                console.error(`[Job ${jobId}] Error actualizando status final:`, jobUpdateError);
            } else {
                console.log(`[Job ${jobId}] ✅ Status actualizado a completed`);
            }
        }

                // Registrar el procesamiento del casting
        await logApiUsage({
          userId: body.userId,
          provider: 'openai_audio',
          durationSeconds: videoDuration || 0,
          scriptId: body.scriptId || null,
          mode: 'casting',
        });

        console.log(`[Job ${jobId}] ✅ Proceso completo`);

    } finally {
        // Limpiar carpeta temporal siempre
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

        // Limpiar archivos subidos por multer que no se pudieron mover
        if (files) {
            const allFiles = Array.isArray(files) ? files : Object.values(files).flat();
            for (const file of allFiles) {
                try {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                } catch {}
            }
        }
    }
}

// Endpoint para descargar vídeos guardados temporalmente en el servidor
app.get('/download-casting/:jobId', (req, res) => {
    const { jobId } = req.params;
    const downloadsDir = path.join(__dirname, 'downloads');
    const filePath = path.join(downloadsDir, `${jobId}.mp4`);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath, `casting_${jobId}.mp4`, (err) => {
            if (err) {
                console.error(`[Download] Error downloading file ${jobId}:`, err);
            }
        });
    } else {
        res.status(404).send('El archivo ya no está disponible o ha expirado. (Se mantienen un máximo de 1 hora)');
    }
});







// =============================================================================
// COMPRESS VIDEO (TELEPROMPTER) ENDPOINT
// =============================================================================
app.post('/compress-video', upload.fields([
  { name: 'video', maxCount: 1 }
]), async (req, res) => {

  const jobId = `teleprompter_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  console.log(`[Teleprompter] Job iniciado: ${jobId}`);

  // Responder inmediatamente
  res.json({ success: true, jobId });

  // Registrar en casting_jobs
  try {
    await supabase.from('casting_jobs').insert({
      job_id: jobId,
      user_id: req.body.userId,
      script_id: req.body.scriptId || null,
      status: 'processing',
    });
  } catch (err) {
    console.error('[Teleprompter] Error registrando job:', err);
  }

  // Procesar en background
  processTeleprompterInBackground(jobId, req.files, req.body)
    .catch(async (err) => {
      console.error(`[Job ${jobId}] Error fatal:`, err.message);
      try {
        await supabase.from('casting_jobs').update({
          status: 'error',
          error_message: err.message,
          updated_at: new Date().toISOString(),
        }).eq('job_id', jobId);
      } catch (updateErr) {
        console.error('[Job] Error actualizando status de error:', updateErr);
      }
    });
});

async function processTeleprompterInBackground(jobId, files, body) {
  const tempDir = path.join(__dirname, 'temp', `teleprompter_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const videoFile = path.join(tempDir, 'input.mp4');
  const outputFile = path.join(tempDir, 'output.mp4');

  try {
    const uploadedVideo = files['video'][0];
    fs.renameSync(uploadedVideo.path, videoFile);

    const videoSizeMB = fs.statSync(videoFile).size / (1024 * 1024);
    console.log(`[Job ${jobId}] Vídeo: ${videoSizeMB.toFixed(1)}MB`);

    // Obtener metadata
    const getInfo = (file) => new Promise((resolve) => {
      ffmpeg.ffprobe(file, (err, meta) => {
        if (err) resolve({ duration: 0, streams: [] });
        else resolve({
          duration: meta.format.duration || 0,
          streams: meta.streams.map(s => ({
            codec: s.codec_name,
            type: s.codec_type
          }))
        });
      });
    });

    const videoInfo = await getInfo(videoFile);
    const videoDuration = videoInfo.duration || 0;
    const videoCodec = videoInfo.streams?.[0]?.codec || 'h264';
    const isHEVC = videoCodec === 'hevc';

    console.log(`[Job ${jobId}] Codec: ${videoCodec}, Duración: ${videoDuration}s`);

    // Compresión inteligente (igual que casting)
    const needsCompression = videoSizeMB > 45;

    if (!needsCompression) {
      console.log(`[Job ${jobId}] Sin compresión, copiando directo...`);
      fs.copyFileSync(videoFile, outputFile);
    } else {
      const crf = isHEVC ? '23' : '28';
      const minAcceptableMB = (videoDuration / 60) * 20;

      console.log(`[Job ${jobId}] Comprimiendo con CRF ${crf}...`);

      const runFfmpeg = (crfValue) => new Promise((resolve, reject) => {
        ffmpeg()
          .input(videoFile)
          .outputOptions([
            '-c:v libx264',
            `-crf ${crfValue}`,
            '-preset ultrafast',
            '-vf', 'scale=-2:720',
            '-pix_fmt', 'yuv420p',
            '-threads 1',
            '-c:a aac',
            '-b:a 128k',
            '-movflags +faststart',
            `-t ${videoDuration}`,
          ])
          .output(outputFile)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      await runFfmpeg(crf);
      let finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
      console.log(`[Job ${jobId}] Tamaño tras compresión: ${finalSizeMB.toFixed(1)}MB`);

      if (finalSizeMB < minAcceptableMB) {
        console.log(`[Job ${jobId}] ⚠️ Reintentando con CRF 18...`);
        await runFfmpeg('18');
        finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
        console.log(`[Job ${jobId}] Tamaño tras reintento: ${finalSizeMB.toFixed(1)}MB`);
      }
    }

    // Subir a Supabase
    const finalSizeMB = fs.statSync(outputFile).size / (1024 * 1024);
    const remotePath = `${body.userId}/${Date.now()}_teleprompter.mp4`;

    if (finalSizeMB <= 49) {
      const fileBuffer = fs.readFileSync(outputFile);
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(remotePath, fileBuffer, { contentType: 'video/mp4' });

      if (uploadError) throw new Error(`Error subiendo: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(remotePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl?.includes('/object/public/')) {
        throw new Error(`URL no pública: ${publicUrl}`);
      }

      console.log(`[Job ${jobId}] ✅ URL: ${publicUrl}`);

      const { error: recordingError } = await supabase
        .from('recordings')
        .insert({
          user_id: body.userId,
          script_id: body.scriptId || null,
          title: `Teleprompter - ${new Date().toLocaleDateString('es-ES')}`,
          audio_url: publicUrl,
          type: 'video',
          duration_seconds: Math.round(videoDuration),
        });

      if (recordingError) {
        console.error(`[Job ${jobId}] ❌ Error en recordings:`, recordingError);
        throw new Error(`Error DB: ${recordingError.message}`);
      }

      console.log(`[Job ${jobId}] ✅ Guardado en recordings`);

    } else {
      // Vídeo demasiado grande incluso tras comprimir
      console.log(`[Job ${jobId}] ⚠️ Vídeo grande, guardando para descarga...`);
      await supabase.from('casting_jobs').update({
        status: 'completed_local',
        error_message: `Vídeo de ${finalSizeMB.toFixed(0)}MB. Disponible 1 hora.`,
        updated_at: new Date().toISOString(),
      }).eq('job_id', jobId);
      return;
    }

    // Marcar como completado
    await supabase.from('casting_jobs').update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('job_id', jobId);

    console.log(`[Job ${jobId}] ✅ Proceso completo`);

  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

// --- COACH MODE ENDPOINT ---
app.post('/analyze-recording', async (req, res) => {
    console.log('[Coach] ========== NEW ANALYSIS REQUEST ==========');
    console.log('[Coach] Request received at:', new Date().toISOString());
    console.log('[Coach] Body keys:', Object.keys(req.body));

    const {
        recordingPath,
        recordingId,
        userId,
        scriptId,
        sceneId,
        recordingType,
        characterId,
        characterName,
        compareWithId
    } = req.body;

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

        let buffer;
        const originalExt = recordingPath.includes('?') 
            ? path.extname(recordingPath.split('?')[0]) 
            : path.extname(recordingPath);

        if (recordingPath.startsWith('http://') || recordingPath.startsWith('https://')) {
            console.log('[Coach] Path is a public URL. Fetching directly...');
            const response = await fetch(recordingPath);
            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            console.log('[Coach] Fetch successful, data size:', buffer.length);
        } else if (recordingPath.startsWith('file://') || recordingPath.startsWith('/')) {
            throw new Error("El archivo es local y no está en la nube. No se puede analizar en este dispositivo.");
        } else {
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
            const arrayBuffer = await data.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        }

        const localInputPath = path.join(tempDir, `input${originalExt || '.mp4'}`);
        await fs.promises.writeFile(localInputPath, buffer);

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

        // 4. Resolve Character Name and Fetch script context for better analysis
        let scriptContext = '';
        let specificUserLines = '';

        // PASO 1: Resolver el nombre del personaje
        let userCharacterName = (characterName || '').toUpperCase().trim();

        // PASO 2: Si viene vacío, buscar en BD por characterId
        if (!userCharacterName && characterId) {
            try {
                const { data: charData } = await supabase
                    .from('characters')
                    .select('name')
                    .eq('id', characterId)
                    .single();
                
                if (charData?.name) {
                    userCharacterName = charData.name.toUpperCase().trim();
                }
            } catch (e) {
                console.error('[Coach] Error buscando personaje por characterId:', e);
            }
        }

        // PASO 3: Si sigue vacío, buscar en las grabaciones
        if (!userCharacterName && recordingId) {
            try {
                const { data: recData } = await supabase
                    .from('recordings')
                    .select('character_id, characters(name)')
                    .eq('id', recordingId)
                    .single();
                
                if (recData?.characters?.name) {
                    userCharacterName = recData.characters.name.toUpperCase().trim();
                }
            } catch (e) {
                console.error('[Coach] Error buscando personaje por recordingId:', e);
            }
        }

        console.log('[Coach] userCharacterName FINAL resuelto:', userCharacterName);

        // PASO 3: Si sigue sin personaje, rechazar con error claro
        if (!userCharacterName) {
            console.error('[Coach] ERROR: No se pudo determinar el personaje. Rechazando análisis.');
            return res.status(400).json({
                success: false,
                error: 'No se pudo determinar el personaje del usuario. Por favor, selecciona tu personaje antes de analizar.',
                errorCode: 'NO_CHARACTER'
            });
        }

        // PASO 4: Solo si hay personaje, continuar con el análisis
        console.log('[Coach] ✅ Procediendo con análisis para personaje:', userCharacterName);

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

                    // Filtrar las líneas del personaje del usuario
                    const userLinesOnly = dialogues
                        .filter(d => {
                            const charName = characterMap.get(d.character_id);
                            return charName && charName.toUpperCase() === userCharacterName;
                        })
                        .map((d, i) => `${i + 1}. "${d.line_text}"`);
                    
                    specificUserLines = userLinesOnly.join('\n');
                    
                    console.log('[Coach] Líneas de', userCharacterName, ':', specificUserLines.substring(0, 100));

                    if (!userLinesOnly || userLinesOnly.length === 0) {
                        console.error('[Coach] ERROR: No se encontraron líneas para el personaje', userCharacterName);
                    }

                    scriptContext = `\n\nCONTEXTO COMPLETO DEL GUION:\n${scriptLines}\n\nLÍNEAS ESPECÍFICAS DE ${userCharacterName} (A ANALIZAR EXCLUSIVAMENTE):\n${specificUserLines}\n\nEl usuario interpreta al personaje: ${userCharacterName}`;
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
                    console.log(`[Coach] No manual comparison requested. Skipping auto-comparison.`);
                    prevFeedbacks = null;
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
                    previousTakeInfo = `SIN TOMA ANTERIOR: 
El usuario no ha proporcionado una toma anterior.
En el objeto "comparacion" del JSON, todos los campos 
(exploracion, riesgo, variedad, descubrimientos) deben ser 
exactamente: null (valor JSON null, NO la cadena "null", 
NO texto vacío, NO ningún otro texto).

EJEMPLO CORRECTO cuando no hay toma anterior:
"comparacion": {
  "exploracion": null,
  "riesgo": null,
  "variedad": null,
  "descubrimientos": "Graba una segunda toma de esta escena para ver aquí la comparativa."
}

NUNCA rellenes exploracion, riesgo o variedad si no hay toma anterior.`;
                    console.log('[Coach] No previous feedback found for this context.');
                }
            } catch (e) {
                console.error('[Coach] Error buscando historial:', e);
            }
        }

        const characterInstruction = userCharacterName
            ? `
PERSONAJE A ANALIZAR: "${userCharacterName}"

LÍNEAS ESPECÍFICAS QUE DEBES ANALIZAR (solo estas):
${specificUserLines}

REGLA ABSOLUTA: 
- Analiza ÚNICAMENTE las intervenciones de "${userCharacterName}"
- Las voces de otros personajes son la IA y NO deben analizarse
- Si detectas frases de otros personajes, IGNÓRALAS completamente
- Tu feedback debe referirse siempre a lo que hace "${userCharacterName}"
- En presencia, objetivo, relación y ritmo: habla siempre de "${userCharacterName}"

EJEMPLO CORRECTO: "En su intervención, ${userCharacterName} muestra..."
EJEMPLO INCORRECTO: "El personaje demuestra..." (sin especificar quién)
`
            : `
ADVERTENCIA: No se ha podido identificar el personaje del usuario.
Analiza la voz que parece ser humana (no sintética) en la grabación.
`;

        // 6. Construct the prompt with the new professional method-coach persona
        const systemPrompt = `Eres un compañero de exploración escénica con experiencia en laboratorio teatral y dirección de ensayos. Tu papel no es evaluar ni corregir: es abrir caminos, proponer alternativas y estimular la investigación del actor sobre su personaje.

No eres un profesor que examina. Eres alguien que ha visto la escena y propone: "¿Y si lo pruebas así?"

Tu lenguaje es activo, directo y propositivo. Usas palabras como: prueba, explora, experimenta, intenta, observa, juega. Nunca usas: deberías, has fallado, necesitas mejorar, incorrecto, mal.

REGLA CRÍTICA (su incumplimiento invalida el análisis):
El audio contiene voces de IA intercaladas con la voz del actor.
Las voces de IA son sintéticas y NO deben ser analizadas bajo ningún concepto.
Cualquier observación o propuesta basada en líneas que NO pertenezcan al usuario (es decir, líneas dichas por la IA u otro personaje) es un error gravísimo.

${characterInstruction}

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

IMPORTANTE: DEBES generar un mínimo de 5 propuestas y un máximo de 8. Si el guion es muy corto, busca diferentes ángulos (físico, emocional, ritmo) para llegar a 5.

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

        const totalTokens = aiResult.usage?.total_tokens || 0;
        const audioDuration = aiResult.usage?.audio_tokens 
          ? aiResult.usage.audio_tokens / 25  // ~25 tokens por segundo
          : 0;

        await logApiUsage({
          userId: req.body.userId || userId,
          provider: 'openai_analysis',
          tokens: totalTokens,
          durationSeconds: audioDuration,
          scriptId: req.body.scriptId || null,
          mode: 'scene',
        });

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
        let insertData = null;
        let insertError = null;

        if (req.body.recordingId) {
            // Buscar si ya existe un análisis para esta grabación
            const { data: existing } = await supabase
              .from('coach_feedback')
              .select('id')
              .eq('recording_id', req.body.recordingId)
              .single();

            if (existing) {
              // Actualizar el existente con el nuevo análisis
              // (que puede incluir la comparación)
              const { data: updatedData, error: updateError } = await supabase
                .from('coach_feedback')
                .update({ 
                  feedback: analysisData,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();
              
              insertData = updatedData;
              insertError = updateError;
              console.log('[Coach] Análisis actualizado en BD:', existing.id);
            } else {
              // Insertar nuevo
              const { data: newData, error: newError } = await supabase
                .from('coach_feedback')
                .insert({
                  recording_id: req.body.recordingId,
                  user_id: userId,
                  script_id: scriptId,
                  feedback: analysisData,
                  created_at: new Date().toISOString()
                })
                .select()
                .single();
              
              insertData = newData;
              insertError = newError;
              console.log('[Coach] Nuevo análisis guardado en BD');
            }
        } else {
            console.error('[Coach] No recordingId provided, cannot save analysis properly.');
        }

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
    'susurrando':   { volume: '-80%', rate: '-10%', pitch: '-5%'  },
    'susurra':      { volume: '-80%', rate: '-10%', pitch: '-5%'  },
    'gritando':     { volume: '+60%', rate: '+10%', pitch: '+15%' },
    'grita':        { volume: '+60%', rate: '+10%', pitch: '+15%' },
    'enfadado':     { volume: '+40%', rate: '+5%',  pitch: '+8%'  },
    'enfadada':     { volume: '+40%', rate: '+5%',  pitch: '+8%'  },
    'triste':       { volume: '-50%', rate: '-15%', pitch: '-10%' },
    'llorando':     { volume: '-50%', rate: '-15%', pitch: '-10%' },
    'alegre':       { volume: '0%',   rate: '+5%',  pitch: '+5%'  },
    'feliz':        { volume: '0%',   rate: '+5%',  pitch: '+5%'  },
    'nervioso':     { volume: '+20%', rate: '+20%', pitch: '+12%' },
    'nerviosa':     { volume: '+20%', rate: '+20%', pitch: '+12%' },
    'cansado':      { volume: '-60%', rate: '-20%', pitch: '-8%'  },
    'cansada':      { volume: '-60%', rate: '-20%', pitch: '-8%'  },
    'sorprendido':  { volume: '+50%', rate: '+10%', pitch: '+20%' },
    'sorprendida':  { volume: '+50%', rate: '+10%', pitch: '+20%' },
    'asustado':     { volume: '-25%', rate: '+15%', pitch: '+18%' },
    'asustada':     { volume: '-25%', rate: '+15%', pitch: '+18%' },
    'serio':        { volume: '0%',   rate: '-5%',  pitch: '-3%'  },
    'seria':        { volume: '0%',   rate: '-5%',  pitch: '-3%'  },
    'sarcástico':   { volume: '0%',   rate: '+5%',  pitch: '+8%'  },
    'sarcástica':   { volume: '0%',   rate: '+5%',  pitch: '+8%'  },
    'irónico':      { volume: '0%',   rate: '+5%',  pitch: '+8%'  },
    'dudoso':       { volume: '-50%', rate: '-10%', pitch: '-5%'  },
    'pensativo':    { volume: '-50%', rate: '-15%', pitch: '-3%'  },
    'pensativa':    { volume: '-50%', rate: '-15%', pitch: '-3%'  },
};

/**
 * Genera audio TTS usando Azure Cognitive Services.
 * Devuelve el audio como Buffer (MP3).
 */
async function generateAzureTTS({ text, voice, ssmlConfig }) {
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
    let volume = '0%';

    if (context.hasQuestion) {
        pitch = '+8%';
        rate  = '+5%';
    }
    if (context.hasExclamation) {
        pitch  = '+12%';
        rate   = '+8%';
        volume = '+30%';
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
    const ssmlVolume = volume === '0%' ? 'default' : volume;
    const locale = voice.split('-').slice(0, 2).join('-'); // e.g. "es-ES", "es-MX"

    const expressAsOpen = ssmlConfig && ssmlConfig.style ? 
        `<mstts:express-as style="${ssmlConfig.style}"${ssmlConfig.styledegree ? ` styledegree="${ssmlConfig.styledegree}"` : ''}>` : '';
    const expressAsClose = ssmlConfig && ssmlConfig.style ? `</mstts:express-as>` : '';

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">
  <voice name="${voice}">
    ${expressAsOpen}
      <prosody rate="${ssmlRate}" pitch="${ssmlPitch}" volume="${ssmlVolume}">
        ${finalText}
      </prosody>
    ${expressAsClose}
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
        const error = new Error(`Azure TTS API error: ${response.status} ${errText}`);
        error.status = response.status;
        throw error;
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

        await logApiUsage({
          userId: req.body.userId || null,
          provider: 'openai_analysis',
          tokens: aiData.usage?.total_tokens || 0,
          scriptId: script_id,
          mode: 'quiz',
        });
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
    const { text, voice, userId, ssmlConfig } = req.body;

    if (!text || !voice || !userId) {
        return res.status(400).json({ error: 'Missing required fields: text, voice, userId' });
    }

    console.log(`[Azure TTS] Generating audio for voice: ${voice}`);

    try {
        const audioBuffer = await generateAzureTTS({ text, voice, ssmlConfig });

        await logApiUsage({
          userId: req.body.userId,
          provider: 'azure',
          characters: text.length,
          scriptId: req.body.scriptId || null,
          mode: req.body.mode || 'studio',
        });

        console.log(`[Azure TTS] ✅ Returning ${audioBuffer.length} bytes for voice ${voice}`);

        // Devolver MP3 binario — el cliente lo escribe en fichero temporal
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);

    } catch (error) {
        console.error('[Azure TTS] Error:', error);
        res.status(error.status || 500).json({ error: error.message, fallback: 'system' });
    }
});

// Endpoint: pre-generar o generar audio con Hume AI (Octave 1)
const { HumeClient } = require('hume');

app.get('/hume-voices', async (req, res) => {
    try {
        const fetch = require('node-fetch');
        const response = await fetch('https://api.hume.ai/v0/tts/voices', {
            headers: { 'X-Hume-Api-Key': process.env.HUME_API_KEY || '' }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/tts-hume', async (req, res) => {
    const { text, description, voiceId, userId } = req.body;
    if (!text || !userId) {
        return res.status(400).json({ error: 'Missing required fields: text, userId' });
    }

    try {
        const humeApiKey = process.env.HUME_API_KEY || '';
        
        if (!humeApiKey) {
            throw new Error('HUME_API_KEY no configurada');
        }

        const hume = new HumeClient({ apiKey: humeApiKey });
        
        const voiceName = voiceId || 'Kora'; 
        // Todas las voces proporcionadas (Kora, Tiana, Zane, Estela, Jhairo) son de la librería pública
        const voiceConfig = { name: voiceName, provider: 'HUME_AI' };

        console.log(`[Hume TTS] Generating audio for voice: ${voiceName}, description: ${description}`);

        const response = await hume.tts.synthesizeJson({
            utterances: [{
                text,
                description: description || undefined
            }],
            voice: voiceConfig
            // Importante: No pasar version: "2" para que funcione description
        });

        const audioBase64 = response.generations?.[0]?.audio;
        if (!audioBase64) {
            throw new Error('No audio in Hume response: ' + JSON.stringify(response));
        }

        let audioBuffer = Buffer.from(audioBase64, 'base64');
        
        // Estandarizar audio para evitar errores de reproducción en React Native (expo-av)
        try {
            audioBuffer = await new Promise((resolve, reject) => {
                const { PassThrough } = require('stream');
                const inputStream = new PassThrough();
                inputStream.end(audioBuffer);

                const chunks = [];
                const outputStream = new PassThrough();
                outputStream.on('data', chunk => chunks.push(chunk));
                outputStream.on('end', () => resolve(Buffer.concat(chunks)));
                outputStream.on('error', reject);

                ffmpeg(inputStream)
                    .audioCodec('libmp3lame')
                    .audioFrequency(44100)
                    .format('mp3')
                    .on('error', err => reject(err))
                    .pipe(outputStream);
            });
            console.log('[Hume TTS] 🔄 Audio standardized with ffmpeg');
        } catch (ffmpegErr) {
            console.error('[Hume TTS] Failed to standardize audio, sending raw:', ffmpegErr);
        }

        await logApiUsage({
            userId: req.body.userId,
            provider: 'hume', 
            characters: text.length,
            scriptId: req.body.scriptId || null,
            mode: req.body.mode || 'studio',
        });

        console.log(`[Hume TTS] ✅ Returning ${audioBuffer.length} bytes for voice ${voiceName}`);

        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);

    } catch (error) {
        console.error('[Hume TTS] Error:', error);
        // Devolver todo el stack o message
        res.status(500).json({ error: error.message, details: error.toString() });
    }
});


let azureVoicesCache = null;
let azureVoicesCacheTime = 0;

// Endpoint: obtener voces de Azure
app.get('/api/azure/voices', async (req, res) => {
    try {
        const azureKey = (process.env.AZURE_TTS_KEY || '').trim();
        const azureRegion = (process.env.AZURE_TTS_REGION || '').trim();

        if (!azureKey || !azureRegion) {
            return res.status(500).json({ error: 'Azure TTS not configured' });
        }

        const now = Date.now();
        // Caché de 24 horas
        if (azureVoicesCache && (now - azureVoicesCacheTime < 24 * 60 * 60 * 1000)) {
            return res.json(azureVoicesCache);
        }

        const response = await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
            headers: {
                'Ocp-Apim-Subscription-Key': azureKey,
            }
        });

        if (!response.ok) {
            throw new Error(`Azure API error: ${response.statusText}`);
        }

        const data = await response.json();
        
        const voices = data.map(v => ({
            id: v.ShortName,
            name: v.DisplayName,
            gender: v.Gender.toLowerCase(),
            locale: v.Locale,
            localeName: v.LocaleName,
            language: v.Locale.split('-')[0],
            country: v.Locale.split('-')[1],
            styles: v.StyleList || [],
            voiceType: v.VoiceType,
            sampleRate: v.SampleRateHertz,
            provider: 'azure'
        }));

        azureVoicesCache = voices;
        azureVoicesCacheTime = now;

        res.json(voices);
    } catch (error) {
        console.error('[Azure TTS] Error fetching voices:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint unificado para previsualizaciones (caché en DB/Storage)
app.get('/api/tts/preview/:provider/:voiceId', async (req, res) => {
    const { provider, voiceId } = req.params;
    
    try {
        const filePath = `previews/${provider}/${voiceId}.mp3`;
        
        // 1. Comprobar si existe en Supabase
        const { data: fileExists } = await supabase.storage
            .from('tts-cache')
            .list(`previews/${provider}`, {
                search: `${voiceId}.mp3`
            });
            
        if (fileExists && fileExists.length > 0) {
            // Descargar y servir el binario usando el cliente de server (bypass RLS)
            const { data: audioData, error: downloadError } = await supabase.storage
                .from('tts-cache')
                .download(filePath);
                
            if (audioData) {
                const arrayBuffer = await audioData.arrayBuffer();
                res.set('Content-Type', 'audio/mpeg');
                res.set('Content-Length', arrayBuffer.byteLength);
                return res.send(Buffer.from(arrayBuffer));
            }
        }
        
        // 2. Si no existe, generarlo
        let audioBuffer;
        
        if (provider === 'azure') {
            const textToSpeak = "Hola, esta es una muestra de mi voz en Scriptquiu. Espero que te guste.";
            audioBuffer = await generateAzureTTS({ text: textToSpeak, voice: voiceId });

            await logApiUsage({
              userId: req.query.userId || req.body?.userId || null,
              provider: 'azure',
              characters: textToSpeak.length,
              mode: 'preview',
            });
        } else if (provider === 'elevenlabs') {
            const textToSpeak = "Hola, esta es una muestra de mi voz en Scriptquiu. Espero que te guste.";
            const elevenKey = (process.env.ELEVENLABS_API_KEY || process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '').trim();
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
                method: 'POST',
                headers: {
                    'xi-api-key': elevenKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: 'eleven_multilingual_v2'
                })
            });
            if (!response.ok) throw new Error(`ElevenLabs error: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            audioBuffer = Buffer.from(buffer);

            await logApiUsage({
              userId: req.query.userId || req.body?.userId || null,
              provider: 'elevenlabs',
              characters: textToSpeak.length,
              mode: 'preview',
            });
        } else if (provider === 'openai') {
            const textToSpeak = "Hola, esta es una muestra de mi voz en Scriptquiu. Espero que te guste.";
            const openaiKey = (process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '').trim();
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: textToSpeak,
                    voice: voiceId
                })
            });
            if (!response.ok) throw new Error(`OpenAI error: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            audioBuffer = Buffer.from(buffer);

            await logApiUsage({
              userId: req.query.userId || req.body?.userId || null,
              provider: 'openai_tts',
              characters: textToSpeak.length,
              mode: 'preview',
            });
        } else if (provider === 'hume') {
            const textToSpeak = "Hola, esta es una muestra de mi voz en Scriptquiu. Espero que te guste.";
            const { HumeClient } = require('hume');
            const humeApiKey = process.env.HUME_API_KEY || '';
            if (!humeApiKey) throw new Error('HUME_API_KEY no configurada');

            const hume = new HumeClient({ apiKey: humeApiKey });

            const voiceName = voiceId || 'Kora'; 
            const voiceConfig = { name: voiceName, provider: 'HUME_AI' };

            const response = await hume.tts.synthesizeJson({
                utterances: [{
                    text: textToSpeak,
                    description: "tono neutro, claro y conversacional"
                }],
                voice: voiceConfig
            });

            const audioBase64 = response.generations?.[0]?.audio;
            if (!audioBase64) throw new Error('No audio in Hume response: ' + JSON.stringify(response));

            let rawBuffer = Buffer.from(audioBase64, 'base64');
            
            // Estandarizar audio para evitar errores de reproducción en React Native (expo-av)
            try {
                audioBuffer = await new Promise((resolve, reject) => {
                    const { PassThrough } = require('stream');
                    const inputStream = new PassThrough();
                    inputStream.end(rawBuffer);

                    const chunks = [];
                    const outputStream = new PassThrough();
                    outputStream.on('data', chunk => chunks.push(chunk));
                    outputStream.on('end', () => resolve(Buffer.concat(chunks)));
                    outputStream.on('error', reject);

                    ffmpeg(inputStream)
                        .audioCodec('libmp3lame')
                        .audioFrequency(44100)
                        .format('mp3')
                        .on('error', err => reject(err))
                        .pipe(outputStream);
                });
                console.log('[Hume TTS Preview] 🔄 Audio standardized with ffmpeg');
            } catch (ffmpegErr) {
                console.error('[Hume TTS Preview] Failed to standardize audio, sending raw:', ffmpegErr);
                audioBuffer = rawBuffer;
            }

            await logApiUsage({
              userId: req.query.userId || req.body?.userId || null,
              provider: 'hume',
              characters: textToSpeak.length,
              mode: 'preview',
            });
        } else {
            return res.status(400).json({ error: 'Provider not supported for previews' });
        }
        
        // 3. Subir a Supabase
        await supabase.storage
            .from('tts-cache')
            .upload(filePath, audioBuffer, {
                contentType: 'audio/mpeg',
                upsert: true
            });
            
        // 4. Devolver al cliente
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
        
    } catch (error) {
        console.error(`[Preview] Error generating preview for ${provider}/${voiceId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- API USAGE SUMMARY ---
app.get('/usage/summary', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('api_usage')
      .select('provider, characters_count, tokens_count, estimated_cost_eur')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    if (error) throw error;

    // Agrupar por proveedor
    const summary = data.reduce((acc, row) => {
      if (!acc[row.provider]) {
        acc[row.provider] = {
          calls: 0,
          characters: 0,
          tokens: 0,
          cost: 0,
        };
      }
      acc[row.provider].calls += 1;
      acc[row.provider].characters += row.characters_count;
      acc[row.provider].tokens += row.tokens_count;
      acc[row.provider].cost += row.estimated_cost_eur;
      return acc;
    }, {});

    const totalCost = data.reduce(
      (sum, row) => sum + row.estimated_cost_eur, 0
    );

    res.json({
      success: true,
      month: startOfMonth.toISOString(),
      totalCostEur: totalCost.toFixed(4),
      byProvider: summary,
    });

  } catch (e) {
    console.error('[Usage] Error obteniendo resumen:', e);
    res.status(500).json({ error: e.message });
  }
});

require('./parsePdfLogic').setupParsePdf(app, supabase);

app.listen(PORT, () => {
    console.log(`🚀 Script Cue Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
