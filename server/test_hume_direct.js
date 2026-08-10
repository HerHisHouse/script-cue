const fetch = require('node-fetch');
const fs = require('fs');
async function run() {
    try {
        const res = await fetch('https://api.hume.ai/v0/tts/synthesize', {
            method: 'POST',
            headers: { 
                'X-Hume-Api-Key': process.env.HUME_API_KEY || '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                utterances: [{ text: "Hola", description: "happy" }],
                voice: { name: "Kora", provider: "HUME_AI" }
            })
        });
        if (!res.ok) {
            console.log('Kora Error:', await res.text());
        } else {
            const buf = await res.buffer();
            fs.writeFileSync('kora_direct.mp3', buf);
            console.log('Kora direct saved:', buf.length);
        }
    } catch (e) {
        console.log(e.message);
    }
}
run();
