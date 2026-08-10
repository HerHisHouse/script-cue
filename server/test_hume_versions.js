const fetch = require('node-fetch');

async function testVoiceREST(name, payload) {
    console.log(`\n--- Testing REST ${name} ---`);
    try {
        const res = await fetch('https://api.hume.ai/v0/tts/synthesize', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Hume-Api-Key': process.env.HUME_API_KEY || ''
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('REST Result:', data);
    } catch (e) {
        console.log(`REST ERROR:`, e.message);
    }
}

async function run() {
    await testVoiceREST('Kora Octave 2 Direct', {
        utterances: [{ text: "Hola" }],
        voice: { name: "Kora", provider: "HUME_AI" },
        version: "2"
    });
    
    await testVoiceREST('Estela Octave 2 Direct (id)', {
        utterances: [{ text: "Hola" }],
        voice: { id: "e8dcf0c3-0edc-4360-9d72-acdafceff6d2", provider: "HUME_AI" },
        version: "2"
    });
}
run();
