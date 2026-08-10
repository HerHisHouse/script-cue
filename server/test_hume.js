const { HumeClient } = require('hume');

async function test() {
  try {
    const hume = new HumeClient({ apiKey: process.env.HUME_API_KEY });
    console.log("Calling synthesizeJson with voice...");
    const response = await hume.tts.synthesizeJson({
      utterances: [
        { text: "Hola probando 1 2 3", description: "feliz, tono entusiasta" }
      ],
      voice: { name: 'Kora' }
    });
    console.log("Success! Keys:", Object.keys(response));
    if (response.generations) {
        console.log("Generations length:", response.generations.length);
    }
  } catch (e) {
    console.error("Failed:", e);
  }
}
test();
