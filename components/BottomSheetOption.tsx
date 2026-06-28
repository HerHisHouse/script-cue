import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { LucideIcon } from 'lucide-react-native';

export interface BottomSheetOptionProps {
  label: string;
  onPress: () => void;
  Icon?: LucideIcon;
  iconColor?: string;
  textColor?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
}

export function BottomSheetOption({ 
  label, 
  onPress, 
  Icon, 
  iconColor, 
  textColor,
  isDestructive,
  isLoading,
  disabled
}: BottomSheetOptionProps) {
  const { colors } = useTheme();

  const finalTextColor = isDestructive ? colors.error : (textColor || colors.text);
  const finalIconColor = isDestructive ? colors.error : (iconColor || colors.textSecondary);
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity 
      style={[styles.container, { borderBottomColor: colors.border + '40', opacity: isDisabled ? 0.5 : 1 }]} 
      onPress={onPress}
      disabled={isDisabled}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={finalIconColor} style={styles.icon} />
      ) : (
        Icon && <Icon size={20} color={finalIconColor} style={styles.icon} />
      )}
      <Text style={[styles.label, { color: finalTextColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
