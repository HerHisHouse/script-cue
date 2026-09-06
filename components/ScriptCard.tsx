import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable, Modal } from 'react-native';
import { FileText, Clock, MoreVertical, Send, Trash2, Share2, Edit3, Copy, CheckSquare, Square, Check } from 'lucide-react-native';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V } from '@/utils/ui';
import { Script } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import { rf, rp } from '@/utils/responsive';
import { BottomSheetMenu } from '@/components/BottomSheetMenu';
import { BottomSheetOption } from '@/components/BottomSheetOption';

interface ScriptCardProps {
  script: Script;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  showMenuButton?: boolean;
  onSendTo?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  variant?: 'list' | 'grid';
  onMenuOpenChange?: (open: boolean) => void;
  showSelectionCheckbox?: boolean;
  onToggleSelect?: () => void;
}

export function ScriptCard({ script, onPress, onLongPress, selected = false, showMenuButton = false, onSendTo, onRename, onShare, onDuplicate, onDelete, variant = 'list', onMenuOpenChange, showSelectionCheckbox = false, onToggleSelect }: ScriptCardProps) {
  const { colors, isDark } = useTheme();
  const menuStyles = makeHeaderMenuStyles(colors);
  const [showMenu, setShowMenu] = React.useState(false);
  const isGrid = variant === 'grid';
  const menuOpacity = React.useRef(new Animated.Value(0)).current;
  const menuScale = React.useRef(new Animated.Value(0.98)).current;
  const glassTitleColor = isDark ? '#ffffff' : '#2a2447';
  const glassDateColor = isDark ? '#a0a0c0' : '#5c5678';

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
          backgroundColor: selected ? colors.input : (isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)'),
          borderColor: selected ? colors.primary : (isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)'),
          borderWidth: selected ? 2 : 1,
          padding: isGrid ? 12 : 16,
          ...(!isDark ? {
            shadowColor: '#1a1625',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 16,
            elevation: 8,
          } : null),
        },
        isGrid ? { flexDirection: 'column', alignItems: 'center', height: 145, justifyContent: 'center' } : null,
        showMenu ? { zIndex: 1002 } : null,
      ]}
      onPress={() => {
        if (showMenu) return; // evita navegar si el menú está abierto
        onPress();
      }}
      onLongPress={onLongPress}
    >

      {isGrid ? (
        <>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : colors.primary,
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
                color: glassTitleColor,
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
            style={{ color: glassDateColor, fontSize: rf(11), lineHeight: 14 }}
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
                backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,106,247,0.12)',
                width: 48,
                height: 48,
                borderRadius: 24,
                marginRight: rp(12),
              },
            ]}
          >
            <FileText size={24} color={isDark ? '#FFFFFF' : colors.primary} />
          </View>
          <View style={[styles.content]}>
            <Text
              style={[
                styles.title,
                { color: glassTitleColor },
              ]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {script.title || '(Sin título)'}
            </Text>
            <View style={styles.date}>
              <Clock size={14} color={glassDateColor} />
              <Text style={[styles.dateText, { color: glassDateColor }]} numberOfLines={1} ellipsizeMode="tail">
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
      {showSelectionCheckbox ? (
        <View style={[isGrid && { position: 'absolute', top: 8, right: 8 }]}>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!selected }}
            style={styles.selectionCheck}
            onPress={onToggleSelect}
          >
            <View style={[styles.customCheckbox, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
               {selected && <Check size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
        </View>
      ) : showMenuButton && (
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowMenu((v) => !v)}
        >
          <MoreVertical size={20} color={colors.text} />
        </TouchableOpacity>
      )}

      {showMenuButton && (
        <BottomSheetMenu
          visible={showMenu}
          onClose={() => setShowMenu(false)}
          title="Opciones"
        >
          <BottomSheetOption
            label="Renombrar"
            Icon={Edit3}
            onPress={() => {
              setShowMenu(false);
              setTimeout(() => onRename?.(), 600);
            }}
          />

          <BottomSheetOption
            label="Compartir"
            Icon={Share2}
            onPress={async () => {
              if (onShare) {
                await onShare();
              }
              setShowMenu(false);
            }}
          />

          <BottomSheetOption
            label="Duplicar"
            Icon={Copy}
            onPress={() => {
              setShowMenu(false);
              setTimeout(() => onDuplicate?.(), 300);
            }}
          />

          <BottomSheetOption
            label="Enviar a…"
            Icon={Send}
            onPress={() => {
              setShowMenu(false);
              setTimeout(() => onSendTo?.(), 600);
            }}
          />

          <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5, marginVertical: 8 }} />

          <BottomSheetOption
            label="Eliminar"
            Icon={Trash2}
            isDestructive
            onPress={() => {
              setShowMenu(false);
              setTimeout(() => onDelete?.(), 600);
            }}
          />
        </BottomSheetMenu>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: rp(16),
    marginBottom: rp(12),
    position: 'relative',
    overflow: 'visible',
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
  selectionCheck: {
    padding: rp(4),
  },
  customCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
