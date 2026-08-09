import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path, G } from 'react-native-svg';

export type ShotType = 'closeup' | 'medium' | 'american' | 'wide';

/**
 * Silueta humana SVG semi-transparente que se superpone sobre la cámara
 * para guiar al actor a colocarse en el encuadre correcto según el tipo
 * de plano seleccionado (primer plano, medio, americano, general).
 *
 * Se utiliza viewBox adaptativo con preserveAspectRatio="xMidYMin meet"
 * para evitar deformaciones y mantener una silueta realista y estética.
 */

// ViewBox de la figura completa: 200 x 420
// Cabeza centro: (100, 65), Hombros: Y=130, Cintura: Y=230, Caderas: Y=290, Pies: Y=410
const SHOT_VIEWBOX: Record<ShotType, string> = {
  closeup:  '25 20 150 160',  // Cabeza + hombros
  medium:   '15 20 170 230',  // Cabeza hasta el pecho/cintura
  american: '5 15 190 320',   // Cabeza hasta los muslos
  wide:     '0 0 200 420',    // Cuerpo completo
};

function SilhouetteGuide({ shotType }: { shotType: ShotType }) {
  const viewBox = SHOT_VIEWBOX[shotType] || SHOT_VIEWBOX.medium;

  const fillColor = 'rgba(255, 255, 255, 0.18)';
  const strokeColor = 'rgba(255, 255, 255, 0.60)';
  const strokeW = 2;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMin meet"
      >
        <G>
          {/* Cabeza anatómica */}
          <Ellipse
            cx="100"
            cy="65"
            rx="28"
            ry="36"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />

          {/* Cuerpo completo en curva fluida (Cuello, Hombros, Brazos, Torso, Caderas, Piernas) */}
          <Path
            d="
              M 88 96
              C 87 108, 72 122, 36 134
              C 24 138, 20 150, 24 168
              C 27 182, 42 185, 48 170
              C 52 158, 56 148, 60 144
              C 63 170, 65 205, 68 230
              C 70 255, 60 275, 58 305
              C 56 335, 62 380, 64 410
              L 92 410
              C 92 365, 94 315, 96 265
              C 97 250, 98 250, 100 250
              C 102 250, 103 250, 104 265
              C 106 315, 108 365, 108 410
              L 136 410
              C 138 380, 144 335, 142 305
              C 140 275, 130 255, 132 230
              C 135 205, 137 170, 140 144
              C 144 148, 148 158, 152 170
              C 158 185, 173 182, 176 168
              C 180 150, 176 138, 164 134
              C 128 122, 113 108, 112 96
              Z
            "
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '8%',
  },
});

export default SilhouetteGuide;
