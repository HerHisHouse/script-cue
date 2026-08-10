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
  // Alto del contenedor recortado según el plano — el SVG
  // se posiciona arriba (cabeza) y se recorta por overflow
  const clippedHeight = screenHeight * visibleRatio;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: clippedHeight,
          overflow: 'hidden',
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
      >
        <SvgXml
          xml={svgXml}
          width="60%"
          height={screenHeight * 0.95}
          // Altura fija del cuerpo entero; el contenedor
          // recorta la parte inferior según el plano
          fill="rgba(255,255,255,0.18)"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={2}
        />
      </View>
    </View>
  );
}

export default SilhouetteGuide;
