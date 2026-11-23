import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppearance } from '../../theme/useAppearance';

export type CountBadgeProps = {
  count: number | string;
  /** Multiplier for diameter and font size (defaults to 1). */
  scale?: number;
  /** Override theme polarity when rendered inside a surface with its own palette (e.g. Chat). */
  light?: boolean;
  /** Explicit diameter in pt before `scale` (defaults to 18). */
  size?: number;
  /** Explicit font size in pt before `scale` (defaults to 11). */
  fontSize?: number;
  backgroundColor?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared soft count circle badge: a perfect circle for 1 digit, widening into a rounded
 * rectangle for 2+ digits, matching Ghostex's dark and light themes.
 */
export function CountBadge({
  count,
  scale = 1,
  light,
  size = 18,
  fontSize = 11,
  backgroundColor,
  color,
  style,
}: CountBadgeProps) {
  const appearance = useAppearance();
  const isLight = light ?? appearance.light;
  const text = String(count);
  const singleChar = text.length <= 1;
  const d = Math.round(size * scale);
  const fs = Math.round(fontSize * scale);
  const bg = backgroundColor ?? (isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)');
  const fg = color ?? (isLight ? 'rgba(0, 0, 0, 0.74)' : 'rgba(255, 255, 255, 0.80)');

  return (
    <View
      style={[
        styles.base,
        singleChar
          ? { width: d, height: d }
          : { minWidth: d, height: d, paddingHorizontal: Math.max(5, Math.round(d * 0.3)) },
        { borderRadius: d / 2, backgroundColor: bg },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          { color: fg, fontSize: fs, lineHeight: fs + 2 },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
