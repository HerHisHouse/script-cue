import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView, Animated, PanResponder, Dimensions } from 'react-native';
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);

  useEffect(() => {
    if (visible) {
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
    } else {
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
      ]).start(() => {
        setModalVisible(false);
      });
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

  const bgColor = backgroundColor || colors.surface;
  const isHex = bgColor.startsWith('#');
  // Leve transparencia (90% de opacidad)
  const transparentBg = (isHex && bgColor.length === 7) ? `${bgColor}E6` : bgColor;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel deslizable desde abajo */}
      <Animated.View 
        {...panResponder.panHandlers}
        style={[styles.bottomSheet, {
          backgroundColor: transparentBg,
          paddingBottom: Math.max(insets.bottom, 20),
          transform: [{ translateY }]
        }]}
      >
        <View style={{ width: '100%' }}>
          {/* Handle */}
          <View style={styles.handle} />

          {title && (
            <Text style={[styles.title, { color: titleColor || colors.text }]}>
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
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: '80%', // To prevent it from taking the whole screen if there are many items
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
