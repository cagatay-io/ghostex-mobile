/**
 * Shared building blocks of the setup flow, styled with SetupPalette so every
 * screen renders the same button, row group, callout and text styles as the
 * mockup (docs/2026-09-03/mobile-setup/shared.css): white primary button,
 * neutral filled secondary (no outline or borderless buttons: CDXC:AppModal 2026-10-14 on the
 * desktop's `neutral_button_fills`); #1d1d1d row groups with hairline
 * dividers; 12px sections, 8px controls.
 */

import { useMemo, type ReactNode } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';

export const SETUP_MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export type SetupButtonVariant = 'primary' | 'secondary';

export type SetupButtonProps = {
  label: string;
  onPress: () => void;
  variant?: SetupButtonVariant;
  /** 48px tall with a 16px label (the screen-footer primary in the mockup). */
  large?: boolean;
  /** 32px tall with a 13px label (the card-footer buttons in the mockup). */
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function SetupButton({
  label,
  onPress,
  variant = 'secondary',
  large = false,
  small = false,
  disabled = false,
  busy = false,
  icon,
  style,
  accessibilityLabel,
}: SetupButtonProps) {
  const appearance = useAppearance();
  const buttonStyles = useMemo(() => createButtonStyles(appearance), [appearance]);
  const labelColor = variant === 'primary' ? appearance.accentForeground : appearance.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        buttonStyles.base,
        variant === 'primary' ? buttonStyles.primary : null,
        variant === 'secondary' ? buttonStyles.secondary : null,
        large ? buttonStyles.large : null,
        small ? buttonStyles.small : null,
        pressed ? (variant === 'secondary' ? buttonStyles.secondaryPressed : buttonStyles.pressed) : null,
        disabled ? buttonStyles.disabled : null,
        style,
      ]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <>
          <Text
            style={[
              buttonStyles.label,
              { color: labelColor },
              large ? buttonStyles.labelLarge : null,
              small ? buttonStyles.labelSmall : null,
            ]}
          >
            {label}
          </Text>
          {icon}
        </>
      )}
    </Pressable>
  );
}

const createButtonStyles = (appearance: Appearance) => StyleSheet.create({
  base: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: GhostexRadii.control,
    borderWidth: GhostexStrokeWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: {
    backgroundColor: appearance.accent,
    borderColor: appearance.accent,
  },
  secondary: {
    backgroundColor: appearance.neutralFill,
    borderColor: 'transparent',
  },
  secondaryPressed: {
    backgroundColor: appearance.neutralFillPressed,
  },
  large: {
    height: 48,
  },
  small: {
    height: 32,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelLarge: {
    fontSize: 16,
  },
  labelSmall: {
    fontSize: 13,
  },
});

/** A card-shaped group of key/value rows (`.rows` in the mockup). */
export function SetupRows({
  children,
  panel = false,
  style,
}: {
  children: ReactNode;
  /** `.rows-panel`: #161616 instead of the card fill. */
  panel?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const appearance = useAppearance();
  const rowStyles = useMemo(() => createRowStyles(appearance), [appearance]);
  return <View style={[rowStyles.group, panel ? rowStyles.groupPanel : null, style]}>{children}</View>;
}

export function SetupRow({
  label,
  value,
  mono = false,
  first = false,
  leading,
  compact = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  first?: boolean;
  /** A dot or glyph shown before the value. */
  leading?: ReactNode;
  compact?: boolean;
}) {
  const appearance = useAppearance();
  const rowStyles = useMemo(() => createRowStyles(appearance), [appearance]);
  return (
    <View style={[rowStyles.row, first ? rowStyles.rowFirst : null, compact ? rowStyles.rowCompact : null]}>
      <Text style={[rowStyles.label, compact ? rowStyles.textCompact : null]}>{label}</Text>
      <View style={rowStyles.valueWrap}>
        {leading}
        <Text
          style={[rowStyles.value, mono ? rowStyles.valueMono : null, compact ? rowStyles.textCompact : null]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const createRowStyles = (appearance: Appearance) => StyleSheet.create({
  group: {
    backgroundColor: appearance.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    borderRadius: GhostexRadii.section,
    overflow: 'hidden',
  },
  groupPanel: {
    backgroundColor: appearance.input,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: GhostexStrokeWidth,
    borderTopColor: appearance.border,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowCompact: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: {
    color: appearance.muted,
    fontSize: 14,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  value: {
    color: appearance.foreground,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  valueMono: {
    fontFamily: SETUP_MONOSPACE,
    fontWeight: '500',
    fontSize: 13,
  },
  textCompact: {
    fontSize: 12.5,
  },
});

/** Status dot in a row value (`.dot.ok` etc.). */
export function StatusDot({ color }: { color: string }) {
  return <View style={[dotStyles.dot, { backgroundColor: color }]} />;
}

const dotStyles = StyleSheet.create({
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});

/** Bordered note with a leading glyph (`.callout`). */
export function SetupCallout({ icon, children }: { icon: ReactNode; children: string }) {
  const appearance = useAppearance();
  const calloutStyles = useMemo(() => createCalloutStyles(appearance), [appearance]);
  return (
    <View style={calloutStyles.callout}>
      <View style={calloutStyles.icon}>{icon}</View>
      <Text style={calloutStyles.text}>{children}</Text>
    </View>
  );
}

const createCalloutStyles = (appearance: Appearance) => StyleSheet.create({
  callout: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: GhostexRadii.section,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.input,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    color: appearance.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});

/** Text styles shared by the setup screens. */
const createSetupText = (appearance: Appearance) => StyleSheet.create({
  eyebrow: {
    color: appearance.muted,
    fontSize: 13,
  },
  titleLg: {
    color: appearance.foreground,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.4,
    lineHeight: 31,
  },
  title: {
    color: appearance.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  lede: {
    color: appearance.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  small: {
    color: appearance.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  dim: {
    color: appearance.muted,
  },
  accent: {
    color: appearance.accent,
  },
  strong: {
    color: appearance.foreground,
    fontWeight: '600',
  },
  center: {
    textAlign: 'center',
  },
} satisfies Record<string, TextStyle>);

/** Numbered circle used by option-card steps and the "Where is the code?" list. */
export function StepNumber({ number, size = 22 }: { number: number; size?: number }) {
  const appearance = useAppearance();
  const stepStyles = useMemo(() => createStepStyles(appearance), [appearance]);
  return (
    <View style={[stepStyles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[stepStyles.number, { fontSize: size <= 18 ? 10.5 : 11.5 }]}>{number}</Text>
    </View>
  );
}

const createStepStyles = (appearance: Appearance) => StyleSheet.create({
  circle: {
    backgroundColor: appearance.cardActive,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    color: appearance.muted,
    fontWeight: '700',
  },
});

/** Cached styles of the existing colour model for this shared surface. */
export function useSetupText() {
  const appearance = useAppearance();
  return useMemo(() => createSetupText(appearance), [appearance]);
}
