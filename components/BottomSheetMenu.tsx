import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView, Animated, PanResponder, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

export interface BottomSheetMenuProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  backgroundColor?: string;
  titleColor?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function BottomSheetMenu({ visible, onClose, title, children, backgroundColor, titleColor }: BottomSheetMenuProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [modalVisible, setModalVisible] = useState(visible);
  const [isClosing, setIsClosing] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);

  useEffect(() => {
    if (visible) {
      // Stop any in-flight close animation
      translateY.stopAnimation();
      opacity.stopAnimation();
      setIsClosing(false);
      setModalVisible(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    } else if (modalVisible) {
      // Only animate close if the modal is currently showing
      setIsClosing(true);
      // Stop any in-flight animations before starting close
      translateY.stopAnimation();
      opacity.stopAnimation();
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start(({ finished }) => {
        // Always unmount the modal when animation completes or is interrupted
        setModalVisible(false);
        setIsClosing(false);
      });
      // Safety net: if animation callback never fires (e.g. interrupted by re-render),
      // force-hide the modal after a generous timeout
      const safetyTimer = setTimeout(() => {
        setModalVisible(false);
        setIsClosing(false);
      }, 400);
      return () => clearTimeout(safetyTimer);
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capturar el gesto si hacemos swipe hacia abajo y el scroll está arriba del todo
        return scrollY.current <= 0 && gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Alternativa por si capture falla
        return scrollY.current <= 0 && gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 1) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      }
    })
  ).current;

  if (!modalVisible) return null;

  // Sin backgroundColor explícito -> mismo efecto glass que la tab bar flotante
  // (BlurView + velo de color sutil). Las pantallas que sí pasan un color propio
  // (casting.tsx, car.tsx) mantienen su panel sólido intacto.
  const useGlass = !backgroundColor;
  const bgColor = backgroundColor || colors.surface;
  const isHex = bgColor.startsWith('#');
  // Leve transparencia (90% de opacidad)
  const transparentBg = (isHex && bgColor.length === 7) ? `${bgColor}E6` : bgColor;
  // Velo de marca (morado), no gris — y más intenso que en la tab bar porque aquí
  // el blur no tiene un degradado morado detrás (Guiones/Proyectos/Grabaciones usan
  // un fondo plano, ver nota en el componente), así que necesita más "punch" propio.
  // En claro, mismo tono/transparencia que la tab bar flotante (rgba(235,230,245,0.22)),
  // para que ambos elementos glass sean coherentes entre sí.
  const glassOverlayTint = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.22)';
  const glassTitleColor = isDark ? '#FFFFFF' : '#000000';
  const glassHandleColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(42,27,71,0.35)';
  // El scrim al 60% negro oscurecía todo lo que el blur iba a mostrar, dejándolo plano.
  // Se aligera solo en la variante glass; las pantallas con backgroundColor sólido propio
  // (casting.tsx, car.tsx) conservan el scrim original de siempre.
  const backdropColor = useGlass ? (isDark ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.12)') : 'rgba(0,0,0,0.6)';

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { backgroundColor: backdropColor, opacity }]} pointerEvents={isClosing ? 'none' : 'auto'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel deslizable desde abajo */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.bottomSheet, { transform: [{ translateY }] }]}
      >
        {/* Recorta el fondo (blur o sólido) a las esquinas redondeadas, sin tocar
            la sombra del contenedor exterior (overflow:hidden + shadow no combinan en iOS) */}
        <View style={[styles.clip, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {useGlass ? (
            <>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: glassOverlayTint }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: transparentBg }]} />
          )}

          <View style={{ width: '100%' }}>
            {/* Handle */}
            <View style={[styles.handle, useGlass && { backgroundColor: glassHandleColor }]} />

            {title && (
              <Text style={[styles.title, { color: titleColor || (useGlass ? glassTitleColor : colors.text) }]}>
                {title}
              </Text>
            )}
          </View>

          <ScrollView
            bounces={false}
            style={{ flexShrink: 1, width: '100%' }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    inset: 0,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: '80%', // To prevent it from taking the whole screen if there are many items
  },
  clip: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.3)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingBottom: 20,
  }
});
