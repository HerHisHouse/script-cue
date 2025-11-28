// Script para forzar re-parse de un guion específico
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yucsroyorgebeuvcsmib.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y3Nyb3lvcmdlYmV1dmNzbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwODIxOTUsImV4cCI6MjA3NzY1ODE5NX0.1K6GTmaRZj3xAehUap7dT-FQ5YEpBAbQUYoxNcTVyW0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function reparseScript(scriptId) {
  try {
    console.log(`Buscando guion con ID: ${scriptId}`);
    
    // Obtener información del guion
    const { data: script, error: scriptError } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();
    
    if (scriptError || !script) {
      console.error('Error al obtener el guion:', scriptError);
      return;
    }
    
    console.log('Guion encontrado:', script.title);
    console.log('PDF URL:', script.pdf_url);
    console.log('Metadata actual:', JSON.stringify(script.metadata, null, 2));
    
    // Obtener el archivo PDF del storage
    let filePath = null;
    if (script.pdf_url) {
      // Extraer la ruta del archivo desde la URL
      const urlParts = script.pdf_url.split('/');
      filePath = urlParts.slice(urlParts.indexOf('scripts') + 1).join('/');
      console.log('Ruta del archivo:', filePath);
    }
    
    if (!filePath) {
      console.error('No se pudo determinar la ruta del archivo PDF');
      return;
    }
    
    // Forzar re-parse llamando a la función
    console.log('Forzando re-parse...');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        scriptId: scriptId,
        filePath: filePath,
        skipCharacterDetection: false
      })
    });
    
    const result = await response.json();
    console.log('Resultado del re-parse:', result);
    
    if (result.success) {
      console.log('✅ Re-parse exitoso');
      
      // Verificar el metadata actualizado
      const { data: updatedScript } = await supabase
        .from('scripts')
        .select('metadata')
        .eq('id', scriptId)
        .single();
      
      if (updatedScript?.metadata?.structuredLines) {
        console.log('✅ structuredLines generado correctamente');
        console.log('Número de líneas estructuradas:', updatedScript.metadata.structuredLines.length);
        
        // Mostrar algunas líneas de ejemplo
        const dialogueLines = updatedScript.metadata.structuredLines.filter(line => line.type === 'dialogue');
        console.log('Líneas de diálogo encontradas:', dialogueLines.length);
        
        if (dialogueLines.length > 0) {
          console.log('Ejemplo de diálogo con coordenadas:');
          console.log(JSON.stringify(dialogueLines[0], null, 2));
        }
      } else {
        console.log('⚠️  No se encontró structuredLines en el metadata');
      }
    } else {
      console.error('❌ Error en el re-parse:', result.error);
    }
    
  } catch (error) {
    console.error('Error general:', error);
  }
}

// Ejecutar para el script específico
const scriptId = '16fb4c32-dc19-46a9-b409-50ebe6772a33';
reparseScript(scriptId);