const { HumeClient } = require('hume');
require('dotenv').config();

async function run() {
    const hume = new HumeClient({ apiKey: process.env.HUME_API_KEY });
    const response = await hume.tts.synthesizeJson({
        utterances: [{ text: "Hola mundo", description: "happy" }],
        voice: { name: "Kora" }
    });
    const audioBase64 = response.generations?.[0]?.audio;
    const buf = Buffer.from(audioBase64, 'base64');
    console.log("Size:", buf.length);
    console.log("Hex start:", buf.toString('hex', 0, 16));
}
run().catch(console.error);
