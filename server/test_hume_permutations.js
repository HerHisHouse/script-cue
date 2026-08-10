const fetch = require('node-fetch');

async function testVoice(name, payload) {
    console.log(`\n--- Testing ${name} ---`);
    try {
        const res = await fetch('https://script-cue-merge-server.onrender.com/test-hume-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            console.log(`SUCCESS. Has audio: ${data.response.generations?.[0]?.audio_length}`);
            delete data.response.generations;
            console.log(JSON.stringify(data.response, null, 2));
        } else {
            console.log(`ERROR:`, data.error);
        }
    } catch (e) {
        console.log(`FETCH ERROR:`, e.message);
    }
}

async function run() {
    await testVoice('Kora (name) without description', {
        utterances: [{ text: "Hola" }],
        voice: { name: "Kora", provider: "HUME_AI" }
    });

    await testVoice('Kora (name) WITH description', {
        utterances: [{ text: "Hola", description: "This person is speaking in a happy tone." }],
        voice: { name: "Kora", provider: "HUME_AI" }
    });

    await testVoice('Estela (id) without description', {
        utterances: [{ text: "Hola" }],
        voice: { id: "e8dcf0c3-0edc-4360-9d72-acdafceff6d2", provider: "HUME_AI" }
    });

    await testVoice('Estela (name=UUID) incorrect format', {
        utterances: [{ text: "Hola" }],
        voice: { name: "e8dcf0c3-0edc-4360-9d72-acdafceff6d2", provider: "HUME_AI" }
    });
}
run();
