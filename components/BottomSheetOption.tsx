import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, Alert } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { LucideIcon, Info } from 'lucide-react-native';

export interface BottomSheetOptionProps {
  label: string;
  onPress: () => void;
  Icon?: LucideIcon;
  iconColor?: string;
  textColor?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  infoText?: string;
  infoTitle?: string;
}

export function BottomSheetOption({ 
  label, 
  onPress, 
  Icon, 
  iconColor, 
  textColor,
  isDestructive,
  isLoading,
  disabled,
  infoText,
  infoTitle
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
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.label, { color: finalTextColor }]}>
          {label}
        </Text>
        {infoText && (
          <TouchableOpacity 
            onPress={() => Alert.alert(infoTitle || 'Información', infoText)}
            style={{ marginLeft: 6, padding: 4 }}
          >
            <Info size={16} color={finalIconColor} />
          </TouchableOpacity>
        )}
      </View>
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
