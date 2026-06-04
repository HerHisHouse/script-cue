import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable, Modal } from 'react-native';
import { FileText, Clock, MoreVertical, Send, Trash2, Share2, Edit3, CheckSquare, Square } from 'lucide-react-native';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V } from '@/utils/ui';
import { Script } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import { rf, rp } from '@/utils/responsive';

interface ScriptCardProps {
  script: Script;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  showMenuButton?: boolean;
  onSendTo?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  variant?: 'list' | 'grid';
  onMenuOpenChange?: (open: boolean) => void;
  showSelectionCheckbox?: boolean;
  onToggleSelect?: () => void;
}

export function ScriptCard({ script, onPress, onLongPress, selected = false, showMenuButton = false, onSendTo, onRename, onShare, onDelete, variant = 'list', onMenuOpenChange, showSelectionCheckbox = false, onToggleSelect }: ScriptCardProps) {
  const { colors, isDark } = useTheme();
  const menuStyles = makeHeaderMenuStyles(colors);
  const [showMenu, setShowMenu] = React.useState(false);
  const isGrid = variant === 'grid';
  const menuOpacity = React.useRef(new Animated.Value(0)).current;
  const menuScale = React.useRef(new Animated.Value(0.98)).current;

  React.useEffect(() => {
    onMenuOpenChange?.(showMenu);
    Animated.parallel([
      Animated.timing(menuOpacity, { toValue: showMenu ? 1 : 0, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(menuScale, { toValue: showMenu ? 1 : 0.98, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [showMenu]);
  // Status removed - simplified view

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          padding: isGrid ? 12 : 16,
          shadowOpacity: isGrid ? 0.04 : 0.05,
        },
        isGrid ? { flexDirection: 'column', alignItems: 'center', height: 145, justifyContent: 'center' } : null,
        selected ? { borderWidth: 2, borderColor: colors.primary } : null,
        showMenu ? { zIndex: 1002 } : null,
      ]}
      onPress={() => {
        if (showMenu) return; // evita navegar si el menú está abierto
        onPress();
      }}
      onLongPress={onLongPress}
    >
      {showSelectionCheckbox && (
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!selected }}
          style={styles.checkbox}
          onPress={onToggleSelect}
        >
          {selected ? (
            <CheckSquare size={20} color={colors.primary} />
          ) : (
            <Square size={20} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      )}
      {isGrid ? (
        <>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: colors.primary,
                width: 52,
                height: 52,
                borderRadius: 10,
                marginRight: rp(0),
                marginBottom: rp(8),
              },
            ]}
          >
            <FileText size={26} color="#FFFFFF" />
          </View>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: rf(14),
                lineHeight: 18,
                letterSpacing: 0.2,
                marginBottom: rp(4),
                textAlign: 'center',
              },
            ]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {script.title || '(Sin título)'}
          </Text>
          <Text
            style={{ color: colors.textSecondary, fontSize: rf(11), lineHeight: 14 }}
            numberOfLines={1}
          >
            {script.created_at ? new Date(script.created_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
            }) : 'Fecha desconocida'}
          </Text>
        </>
      ) : (
        <>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: colors.input,
                width: 48,
                height: 48,
                borderRadius: 24,
                marginRight: rp(12),
              },
            ]}
          >
            <FileText size={24} color={colors.primary} />
          </View>
          <View style={[styles.content]}>
            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {script.title || '(Sin título)'}
            </Text>
            <View style={styles.date}>
              <Clock size={14} color={colors.textSecondary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                {script.created_at ? new Date(script.created_at).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }) : 'Fecha desconocida'}
              </Text>
            </View>
          </View>
        </>
      )}
      {showMenuButton && (
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowMenu((v) => !v)}
        >
          <MoreVertical size={20} color={colors.text} />
        </TouchableOpacity>
      )}

      {showMenuButton && (
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View style={[styles.optionsContent, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowMenu(false);
                  setTimeout(() => onRename?.(), 600);
                }}
              >
                <Edit3 size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Renombrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionItem}
                onPress={async () => {
                  if (onShare) {
                    await onShare();
                  }
                  setShowMenu(false);
                }}
              >
                <Share2 size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Compartir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowMenu(false);
                  setTimeout(() => onSendTo?.(), 600);
                }}
              >
                <Send size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Enviar a…</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionItem, { borderTopWidth: 1, borderTopColor: isDark ? '#333' : '#eee' }]}
                onPress={() => {
                  setShowMenu(false);
                  setTimeout(() => onDelete?.(), 600);
                }}
              >
                <Trash2 size={20} color={colors.error} />
                <Text style={[styles.optionText, { color: colors.error }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: rp(16),
    marginBottom: rp(12),
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1003,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rp(12),
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  menuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    top: 44,
    right: 8,
    borderWidth: 1,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: MENU_ITEM_PADDING_H,
    paddingVertical: MENU_ITEM_PADDING_V,
  },
  menuText: {
    fontSize: rf(15),
  },
  title: {
    fontSize: rf(16),
    fontWeight: '600',
    marginBottom: rp(8),
    flexShrink: 1,
  },
  date: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: rf(13),
    marginLeft: rp(4),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: rp(20),
  },
  optionsContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: rp(20),
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(16),
    gap: rp(16),
  },
  optionText: {
    fontSize: rf(16),
    fontWeight: '500',
  },
});
