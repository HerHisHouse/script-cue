import React from 'react';
import { View, Text, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';
import {
  HEADER_HORIZONTAL_PADDING,
  HEADER_VERTICAL_PADDING,
  HEADER_RIGHT_GAP,
  HEADER_MIN_HEIGHT,
  TITLE_FONT_SIZE,
  TITLE_FONT_WEIGHT,
} from '@/utils/ui';

export type ScreenHeaderProps = {
  title: string;
  childrenBelowTitle?: React.ReactNode;
  leftAction?: React.ReactNode;
  rightActions?: React.ReactNode;
  onLayout?: ViewProps['onLayout'];
  style?: any;
};

export function ScreenHeader({ title, childrenBelowTitle, leftAction, rightActions, onLayout, style }: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }, style]}
      onLayout={onLayout}
    >
      <View style={styles.leftContainer}>
        {leftAction && <View style={styles.leftAction}>{leftAction}</View>}
        <View style={styles.leftCol}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {childrenBelowTitle}
        </View>
      </View>
      <View style={styles.rightRow}>{rightActions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingVertical: HEADER_VERTICAL_PADDING,
    borderBottomWidth: 1,
    minHeight: HEADER_MIN_HEIGHT,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftAction: {
    marginRight: rp(4),
  },
  leftCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_RIGHT_GAP,
  },
  title: {
    fontSize: TITLE_FONT_SIZE,
    fontWeight: TITLE_FONT_WEIGHT,
  },
});

export default ScreenHeader;