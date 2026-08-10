const fetch = require('node-fetch');

async function testREST(name, payload) {
    console.log(`\n--- Testing REST ${name} ---`);
    try {
        const res = await fetch('https://script-cue-merge-server.onrender.com/test-raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: 'https://api.hume.ai/v0/tts',
                payload: payload
            })
        });
        const data = await res.json();
        if (data.audio_length) {
            console.log(`SUCCESS. Has audio: ${data.audio_length} bytes`);
        } else {
            console.log('Result:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.log(`REST ERROR:`, e.message);
    }
}

async function run() {
    await testREST('Kora (Correct format: voice inside utterances)', {
        utterances: [{
            text: "Hola",
            voice: { name: "Kora", provider: "HUME_AI" }
        }]
    });

    await testREST('Kora WITH description (Correct format)', {
        utterances: [{
            text: "Hola",
            description: "happy",
            voice: { name: "Kora", provider: "HUME_AI" }
        }]
    });
    
    await testREST('Jhairo (Correct format UUID)', {
        utterances: [{
            text: "Hola",
            voice: { id: "b1d54472-b83c-47c3-a146-5285b1f95bf7", provider: "HUME_AI" }
        }]
    });
}
run();
