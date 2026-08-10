const { HumeClient } = require('hume');
require('dotenv').config();

async function run() {
    const hume = new HumeClient({ apiKey: process.env.HUME_API_KEY });
    const voices = await hume.tts.voices.list();
    console.log(JSON.stringify(voices, null, 2));
}
run().catch(console.error);
