import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { getCardShadow } from '@/utils/cardShadow';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';
import { useDialogMaxHeight } from '@/hooks/useDialogMaxHeight';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  // Modo aviso: oculta el botón de cancelar y deja solo un botón (p.ej. "OK")
  // que llama a onConfirm. Útil para mensajes informativos, no confirmaciones.
  singleButton?: boolean;
  // Tercera opción opcional (p.ej. "Guardar" en un aviso de cambios sin
  // guardar) — al indicarla, los 3 botones se apilan en vertical (Extra,
  // luego Confirmar, luego Cancelar al final) en vez de la fila de 2 que usa
  // el resto de pantallas, porque tres textos largos uno junto a otro no caben.
  extraButtonText?: string;
  onExtra?: () => void;
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
  singleButton = false,
  extraButtonText,
  onExtra,
}: ConfirmDialogProps) {
  const { colors, isDark } = useTheme();
  const maxHeight = useDialogMaxHeight();
  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  // En modo oscuro, colors.primary (morado apagado) apenas se lee sobre el
  // pill translúcido del botón — igual que el resto de acentos morados de la
  // app, en oscuro pasa a blanco (ver [[scriptcue-dark-mode-card-conventions]] regla 7).
  const accentColor = destructive ? colors.error : (isDark ? '#FFFFFF' : colors.primary);
  const pillStyle = isDark
    ? { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' as const }
    : { backgroundColor: 'rgba(124,106,247,0.12)' };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
     supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      {/* El fondo que cierra al tocar fuera es una capa hermana, no un padre del diálogo: si el
          diálogo va dentro de un Pressable, éste se queda el gesto y el ScrollView del mensaje no
          llega a desplazarse. */}
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cerrar" />
        <View style={[styles.shadowWrapper, getCardShadow(isDark), { maxHeight }]}>
          <View
            style={[
              styles.clip,
              { borderColor: isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)' },
            ]}
          >
            <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.5)' },
              ]}
            />
            <View style={styles.dialog}>
              {/* Título y mensaje con scroll si no caben (p.ej. en horizontal); los botones
                  quedan siempre visibles debajo. */}
              <ScrollView style={styles.scroll} bounces={false}>
                <Text style={[styles.title, { color: onBg }]}>{title}</Text>
                <Text style={[styles.message, { color: onBg2 }]}>{message}</Text>
              </ScrollView>

              {extraButtonText && onExtra ? (
                <View style={styles.buttonsColumn}>
                  <TouchableOpacity style={[styles.buttonColumn, pillStyle]} onPress={onExtra}>
                    <Text style={[styles.buttonText, { color: accentColor }]}>{extraButtonText}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.buttonColumn, pillStyle]} onPress={onConfirm}>
                    <Text style={[styles.buttonText, { color: accentColor }]}>{confirmText}</Text>
                  </TouchableOpacity>
                  {!singleButton && (
                    <TouchableOpacity style={[styles.buttonColumn, pillStyle]} onPress={onCancel}>
                      <Text style={[styles.buttonText, { color: onBg }]}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.buttons}>
                  {!singleButton && (
                    <TouchableOpacity
                      style={[styles.button, pillStyle]}
                      onPress={onCancel}
                    >
                      <Text style={[styles.buttonText, { color: onBg }]}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.button, pillStyle]}
                    onPress={onConfirm}
                  >
                    <Text style={[styles.buttonText, { color: accentColor }]}>{confirmText}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
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
    flexShrink: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  dialog: {
    flexShrink: 1,
    padding: rp(24),
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  title: {
    fontSize: rf(18),
    fontWeight: '700',
    marginBottom: rp(8),
  },
  message: {
    fontSize: rf(15),
    lineHeight: 21,
    marginBottom: rp(20),
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonsColumn: {
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: rp(12),
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "flex: 1" (como en "button") solo tiene sentido dentro de una fila para
  // repartir el ancho — dentro de una columna sin alto definido, "flex: 1" en
  // cada botón colapsaba su altura y el texto quedaba invisible/recortado.
  // "alignItems: 'stretch'" (por defecto en una columna) ya hace que cada
  // botón ocupe el ancho completo sin necesidad de flex.
  buttonColumn: {
    paddingVertical: rp(12),
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: rf(15),
    fontWeight: '600',
  },
});
