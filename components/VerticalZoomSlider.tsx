import React, { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';

const SLIDER_HEIGHT_PORTRAIT = 240;
const SLIDER_HEIGHT_LANDSCAPE = 140;
const SLIDER_WIDTH = 44;

type Props = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /**
   * Fase M1 (RS, solo iOS): factor de conversión de `zoom` (eje "raw" de
   * vision-camera) a multiplicador real visible ("x"). En dispositivos
   * multi-lente, el eje raw no siempre coincide 1:1 con el multiplicador
   * óptico real — dividir por este valor (el raw de la lente gran angular
   * neutra) da el número correcto. Ignorado en Android (sigue con la
   * fórmula original basada en la posición del slider).
   */
  displayScale?: number;
  onZoomChange: (value: number) => void;
  onClose: () => void;
};

export function VerticalZoomSlider({
  zoom,
  minZoom,
  maxZoom,
  displayScale = 1,
  onZoomChange,
  onClose,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const SLIDER_HEIGHT = isLandscape ? SLIDER_HEIGHT_LANDSCAPE : SLIDER_HEIGHT_PORTRAIT;

  const zoomRange = maxZoom - minZoom;

  // Store the absolute Y position of the track top, measured once on layout
  const trackTopRef = useRef<number>(0);
  const trackRef = useRef<View>(null);

  const measureTrack = useCallback(() => {
    trackRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
      trackTopRef.current = pageY;
    });
  }, []);

  /**
   * Convert an absolute screen Y position to a zoom value.
   * pageY from PanResponder events is always in screen coordinates,
   * so this is rock-solid regardless of nesting.
   */
  const pageYToZoom = useCallback(
    (pageY: number): number => {
      const relY = pageY - trackTopRef.current;
      const clampedY = Math.max(0, Math.min(SLIDER_HEIGHT, relY));
      // Invert: top → max zoom, bottom → min zoom
      const ratio = 1 - clampedY / SLIDER_HEIGHT;
      return minZoom + ratio * zoomRange;
    },
    [minZoom, zoomRange, SLIDER_HEIGHT]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Measure on grant so we always have fresh coordinates
      onPanResponderGrant: (evt) => {
        trackRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
          trackTopRef.current = pageY;
          // Apply immediately with the touch position
          onZoomChange(pageYToZoom(evt.nativeEvent.pageY));
        });
      },
      onPanResponderMove: (evt) => {
        onZoomChange(pageYToZoom(evt.nativeEvent.pageY));
      },
    })
  ).current;

  // Visual position of the thumb
  const currentRatio =
    zoomRange > 0 ? Math.max(0, Math.min(1, (zoom - minZoom) / zoomRange)) : 0;
  const thumbTop = SLIDER_HEIGHT * (1 - currentRatio) - 16;

  // Height of the filled (active) portion of the track
  const filledHeight = Math.max(0, SLIDER_HEIGHT - 8 - (SLIDER_HEIGHT * (1 - currentRatio)));

  // iOS (vision-camera): `zoom` ya es multiplicador real, se convierte con
  // displayScale. Android (expo-camera): fórmula original sin cambios,
  // basada en la posición del slider dentro del rango fijo 0.5x-2x.
  const zoomLabel = Platform.OS === 'ios'
    ? `${(zoom / displayScale).toFixed(1)}x`
    : `${(0.5 + currentRatio * 1.5).toFixed(1)}x`;

  return (
    <View style={[styles.container, isLandscape && styles.containerLandscape]} pointerEvents="box-none">
      {/* Close button */}
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <X size={15} color="white" />
      </TouchableOpacity>

      {/* Zoom label badge */}
      <View style={styles.labelBadge}>
        <Text style={styles.labelText}>{zoomLabel}</Text>
      </View>

      {/* Slider track — PanResponder attached here */}
      <View
        ref={trackRef}
        onLayout={measureTrack}
        style={[styles.sliderTrack, { height: SLIDER_HEIGHT }]}
        {...panResponder.panHandlers}
      >
        {/* Static grey centre line */}
        <View style={styles.trackLine} />

        {/* Purple filled portion (below thumb) */}
        <View style={[styles.trackFilled, { height: filledHeight }]} />

        {/* Thumb */}
        <View style={[styles.thumb, { top: thumbTop }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    top: '28%',
    alignItems: 'center',
    zIndex: 1000,
  },
  containerLandscape: {
    top: '10%',
  },
  closeBtn: {
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBadge: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  labelText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sliderTrack: {
    width: SLIDER_WIDTH,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: SLIDER_WIDTH / 2,
    alignItems: 'center',
    // Important: no justifyContent so children use absolute positioning cleanly
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  trackLine: {
    position: 'absolute',
    width: 3,
    top: 8,
    bottom: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2,
  },
  trackFilled: {
    position: 'absolute',
    width: 3,
    bottom: 8,
    backgroundColor: '#a78bfa',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: (SLIDER_WIDTH - 32) / 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#a78bfa',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
});
