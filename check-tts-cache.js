require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTTSCache() {
    try {
        console.log('🔍 Revisando caché de TTS con ElevenLabs...\n');

        // Buscar entradas de caché con provider = 'elevenlabs'
        const { data: cacheEntries, error } = await supabase
            .from('tts_cache')
            .select('*')
            .eq('provider', 'elevenlabs')
            .limit(10);

        if (error) {
            console.error('❌ Error al buscar caché:', error);
            return;
        }

        if (!cacheEntries || cacheEntries.length === 0) {
            console.log('✅ No hay entradas de caché con ElevenLabs');
            return;
        }

        console.log(`Encontradas ${cacheEntries.length} entradas de caché:\n`);

        for (const entry of cacheEntries) {
            console.log(`- Line ID: ${entry.line_id}`);
            console.log(`  Character: ${entry.character_name}`);
            console.log(`  Voice ID: ${entry.voice_id}`);
            console.log(`  Storage Path: ${entry.storage_path}`);
            console.log('');
        }

        // Buscar voice_ids únicos
        const uniqueVoiceIds = [...new Set(cacheEntries.map(e => e.voice_id))];
        console.log('\nVoice IDs únicos encontrados:');
        uniqueVoiceIds.forEach(id => console.log(`  - ${id}`));

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkTTSCache();
