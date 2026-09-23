import { StyleSheet } from 'react-native';
import { HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { useTheme } from '@/contexts/ThemeContext';
import { getShadowStyle } from '@/utils/cardShadow';

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
      zIndex: 1001,
      marginTop: 4,
      ...getShadowStyle({ offsetY: 4, blur: 10, opacity: 0.08, rgb: '0,0,0' }),
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: Math.max(8, HEADER_HORIZONTAL_PADDING - 6),
      paddingVertical: 10,
    },
    separator: {
      height: 1,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
      marginVertical: 8,
      opacity: 0.6,
    },
    text: {
      fontSize: 15,
    },
  });
}