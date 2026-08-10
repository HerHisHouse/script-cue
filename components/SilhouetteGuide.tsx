import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

export type ShotType = 'closeup' | 'medium' | 'american' | 'wide';

// Porcentaje de la silueta completa visible según el plano
// 1.0 = cuerpo entero, valores menores recortan desde arriba
// (asumiendo que el SVG está en vista frontal, cabeza arriba)
const SHOT_VISIBLE_HEIGHT: Record<ShotType, number> = {
  closeup:  0.22,  // cabeza y hombros
  medium:   0.48,  // hasta pecho
  american: 0.75,  // hasta muslo
  wide:     1.0,   // cuerpo entero
};

export function SilhouetteGuide({ shotType }: { shotType: ShotType }) {
  const [svgXml, setSvgXml] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadSvg() {
      try {
        // Cargar el asset SVG local como texto
        const asset = Asset.fromModule(
          require('../assets/images/body-silhouette.svg')
        );
        await asset.downloadAsync();
        const content = await FileSystem.readAsStringAsync(
          asset.localUri || asset.uri
        );
        setSvgXml(content);
      } catch (e) {
        console.warn('[SilhouetteGuide] Error cargando SVG:', e);
      }
    }
    loadSvg();
  }, []);

  if (!svgXml) return null;

  const visibleRatio = SHOT_VISIBLE_HEIGHT[shotType];
  const screenHeight = Dimensions.get('window').height;
  
  // En lugar de solo recortar el contenedor, calculamos una escala
  // para que la porción visible ocupe toda la altura deseada.
  const scale = 1 / visibleRatio;
  
  // Altura base de la silueta en plano general (cuerpo entero)
  const baseHeight = screenHeight * 0.95;
  // Como el SVG original es un cuadrado (viewBox 206x206), le damos
  // un ancho base igual al alto para que no se encoja por los lados.
  const baseWidth = baseHeight; 

  const targetHeight = baseHeight * scale;
  const targetWidth = baseWidth * scale;

  // Inyectar preserveAspectRatio para que la cabeza (top del SVG)
  // siempre quede anclada en la parte superior del contenedor al escalar.
  const modifiedSvgXml = svgXml.replace('<svg ', '<svg preserveAspectRatio="xMidYMin meet" ');

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-start' }]} pointerEvents="none">
      <View
        style={{
          width: targetWidth,
          height: targetHeight,
          // Un pequeño margen superior para que la cabeza no toque el borde de la pantalla
          marginTop: screenHeight * 0.05,
        }}
      >
        <SvgXml
          xml={modifiedSvgXml}
          width="100%"
          height="100%"
          fill="rgba(255,255,255,0.18)"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={2}
        />
      </View>
    </View>
  );
}

export default SilhouetteGuide;
