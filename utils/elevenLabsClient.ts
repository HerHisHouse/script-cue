export async function generateElevenLabsAudio(text: string, voiceId: string): Promise<ArrayBuffer> {
  const apiKey = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ElevenLabs API Key');
  }

  console.log(`[ElevenLabs API] Model: eleven_v3 | Text: "${text}"`);
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      }
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs API Error: ${response.status} ${errorBody}`);
  }

  return await response.arrayBuffer();
}
