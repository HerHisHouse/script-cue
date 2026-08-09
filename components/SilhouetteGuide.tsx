import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path, G } from 'react-native-svg';

export type ShotType = 'closeup' | 'medium' | 'american' | 'wide';

/**
 * Silueta humana SVG semi-transparente que se superpone sobre la cámara
 * para guiar al actor a colocarse en el encuadre correcto según el tipo
 * de plano seleccionado (primer plano, medio, americano, general).
 *
 * Proporciones anatómicas humanas reales (cabeza, hombros, brazos hasta medio muslo, torso y piernas)
 * con aire arriba y abajo en encuadre vertical u horizontal.
 */

// Canvas base: 240 x 440
// Cabeza: Y=24-76 (Centro Y=50), Manos: Y=246, Pies: Y=415
const SHOT_VIEWBOX: Record<ShotType, string> = {
  closeup:  '10 -5 220 180',  // Cabeza y hombros
  medium:   '0 -10 240 260',  // Hasta el pecho
  american: '-15 -20 270 360',// Hasta los muslos
  wide:     '-35 -30 310 500',// Cuerpo completo (menos aire arriba para encajar mejor en vertical)
};

function SilhouetteGuide({ shotType }: { shotType: ShotType }) {
  const viewBox = SHOT_VIEWBOX[shotType] || SHOT_VIEWBOX.medium;

  const fillColor = 'rgba(255, 255, 255, 0.16)';
  const strokeColor = 'rgba(255, 255, 255, 0.65)';
  const strokeW = 2;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <G>
          {/* Cabeza anatómica */}
          <Ellipse
            cx="120"
            cy="50"
            rx="20"
            ry="26"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />

          {/* Cuerpo completo proporcional (Cuello, Hombros, Brazos largos hasta el muslo, Torso, Piernas y Pies) */}
          <Path
            d="
              M 110 74
              C 109 83, 96 92, 68 102
              C 56 106, 50 118, 48 135
              C 46 155, 46 185, 47 215
              C 48 232, 50 245, 54 246
              C 58 247, 62 238, 63 226
              C 64 202, 65 178, 68 156
              C 70 148, 74 146, 77 154
              C 80 175, 82 205, 85 228
              C 87 252, 79 275, 77 305
              C 75 335, 82 380, 84 415
              L 106 415
              C 106 370, 107 318, 111 245
              C 112 232, 114 232, 115 245
              C 119 318, 120 370, 120 415
              L 142 415
              C 144 380, 151 335, 149 305
              C 147 275, 139 252, 141 228
              C 144 205, 146 175, 149 154
              C 152 146, 156 148, 158 156
              C 161 178, 162 202, 163 226
              C 164 238, 168 247, 172 246
              C 176 245, 178 232, 179 215
              C 180 185, 180 155, 178 135
              C 176 118, 170 106, 158 102
              C 130 92, 117 83, 116 74
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
    justifyContent: 'center',
  },
});

export default SilhouetteGuide;
