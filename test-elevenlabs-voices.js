require('dotenv').config();

async function listElevenLabsVoices() {
    const apiKey = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;

    if (!apiKey) {
        console.error('❌ Missing EXPO_PUBLIC_ELEVENLABS_API_KEY in .env');
        return;
    }

    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: {
                'xi-api-key': apiKey
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error: ${response.status} ${errorText}`);
            return;
        }

        const data = await response.json();

        console.log('\n✅ Available ElevenLabs Voices:\n');
        console.log('Total voices:', data.voices.length);
        console.log('\n');

        data.voices.forEach((voice, index) => {
            console.log(`${index + 1}. ${voice.name}`);
            console.log(`   ID: ${voice.voice_id}`);
            console.log(`   Category: ${voice.category || 'N/A'}`);
            console.log(`   Labels: ${voice.labels ? Object.entries(voice.labels).map(([k, v]) => `${k}:${v}`).join(', ') : 'N/A'}`);
            console.log('');
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

listElevenLabsVoices();
