require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixElevenLabsVoiceIds() {
    try {
        console.log('🔍 Buscando personajes con voice_id de ElevenLabs...\n');

        // Buscar todos los personajes con voice_provider = 'elevenlabs'
        const { data: characters, error } = await supabase
            .from('characters')
            .select('*')
            .eq('voice_provider', 'elevenlabs');

        if (error) {
            console.error('❌ Error al buscar personajes:', error);
            return;
        }

        if (!characters || characters.length === 0) {
            console.log('✅ No se encontraron personajes con ElevenLabs configurado');
            return;
        }

        console.log(`Encontrados ${characters.length} personajes con ElevenLabs:\n`);

        // Mapeo de voice_ids incorrectos (minúsculas) a correctos
        const voiceIdMap = {
            'khcvmklqzzo0o30ernvn': 'KHCvMklQZZo0O30ERnVn', // Sara Martin
            'rgxx32wyogrd7gfnifsf': 'RgXx32WYOGrd7gFNifSf', // Eva Dorado
            'z3kttyybqrml7ckdgcji': 'z3kTTwYbQrmL7ckdGcJi', // Martin Osborne
        };

        for (const character of characters) {
            console.log(`- ${character.name} (ID: ${character.id})`);
            console.log(`  Voice ID actual: ${character.voice_id}`);

            const correctVoiceId = voiceIdMap[character.voice_id?.toLowerCase()];

            if (correctVoiceId && character.voice_id !== correctVoiceId) {
                console.log(`  ✏️  Corrigiendo a: ${correctVoiceId}`);

                const { error: updateError } = await supabase
                    .from('characters')
                    .update({ voice_id: correctVoiceId })
                    .eq('id', character.id);

                if (updateError) {
                    console.error(`  ❌ Error al actualizar: ${updateError.message}`);
                } else {
                    console.log(`  ✅ Actualizado correctamente`);
                }
            } else if (correctVoiceId) {
                console.log(`  ✅ Ya está correcto`);
            } else {
                console.log(`  ⚠️  Voice ID no reconocido`);
            }
            console.log('');
        }

        console.log('\n🎉 Proceso completado!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fixElevenLabsVoiceIds();
