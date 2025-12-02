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

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

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

        // 4. Create mixed audio track
        console.log('[Casting] Mixing audio tracks...');

        // Build FFmpeg filter complex for mixing
        // We'll use amix to overlay AI segments on top of user audio
        const filterParts = [`[0:a]`]; // User audio as base
        const overlayInputs = [];

        aiSegments.forEach((segment, idx) => {
            overlayInputs.push(`[${idx + 1}:a]adelay=${segment.startTime * 1000}|${segment.startTime * 1000}[a${idx}]`);
        });

        const mixInputs = overlayInputs.map((_, idx) => `[a${idx}]`).join('');
        const filterComplex = overlayInputs.length > 0
            ? `${overlayInputs.join(';')};[0:a]${mixInputs}amix=inputs=${aiSegments.length + 1}:duration=longest[outa]`
            : '[0:a]anull[outa]';

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
                .audioBitrate('128k')
                .output(mixedAudioFile)
                .on('start', (cmd) => console.log('[FFmpeg] Mix command:', cmd))
                .on('progress', (progress) => console.log(`[FFmpeg] Mixing: ${progress.percent?.toFixed(1)}%`))
                .on('end', () => {
                    console.log('[Casting] Audio mixing completed');
                    resolve();
                })
                .on('error', reject)
                .run();
        });

        // 5. Replace video audio with mixed audio
        console.log('[Casting] Replacing video audio track...');
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoFile)
                .input(mixedAudioFile)
                .outputOptions([
                    '-c:v copy',           // Copy video stream without re-encoding
                    '-c:a aac',            // Encode audio as AAC
                    '-map 0:v:0',          // Map video from first input
                    '-map 1:a:0',          // Map audio from second input
                    '-shortest'            // Match shortest stream duration
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

        // 6. Upload processed video to Supabase
        const processedFileName = `${userId}/casting_${Date.now()}_processed.mp4`;
        const processedBuffer = await fs.promises.readFile(outputFile);

        console.log('[Casting] Uploading processed video...');
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('recordings')
            .upload(processedFileName, processedBuffer, {
                contentType: 'video/mp4',
                upsert: false
            });

        if (uploadError) {
            throw new Error(`Failed to upload processed video: ${uploadError.message}`);
        }

        console.log('[Casting] Success! Processed video uploaded:', processedFileName);

        // Cleanup temp files
        await fs.promises.rm(processTempDir, { recursive: true, force: true });

        // Cleanup uploaded files in multer temp
        for (const file of files) {
            try { await fs.promises.unlink(file.path); } catch { }
        }

        res.json({
            success: true,
            path: processedFileName,
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

        // Cleanup uploaded files
        if (req.files) {
            for (const file of req.files) {
                try { await fs.promises.unlink(file.path); } catch (cleanupError) {
                    console.warn(`[Casting] Error cleaning up multer temp file ${file.path}:`, cleanupError);
                }
            }
        }

        res.status(500).json({
            error: 'Video processing failed',
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🎵 Audio Merge Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
