#!/bin/bash

# Script para reconstruir el APK de Android con las correcciones de red
# Este script automatiza el proceso de build con EAS

echo "🔧 Reconstruyendo APK de Android con correcciones de red..."
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "app.json" ]; then
    echo "❌ Error: Este script debe ejecutarse desde la raíz del proyecto"
    exit 1
fi

# Verificar que EAS CLI está instalado
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI no está instalado"
    echo "Instalando EAS CLI..."
    npm install -g eas-cli
fi

# Mostrar cambios aplicados
echo "✅ Cambios aplicados:"
echo "   - Configuración de cliente Supabase mejorada"
echo "   - Uso de Blob en lugar de ArrayBuffer para Android"
echo "   - Sistema de reintentos automáticos (3 intentos)"
echo "   - Permisos de red agregados (INTERNET, ACCESS_NETWORK_STATE)"
echo "   - Plugin de configuración de red para Android"
echo ""

# Preguntar si desea continuar
read -p "¿Deseas continuar con el build? (s/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Build cancelado"
    exit 0
fi

# Cancelar builds anteriores si existen
echo "🧹 Cancelando builds anteriores..."
eas build:cancel --platform android 2>/dev/null || true

# Limpiar caché de Expo
echo "🧹 Limpiando caché..."
npx expo start --clear 2>/dev/null &
sleep 2
pkill -f "expo start" 2>/dev/null || true

# Iniciar build
echo ""
echo "🚀 Iniciando build de Android..."
echo "   Perfil: preview"
echo "   Tipo: APK"
echo ""

eas build --platform android --profile preview

# Verificar resultado
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completado exitosamente!"
    echo ""
    echo "📱 Próximos pasos:"
    echo "   1. Descarga el APK desde el link proporcionado por EAS"
    echo "   2. Instala el APK en tu dispositivo Android"
    echo "   3. Prueba importar un guión"
    echo ""
    echo "📋 Para verificar logs en el dispositivo:"
    echo "   adb logcat | grep -i 'upload\\|supabase\\|network'"
    echo ""
else
    echo ""
    echo "❌ Error en el build"
    echo "Revisa los logs arriba para más detalles"
    exit 1
fi
