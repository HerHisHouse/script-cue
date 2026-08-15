import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Text,
  TouchableOpacity,
} from 'react-native';
import { X } from 'lucide-react-native';

const SLIDER_HEIGHT = 240;
const SLIDER_WIDTH = 44;

type Props = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (value: number) => void;
  onClose: () => void;
};

export function VerticalZoomSlider({
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
  onClose,
}: Props) {
  const zoomRange = maxZoom - minZoom;

  function handleTouch(locationY: number) {
    // Invertir: arriba = zoom máximo, abajo = zoom mínimo
    const clampedY = Math.max(0, Math.min(SLIDER_HEIGHT, locationY));
    const ratio = 1 - clampedY / SLIDER_HEIGHT;
    const newZoom = minZoom + ratio * zoomRange;
    onZoomChange(newZoom);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        handleTouch(evt.nativeEvent.locationY);
      },
      onPanResponderMove: (evt) => {
        handleTouch(evt.nativeEvent.locationY);
      },
    })
  ).current;

  // Posición del thumb (clamp para evitar salirse del track)
  const currentRatio = zoomRange > 0 ? (zoom - minZoom) / zoomRange : 0;
  const clampedRatio = Math.max(0, Math.min(1, currentRatio));
  const thumbPosition = SLIDER_HEIGHT * (1 - clampedRatio);

  // Etiqueta de zoom aproximada
  const zoomLabel = `${(1 + clampedRatio * 1.5).toFixed(1)}x`;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <X size={16} color="white" />
      </TouchableOpacity>

      <View style={styles.labelBadge}>
        <Text style={styles.labelText}>{zoomLabel}</Text>
      </View>

      <View style={styles.sliderTrack} {...panResponder.panHandlers}>
        {/* Track fill visual */}
        <View style={styles.sliderTrackLine} />

        {/* Filled portion below thumb */}
        <View
          style={[
            styles.sliderTrackFilled,
            { height: SLIDER_HEIGHT - thumbPosition - 4 },
          ]}
        />

        {/* Thumb */}
        <View style={[styles.thumb, { top: thumbPosition - 16 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    top: '30%',
    alignItems: 'center',
    zIndex: 1000,
  },
  closeBtn: {
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBadge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    height: SLIDER_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: SLIDER_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 4,
    // Border sutil para delimitación visual
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sliderTrackLine: {
    position: 'absolute',
    width: 3,
    height: SLIDER_HEIGHT - 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    top: 8,
  },
  sliderTrackFilled: {
    position: 'absolute',
    width: 3,
    bottom: 8,
    backgroundColor: '#a78bfa',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#a78bfa',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
  },
});
