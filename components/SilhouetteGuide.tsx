import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Ellipse, Rect, Path, G, ClipPath, Defs } from 'react-native-svg';

export type ShotType = 'closeup' | 'medium' | 'american' | 'wide';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Silueta humana SVG semi-transparente que se superpone sobre la cámara
 * para guiar al actor a colocarse en el encuadre correcto según el tipo
 * de plano seleccionado (primer plano, medio, americano, general).
 *
 * Se usa solo en Teleprompter Libre antes de iniciar la grabación.
 */

// Configuración por tipo de plano:
// - bodyVisibleFraction: qué fracción del cuerpo total se ve (0 = solo cabeza, 1 = cuerpo entero)
// - scale: escala relativa de la silueta dentro del viewBox
const SHOT_CONFIG: Record<ShotType, { bodyVisibleFraction: number; scale: number }> = {
  closeup:  { bodyVisibleFraction: 0.18, scale: 0.80 }, // Cabeza + hombros
  medium:   { bodyVisibleFraction: 0.45, scale: 0.85 }, // Hasta el pecho
  american: { bodyVisibleFraction: 0.68, scale: 0.90 }, // Hasta el muslo
  wide:     { bodyVisibleFraction: 0.95, scale: 0.95 }, // Cuerpo entero
};

// SVG viewport fijo: 100 x 200 unidades
const VB_W = 100;
const VB_H = 200;

// Silueta anatómica simplificada — proporciones relativas al viewport
const HEAD_CX = 50;
const HEAD_CY = 22;
const HEAD_RX = 16;
const HEAD_RY = 18;

const NECK_X = 43;
const NECK_Y = 38;
const NECK_W = 14;
const NECK_H = 10;

const SHOULDER_Y = 47;
const SHOULDER_W = 52; // anchura de hombros
const SHOULDER_X = (VB_W - SHOULDER_W) / 2;
const SHOULDER_H = 14;

// Torso (hasta la cadera)
const TORSO_X = 28;
const TORSO_Y = 58;
const TORSO_W = 44;
const TORSO_H = 65; // llega hasta y=123

// Piernas (hasta los pies)
const LEG_L_X = 28;
const LEG_R_X = 54;
const LEG_Y = 120;
const LEG_W = 20;
const LEG_H = 60;

function SilhouetteGuide({ shotType }: { shotType: ShotType }) {
  const config = SHOT_CONFIG[shotType];

  // Calculamos la altura visible del cuerpo:
  // el cuerpo total en el SVG va desde HEAD_CY - HEAD_RY ≈ 4 hasta LEG_Y + LEG_H = 180
  const totalBodyTop = HEAD_CY - HEAD_RY; // ≈ 4
  const totalBodyBottom = LEG_Y + LEG_H;   // 180
  const totalBodyH = totalBodyBottom - totalBodyTop; // 176

  // Punto de corte visible (en coordenadas SVG)
  const visibleBottom = totalBodyTop + totalBodyH * config.bodyVisibleFraction;

  // El viewBox muestra desde 0 hasta visibleBottom + algo de margen
  const margin = 6;
  const viewBoxBottom = Math.min(visibleBottom + margin, VB_H);
  const viewBox = `0 0 ${VB_W} ${viewBoxBottom}`;

  const fillColor = 'rgba(255,255,255,0.30)';
  const strokeColor = 'rgba(255,255,255,0.65)';
  const strokeW = 1.2;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg
        width={`${config.scale * 60}%`}
        height="90%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMin meet"
      >
        {/* Cabeza */}
        <Ellipse
          cx={HEAD_CX} cy={HEAD_CY}
          rx={HEAD_RX} ry={HEAD_RY}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeW}
        />

        {/* Cuello */}
        <Rect
          x={NECK_X} y={NECK_Y}
          width={NECK_W} height={NECK_H}
          rx={4}
          fill={fillColor}
        />

        {/* Hombros */}
        <Rect
          x={SHOULDER_X} y={SHOULDER_Y}
          width={SHOULDER_W} height={SHOULDER_H}
          rx={8}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeW}
        />

        {/* Torso */}
        {config.bodyVisibleFraction > 0.15 && (
          <Rect
            x={TORSO_X} y={TORSO_Y}
            width={TORSO_W}
            height={Math.min(TORSO_H, visibleBottom - TORSO_Y)}
            rx={8}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        )}

        {/* Pierna izquierda */}
        {config.bodyVisibleFraction > 0.55 && visibleBottom > LEG_Y && (
          <Rect
            x={LEG_L_X} y={LEG_Y}
            width={LEG_W}
            height={Math.min(LEG_H, visibleBottom - LEG_Y)}
            rx={6}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        )}

        {/* Pierna derecha */}
        {config.bodyVisibleFraction > 0.55 && visibleBottom > LEG_Y && (
          <Rect
            x={LEG_R_X} y={LEG_Y}
            width={LEG_W}
            height={Math.min(LEG_H, visibleBottom - LEG_Y)}
            rx={6}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // paddingTop: para centrar la figura verticalmente
    paddingTop: SCREEN_HEIGHT * 0.05,
  },
});

export default SilhouetteGuide;
