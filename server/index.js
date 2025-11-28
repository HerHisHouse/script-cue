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
app.use(express.json({ limit: '50mb' }));

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

        // Download all segments
        const downloadedFiles = [];
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const localPath = path.join(tempDir, `segment_${i}.m4a`);

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

        // Create concat list file for FFmpeg
        const listContent = downloadedFiles.map(f => `file '${f}'`).join('\n');
        await fs.promises.writeFile(listFile, listContent);

        console.log('[Merge] Starting FFmpeg merge...');

        // Run FFmpeg
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(listFile)
                .inputOptions(['-f concat', '-safe 0'])
                // Force re-encode to ensure compatibility between mp3 and m4a
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

app.listen(PORT, () => {
    console.log(`🎵 Audio Merge Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
