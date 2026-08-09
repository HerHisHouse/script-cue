import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
     supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconContainer}>
            <AlertTriangle size={48} color="#EF4444" />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
              ]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
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
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: rp(24),
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: rp(16),
  },
  title: {
    fontSize: rf(20),
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: rp(8),
  },
  message: {
    fontSize: rf(16),
    color: '#6B7280',
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
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
  },
  cancelText: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmText: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
