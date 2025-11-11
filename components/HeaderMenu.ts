import { StyleSheet } from 'react-native';
import { HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { useTheme } from '@/contexts/ThemeContext';

export function makeHeaderMenuStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      right: HEADER_HORIZONTAL_PADDING,
      maxWidth: 280,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 6,
      zIndex: 1001,
      marginTop: 4,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: Math.max(8, HEADER_HORIZONTAL_PADDING - 6),
      paddingVertical: 10,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
      marginVertical: 6,
    },
    text: {
      fontSize: 15,
    },
  });
}