import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Sí',
  cancelText = 'No',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  const { colors, isDark } = useTheme();
  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  const accentColor = destructive ? colors.error : colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
     supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[
            styles.shadowWrapper,
            !isDark && {
              shadowColor: '#1a1625',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.28,
              shadowRadius: 16,
              elevation: 8,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.clip,
              { borderColor: isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)' },
            ]}
          >
            <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.5)' },
              ]}
            />
            <View style={styles.dialog}>
              <View style={styles.iconContainer}>
                <AlertTriangle size={48} color={accentColor} />
              </View>

              <Text style={[styles.title, { color: onBg }]}>{title}</Text>
              <Text style={[styles.message, { color: onBg2 }]}>{message}</Text>

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[
                    styles.button,
                    isDark
                      ? { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
                      : { backgroundColor: 'rgba(124,106,247,0.12)' },
                  ]}
                  onPress={onCancel}
                >
                  <Text style={[styles.cancelText, { color: onBg }]}>{cancelText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    isDark
                      ? {
                        backgroundColor: destructive ? 'rgba(239,68,68,0.85)' : 'rgba(124,106,247,0.80)',
                        borderWidth: 1.5,
                        borderColor: 'rgba(255,255,255,0.5)',
                      }
                      : { backgroundColor: accentColor },
                  ]}
                  onPress={onConfirm}
                >
                  <Text style={styles.confirmText}>{confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rp(20),
  },
  shadowWrapper: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
  },
  clip: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  dialog: {
    padding: rp(24),
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: rp(16),
  },
  title: {
    fontSize: rf(20),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: rp(8),
  },
  message: {
    fontSize: rf(16),
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: rp(24),
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: rp(14),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  confirmText: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
