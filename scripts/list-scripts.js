const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://yucsroyorgebeuvcsmib.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y3Nyb3lvcmdlYmV1dmNzbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwODIxOTUsImV4cCI6MjA3NzY1ODE5NX0.1K6GTmaRZj3xAehUap7dT-FQ5YEpBAbQUYoxNcTVyW0'
);

async function listScripts() {
  const { data: scripts, error } = await supabase
    .from('scripts')
    .select('id, title, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Scripts disponibles:');
  scripts.forEach(script => {
    console.log(`- ID: ${script.id}`);
    console.log(`  Título: ${script.title}`);
    console.log(`  Fecha: ${script.created_at}`);
    console.log(`  Tiene structuredLines: ${script.metadata?.structuredLines ? 'SÍ' : 'NO'}`);
    console.log('');
  });
}

listScripts();