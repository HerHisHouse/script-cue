import { clearElevenLabsCache } from '../utils/voiceService';

/**
 * Script para limpiar la caché de voces de ElevenLabs
 * Ejecutar cuando:
 * - Cambies de plan en ElevenLabs
 * - Agregues nuevas voces clonadas
 * - Agregues voces de la librería
 * - Las voces no se actualicen correctamente
 */

async function clearVoicesCache() {
  console.log('🧹 Limpiando caché de voces de ElevenLabs...');
  
  try {
    clearElevenLabsCache();
    console.log('✅ Caché limpiada exitosamente');
    console.log('📱 Reinicia la app para ver los cambios');
  } catch (error) {
    console.error('❌ Error limpiando caché:', error);
  }
}

// Ejecutar
clearVoicesCache();
