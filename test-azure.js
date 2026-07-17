const fetch = require('node-fetch');
require('dotenv').config();

async function test() {
  const body = {
    text: '¡Pues que deje de intentarlo todo el tiempo!',
    voice: 'es-ES-ElviraNeural',
    userId: 'test'
  };

  const res = await fetch(process.env.EXPO_PUBLIC_RENDER_SERVER_URL + '/tts-azure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  console.log('Status:', res.status);
  const json = await res.json();
  console.log('Response:', json);
}

test();
