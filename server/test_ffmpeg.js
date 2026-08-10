const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const { PassThrough } = require('stream');

ffmpeg.setFfmpegPath(ffmpegPath);

function standardizeAudioBuffer(inputBuffer) {
    return new Promise((resolve, reject) => {
        const inputStream = new PassThrough();
        inputStream.end(inputBuffer);

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
}

async function run() {
    const buf = fs.readFileSync('test_hume_preview.mp3');
    const outBuf = await standardizeAudioBuffer(buf);
    fs.writeFileSync('test_hume_preview_fixed.mp3', outBuf);
    console.log("Size original:", buf.length);
    console.log("Size fixed:", outBuf.length);
}
run().catch(console.error);
