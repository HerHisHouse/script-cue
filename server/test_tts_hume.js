const fetch = require('node-fetch');
const fs = require('fs');

async function testTts(voiceId, description) {
    console.log(`\n--- Testing ${voiceId} ${description ? 'with' : 'without'} description ---`);
    try {
        const res = await fetch('https://script-cue-merge-server.onrender.com/tts-hume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: "Hola, esto es una prueba.",
                voiceId: voiceId,
                description: description,
                userId: "test_user_id"
            })
        });
        const contentType = res.headers.get('content-type');
        if (res.ok) {
            const buf = await res.buffer();
            const fileName = `test_${voiceId}_${description ? 'with_desc' : 'no_desc'}.mp3`;
            fs.writeFileSync(fileName, buf);
            console.log(`SUCCESS. Saved ${buf.length} bytes to ${fileName}`);
        } else {
            console.log(`ERROR:`, await res.text());
        }
    } catch (e) {
        console.log(`FETCH ERROR:`, e.message);
    }
}

async function run() {
    await testTts('Kora', null);
    await testTts('Kora', 'This person is speaking in a happy tone.');
    await testTts('b1d54472-b83c-47c3-a146-5285b1f95bf7', null);
    await testTts('b1d54472-b83c-47c3-a146-5285b1f95bf7', 'This person is speaking in a happy tone.');
}
run();
