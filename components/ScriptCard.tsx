import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { FileText, Clock, MoreVertical, Send, Trash2, Share2, Edit3, CheckSquare, Square } from 'lucide-react-native';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V } from '@/utils/ui';
import { Script } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';

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
  const statusColor = {
    processing: '#F59E0B',
    ready: '#10B981',
    error: '#EF4444',
  }[script.status];

  const statusText = {
    processing: 'Configurar personajes',
    ready: 'Listo',
    error: 'Error',
  }[script.status];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          padding: isGrid ? 12 : 16,
          shadowOpacity: isGrid ? 0.04 : 0.05,
        },
        isGrid ? { flexDirection: 'column', alignItems: 'center' } : null,
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
                backgroundColor: '#7C3AED',
                width: 52,
                height: 52,
                borderRadius: 10,
                marginRight: 0,
                marginBottom: 8,
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
                fontSize: 14,
                lineHeight: 18,
                letterSpacing: 0.2,
                marginBottom: 4,
                textAlign: 'center',
              },
            ]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {script.title || '(Sin título)'}
          </Text>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text
              style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 14 }}
              numberOfLines={1}
            >
              {new Date(script.created_at).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.statusDot, { backgroundColor: statusColor, marginRight: 6 }]} />
              <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 14 }} numberOfLines={1}>
                {statusText}
              </Text>
            </View>
          </View>
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
                marginRight: 12,
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
            <View style={styles.footer}>
              <View style={styles.status}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {statusText}
                </Text>
              </View>
              <View style={styles.date}>
                <Clock size={14} color={colors.textSecondary} />
                <Text style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {new Date(script.created_at).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
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

      {showMenuButton && showMenu && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
          accessibilityRole="button"
          accessibilityLabel="Cerrar menú"
          onPress={() => setShowMenu(false)}
        />
      )}

      {showMenuButton && (
        <Animated.View
          style={[
            menuStyles.container,
            { top: 44, right: 8 },
            { opacity: menuOpacity, transform: [{ scale: menuScale }] },
            { zIndex: 1001 },
          ]}
          pointerEvents={showMenu ? 'auto' : 'none'}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => {
              setShowMenu(false);
              onRename?.();
            }}
          >
            <Edit3 size={18} color={colors.text} />
            <Text style={[menuStyles.text, { color: colors.text }]}>Renombrar</Text>
          </TouchableOpacity>

          <View style={menuStyles.separator} />

          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => {
              setShowMenu(false);
              onShare?.();
            }}
          >
            <Share2 size={18} color={colors.text} />
            <Text style={[menuStyles.text, { color: colors.text }]}>Compartir</Text>
          </TouchableOpacity>

          <View style={menuStyles.separator} />

          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => {
              setShowMenu(false);
              onSendTo?.();
            }}
          >
            <Send size={18} color={colors.text} />
            <Text style={[menuStyles.text, { color: colors.text }]}>Enviar a…</Text>
          </TouchableOpacity>

          <View style={menuStyles.separator} />

          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => {
              setShowMenu(false);
              onDelete?.();
            }}
          >
            <Trash2 size={18} color={colors.error} />
            <Text style={[menuStyles.text, { color: colors.error }]}>Eliminar</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    marginRight: 12,
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
    fontSize: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
  },
  date: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    marginLeft: 4,
  },
});
