import React from 'react';
import { View, Text, Switch, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { LucideIcon, Info } from 'lucide-react-native';

export interface BottomSheetToggleProps {
  label: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  Icon?: LucideIcon;
  iconColor?: string;
  textColor?: string;
  borderColor?: string;
  description?: string; // Optional subtitle
  infoText?: string;
}

export function BottomSheetToggle({
  label,
  value,
  onValueChange,
  Icon,
  iconColor,
  textColor,
  borderColor,
  description,
  infoText
}: BottomSheetToggleProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity 
      style={[styles.container, { borderBottomColor: borderColor || (colors.border + '40') }]}
      onPress={() => onValueChange(!value)}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        {Icon && <Icon size={20} color={iconColor || colors.textSecondary} style={styles.icon} />}
        <View style={styles.textContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.label, { color: textColor || colors.text }]}>{label}</Text>
            {infoText && (
              <TouchableOpacity 
                onPress={() => Alert.alert('Información', infoText)}
                style={{ marginLeft: 6, padding: 4 }}
              >
                <Info size={16} color={iconColor || colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {description && (
            <Text style={[styles.description, { color: textColor ? (textColor + 'B3') : colors.textSecondary }]}>
              {description}
            </Text>
          )}
        </View>
      </View>
      
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: '#34C759' }} // iOS standard green for toggles
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  }
});
