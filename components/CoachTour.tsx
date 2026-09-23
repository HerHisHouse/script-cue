import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';

export interface CoachTourStepContent {
  title: string;
  description: string;
}

export interface CoachTourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CoachTourProps {
  visible: boolean;
  step: CoachTourStepContent | null;
  stepIndex: number;
  totalSteps: number;
  targetRect: CoachTourRect | null;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}

const HOLE_PADDING = 8;
const HOLE_RADIUS = 16;
const TOOLTIP_MARGIN = 16;
const ESTIMATED_TOOLTIP_HEIGHT = 190;

// Rectángulo redondeado como path SVG, para restarlo del rectángulo de
// pantalla completa (fillRule="evenodd") y conseguir el "agujero" del foco.
function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rr},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`;
}

// Tour interactivo tipo "spotlight": oscurece toda la pantalla salvo un
// recorte redondeado alrededor del elemento a destacar, con una burbuja de
// texto que se coloca encima o debajo según el espacio disponible.
export function CoachTour({ visible, step, stepIndex, totalSteps, targetRect, isLast, onNext, onSkip }: CoachTourProps) {
  const { colors, isDark } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();

  if (!visible || !step) return null;

  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  const cardBg = isDark ? 'rgba(124,106,247,0.16)' : 'rgba(255,255,255,0.9)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(124,106,247,0.2)';
  const primaryBtnBg = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
    : { backgroundColor: colors.primary };

  const hole = targetRect
    ? {
        x: targetRect.x - HOLE_PADDING,
        y: targetRect.y - HOLE_PADDING,
        width: targetRect.width + HOLE_PADDING * 2,
        height: targetRect.height + HOLE_PADDING * 2,
      }
    : null;

  const maskPath = hole
    ? `M0,0H${winW}V${winH}H0Z ${roundedRectPath(hole.x, hole.y, hole.width, hole.height, HOLE_RADIUS)}`
    : `M0,0H${winW}V${winH}H0Z`;

  let tooltipTop: number;
  if (hole) {
    const spaceBelow = winH - (hole.y + hole.height);
    if (spaceBelow > ESTIMATED_TOOLTIP_HEIGHT + TOOLTIP_MARGIN) {
      tooltipTop = hole.y + hole.height + TOOLTIP_MARGIN;
    } else {
      tooltipTop = Math.max(TOOLTIP_MARGIN, hole.y - ESTIMATED_TOOLTIP_HEIGHT - TOOLTIP_MARGIN);
    }
  } else {
    tooltipTop = winH / 2 - ESTIMATED_TOOLTIP_HEIGHT / 2;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={winW} height={winH} style={StyleSheet.absoluteFill}>
          <Path d={maskPath} fill="rgba(0,0,0,0.78)" fillRule="evenodd" />
        </Svg>

        {hole && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: hole.x,
              top: hole.y,
              width: hole.width,
              height: hole.height,
              borderRadius: HOLE_RADIUS,
              borderWidth: 2.5,
              borderColor: colors.primary,
            }}
          />
        )}

        <View style={[styles.tooltipWrapper, { top: tooltipTop }]}>
          <View style={[styles.tooltipClip, { borderColor: cardBorder }]}>
            <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 55 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: cardBg }]} />
            <View style={styles.tooltipContent}>
              <Text style={[styles.stepCounter, { color: colors.primary }]}>
                Paso {stepIndex + 1} de {totalSteps}
              </Text>
              <Text style={[styles.title, { color: onBg }]}>{step.title}</Text>
              <Text style={[styles.description, { color: onBg2 }]}>{step.description}</Text>
              <View style={styles.buttonsRow}>
                <TouchableOpacity onPress={onSkip} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Saltar tour">
                  <Text style={[styles.skipText, { color: onBg2 }]}>Saltar tour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onNext} style={[styles.nextBtn, primaryBtnBg]} accessibilityRole="button" accessibilityLabel={isLast ? 'Entendido' : 'Siguiente'}>
                  <Text style={styles.nextText}>{isLast ? 'Entendido' : 'Siguiente'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tooltipWrapper: { position: 'absolute', left: rp(20), right: rp(20) },
  tooltipClip: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  tooltipContent: { padding: rp(20) },
  stepCounter: { fontSize: rf(12), fontWeight: '700', marginBottom: rp(6), textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: rf(18), fontWeight: '700', marginBottom: rp(8) },
  description: { fontSize: rf(14), lineHeight: rf(20), marginBottom: rp(18) },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipBtn: { paddingVertical: rp(10), paddingHorizontal: rp(8) },
  skipText: { fontSize: rf(14), fontWeight: '600' },
  nextBtn: { paddingVertical: rp(12), paddingHorizontal: rp(24), borderRadius: 100 },
  nextText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '700' },
});
