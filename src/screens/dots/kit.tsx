/**
 * Building blocks of the OpenDots screens, in the phone's own look: page, cards, buttons and fields
 * follow Settings > Theme (`useAppearance`) like the Settings pages, and the layout ports Open Dot's
 * SettingsKit (`Section`, `Empty`, `RemoveButton`) to one phone column.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { XGlyph } from '../../components/sessions/icons';
import { useAppearanceHeader } from '../settings/useAppearanceHeader';
import { GhostexPalette, GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

const stylesByAppearance = new WeakMap<Appearance, ReturnType<typeof createStyles>>();

function createStyles(appearance: Appearance) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: appearance.background },
    content: { padding: 14, paddingBottom: 40, gap: 12 },
    section: { gap: 8, marginTop: 6 },
    eyebrow: {
      color: appearance.muted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    sectionTitle: { color: appearance.foreground, fontSize: 16, fontWeight: '600' },
    description: { color: appearance.muted, fontSize: 13, lineHeight: 18 },
    card: {
      backgroundColor: appearance.card,
      borderRadius: GhostexRadii.section,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      padding: 12,
      gap: 10,
    },
    listCard: {
      backgroundColor: appearance.card,
      borderRadius: GhostexRadii.section,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      overflow: 'hidden',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    listDivider: { height: GhostexStrokeWidth, backgroundColor: appearance.border },
    text: { color: appearance.foreground, fontSize: 14, lineHeight: 19 },
    muted: { color: appearance.muted, fontSize: 13, lineHeight: 18 },
    mono: { color: appearance.muted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    button: {
      minHeight: 38,
      paddingHorizontal: 14,
      borderRadius: GhostexRadii.control,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    buttonSmall: { minHeight: 32, paddingHorizontal: 10 },
    buttonPrimary: { backgroundColor: GhostexPalette.ACCENT },
    buttonSecondary: {
      backgroundColor: appearance.cardActive,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
    },
    buttonQuiet: { backgroundColor: 'transparent' },
    buttonDanger: { backgroundColor: GhostexPalette.DANGER },
    buttonPressed: { opacity: 0.75 },
    buttonDisabled: { opacity: 0.4 },
    buttonLabel: { fontSize: 14, fontWeight: '600' },
    buttonLabelSmall: { fontSize: 13 },
    chip: {
      minHeight: 32,
      paddingHorizontal: 11,
      borderRadius: GhostexRadii.control,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.input,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipSelected: { backgroundColor: appearance.foreground, borderColor: appearance.foreground },
    chipLabel: { color: appearance.muted, fontSize: 13 },
    chipLabelSelected: { color: appearance.background, fontWeight: '600' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    field: {
      minHeight: 40,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: GhostexRadii.input,
      backgroundColor: appearance.input,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      color: appearance.foreground,
      fontSize: 14,
    },
    fieldMultiline: { minHeight: 84, textAlignVertical: 'top' },
    label: { color: appearance.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    empty: {
      borderRadius: GhostexRadii.section,
      borderWidth: GhostexStrokeWidth,
      borderStyle: 'dashed',
      borderColor: appearance.border,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    emptyText: { color: appearance.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
    remove: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    error: { color: GhostexPalette.STATUS_ERROR, fontSize: 13, lineHeight: 18 },
    segmented: {
      flexDirection: 'row',
      borderRadius: GhostexRadii.control,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.input,
      padding: 3,
      gap: 3,
    },
    segment: { flex: 1, minHeight: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    segmentSelected: { backgroundColor: appearance.cardActive },
    segmentLabel: { color: appearance.muted, fontSize: 13, fontWeight: '600' },
    segmentLabelSelected: { color: appearance.foreground },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  });
}

export function useDotsStyles(): ReturnType<typeof createStyles> {
  const appearance = useAppearance();
  let styles = stylesByAppearance.get(appearance);
  if (styles === undefined) {
    styles = createStyles(appearance);
    stylesByAppearance.set(appearance, styles);
  }
  return styles;
}

/** A scrolling Dots page whose page and header follow the appearance, with pull to refresh. */
export function DotsPage({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const appearance = useAppearanceHeader();
  const styles = useDotsStyles();
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps='handled'
          refreshControl={
            onRefresh === undefined ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={appearance.muted}
                colors={[GhostexPalette.ACCENT]}
                progressBackgroundColor={appearance.background}
              />
            )
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A full-page message (loading, OpenDots off, an old computer, a missing dot). */
export function DotsMessage({
  title,
  body,
  loading = false,
  children,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const appearance = useAppearanceHeader();
  const styles = useDotsStyles();
  return (
    <View style={[styles.page, styles.centered]}>
      {loading ? <ActivityIndicator color={appearance.muted} /> : null}
      <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>{title}</Text>
      {body !== undefined ? <Text style={[styles.description, { textAlign: 'center' }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** Open Dot's settings Section, stacked: eyebrow, title, description, then its controls. */
export function Section({
  eyebrow,
  title,
  description,
  right,
  children,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const styles = useDotsStyles();
  return (
    <View style={styles.section}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, gap: 3 }}>
          {eyebrow !== undefined ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          {title !== undefined ? <Text style={styles.sectionTitle}>{title}</Text> : null}
        </View>
        {right}
      </View>
      {description !== undefined ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useDotsStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A bordered list whose rows are separated by hairlines. */
export function ListCard({ children }: { children: ReactNode[] }) {
  const styles = useDotsStyles();
  const rows = children.filter((child) => child !== null && child !== undefined && child !== false);
  return (
    <View style={styles.listCard}>
      {rows.map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.listDivider} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function DotsButton({
  label,
  onPress,
  variant = 'secondary',
  small = false,
  disabled = false,
  busy = false,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const labelColor =
    variant === 'primary'
      ? GhostexPalette.ACCENT_FOREGROUND
      : variant === 'danger'
        ? GhostexPalette.FOREGROUND
        : appearance.foreground;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small ? styles.buttonSmall : null,
        variant === 'primary'
          ? styles.buttonPrimary
          : variant === 'danger'
            ? styles.buttonDanger
            : variant === 'quiet'
              ? styles.buttonQuiet
              : styles.buttonSecondary,
        pressed ? styles.buttonPressed : null,
        disabled || busy ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size='small' color={labelColor} /> : icon}
      <Text style={[styles.buttonLabel, small ? styles.buttonLabelSmall : null, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  leading,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
}) {
  const styles = useDotsStyles();
  return (
    <Pressable
      accessibilityRole='radio'
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      {leading}
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useDotsStyles();
  return <View style={styles.chipRow}>{children}</View>;
}

export function Field({ multiline, style, ...props }: TextInputProps) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  return (
    <TextInput
      placeholderTextColor={appearance.muted}
      multiline={multiline}
      style={[styles.field, multiline ? styles.fieldMultiline : null, style]}
      {...props}
    />
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  const styles = useDotsStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const styles = useDotsStyles();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

export function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.remove, pressed ? { backgroundColor: appearance.cardActive } : null]}
    >
      <XGlyph size={14} color={appearance.muted} />
    </Pressable>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  const styles = useDotsStyles();
  if (message === null || message.length === 0) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useDotsStyles();
  return (
    <View style={styles.segmented} accessibilityRole='tablist'>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole='tab'
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.segmentLabel, selected ? styles.segmentLabelSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
