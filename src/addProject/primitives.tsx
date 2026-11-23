/**
 * Shared Add Project screen primitives rendered with the
 * Ghostex mobile design tokens: card /
 * row / input radii from GhostexRadii, GhostexPalette surfaces, 1dp strokes.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useAppearance, type Appearance } from '../theme/useAppearance';

import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountBadge } from '../components/common/CountBadge';
import KeyboardAwareScrollView from '../components/common/keyboard/KeyboardAwareScrollView';
import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { CaretRightGlyph } from '../components/sessions/icons';
import {
  colorWithOpacity,
  GhostexPalette,
  GhostexRadii,
  GhostexStrokeWidth,
  mixHexColors,
} from '../theme/palette';
import { readableSecondaryText } from '../theme/sidebarAppearance';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function AddProjectShell({ children }: { children: ReactNode }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  // The page reaches under the iPhone Duo's side bar, its content keeps clear of it.
  const edges = useScrollToBarEdges(styles.content);
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        style={edges.scroll}
        contentContainerStyle={[styles.content, edges.content]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

export function SectionTitle({ children }: { children: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function MutedText({ children }: { children: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return <Text style={styles.mutedText}>{children}</Text>;
}

export function ListSection({ children }: { children: ReactNode }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return <View style={styles.listSection}>{children}</View>;
}

export function SectionHeaderRow({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderRowTitle}>{title}</Text>
      {action === undefined ? null : <View style={styles.sectionHeaderRowAction}>{action}</View>}
    </View>
  );
}

export function ListRow({
  badges,
  description,
  disabled,
  first,
  icon,
  onPress,
  testID,
  title,
  trailing,
}: {
  badges?: ReactNode;
  description?: string | null;
  disabled?: boolean;
  first?: boolean;
  icon?: ReactNode;
  onPress: () => void;
  testID?: string;
  title: string;
  trailing?: ReactNode;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const isDisabled = disabled === true;
  return (
    <View
      style={[
        styles.listRowContainer,
        first !== true && styles.listRowDivided,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        accessibilityLabel={title}
        testID={testID}
        disabled={isDisabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.listRow,
          trailing !== undefined && styles.listRowWithTrailing,
          isDisabled && styles.listRowDisabled,
          pressed && !isDisabled && styles.listRowPressed,
        ]}
      >
        {icon === undefined ? null : <View style={styles.listRowIcon}>{icon}</View>}
        <View style={styles.listRowBody}>
          <Text numberOfLines={1} style={styles.listRowTitle}>
            {title}
          </Text>
          {description === undefined || description === null || description.length === 0 ? null : (
            <Text numberOfLines={2} style={styles.listRowDescription}>
              {description}
            </Text>
          )}
          {badges === undefined ? null : <View style={styles.listRowBadges}>{badges}</View>}
        </View>
        {trailing === undefined && !isDisabled ? (
          <CaretRightGlyph size={14} color={appearance.muted} />
        ) : null}
      </Pressable>
      {trailing === undefined ? null : <View style={styles.listRowTrailing}>{trailing}</View>}
    </View>
  );
}

export type MetadataBadgeTone = 'muted' | 'accent' | 'connected';

export function MetadataBadge({
  icon,
  label,
  tone = 'muted',
}: {
  icon?: ReactNode;
  label: string;
  tone?: MetadataBadgeTone;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const containerStyle =
    tone === 'connected'
      ? styles.metaBadgeConnected
      : tone === 'accent'
        ? styles.metaBadgeAccent
        : styles.metaBadgeMuted;
  const labelStyle =
    tone === 'connected'
      ? styles.metaBadgeLabelConnected
      : tone === 'accent'
        ? styles.metaBadgeLabelAccent
        : styles.metaBadgeLabelMuted;
  return (
    <View style={[styles.metaBadge, containerStyle]}>
      {icon === undefined ? null : icon}
      <Text numberOfLines={1} style={[styles.metaBadgeLabel, labelStyle]}>
        {label}
      </Text>
    </View>
  );
}

export function InlineActionButton({
  active,
  count,
  disabled,
  icon,
  label,
  loading,
  onPress,
  primary,
  testID,
}: {
  active?: boolean;
  count?: number;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  loading?: boolean;
  onPress: () => void;
  primary?: boolean;
  testID?: string;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityState={{ disabled: isDisabled, busy: loading === true, selected: active === true }}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineButton,
        primary === true ? styles.inlineButtonPrimary : styles.inlineButtonSecondary,
        active === true && primary !== true && styles.inlineButtonActive,
        isDisabled && styles.inlineButtonDisabled,
        pressed && !isDisabled && (primary === true ? styles.inlineButtonPrimaryPressed : styles.inlineButtonSecondaryPressed),
      ]}
    >
      {loading === true ? (
        <ActivityIndicator size="small" color={primary === true ? appearance.accentForeground : appearance.accent} />
      ) : (
        <>
          {icon === undefined ? null : icon}
          <Text
            numberOfLines={1}
            style={[
              styles.inlineButtonLabel,
              primary === true
                ? styles.inlineButtonLabelPrimary
                : active === true
                  ? styles.inlineButtonLabelActive
                  : styles.inlineButtonLabelSecondary,
            ]}
          >
            {label}
          </Text>
          {count !== undefined ? <CountBadge count={count} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function SetupRequiredBadge({ label }: { label: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryActionButton({
  disabled,
  label,
  loading,
  onPress,
  testID,
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading === true }}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.primaryButton, isDisabled && styles.primaryButtonDisabled]}
    >
      {loading === true ? (
        <ActivityIndicator size="small" color={appearance.accentForeground} />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ProjectPathInput({
  onChangeText,
  onSubmitEditing,
  placeholder,
  testID,
  value,
}: {
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  testID?: string;
  value: string;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <TextInput
      keyboardAppearance={appearance.light ? 'light' : 'dark'}
      style={styles.pathInput}
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      placeholder={placeholder}
      placeholderTextColor={appearance.muted}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
    />
  );
}

/** Inline rose-tinted failure banner — mobile never uses toasts (spec §5.2). */
export function ErrorBanner({ message }: { message: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function PendingRow({ label }: { label: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={styles.pendingRow}>
      <ActivityIndicator size="small" color={appearance.accent} />
      <Text style={styles.pendingLabel}>{label}</Text>
    </View>
  );
}

/** Repository context card pinned above the destination browser (spec §5.7). */
export function RepositoryCard({ subtitle, title }: { subtitle: string; title: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={styles.repositoryCard}>
      <Text numberOfLines={1} style={styles.repositoryTitle}>
        {title}
      </Text>
      <Text numberOfLines={2} style={styles.repositorySubtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appearance.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  sectionTitle: {
    color: appearance.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  sectionHeaderRowTitle: {
    color: appearance.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  sectionHeaderRowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mutedText: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  listSection: {
    overflow: 'hidden',
    borderRadius: GhostexRadii.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.card,
  },
  listRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  listRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 52,
  },
  listRowWithTrailing: {
    paddingRight: 8,
  },
  listRowTrailing: {
    paddingRight: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowDivided: {
    borderTopWidth: GhostexStrokeWidth,
    borderTopColor: appearance.border,
  },
  listRowDisabled: {
    opacity: 0.45,
  },
  listRowPressed: {
    backgroundColor: appearance.cardActive,
  },
  listRowIcon: {
    width: 28,
    height: 28,
    borderRadius: GhostexRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appearance.cardActive,
  },
  listRowBody: {
    flex: 1,
    gap: 2,
  },
  listRowTitle: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  listRowDescription: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  listRowBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: GhostexRadii.pill,
    borderWidth: GhostexStrokeWidth,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 160,
  },
  metaBadgeMuted: {
    borderColor: appearance.border,
    backgroundColor: appearance.cardActive,
  },
  metaBadgeAccent: {
    borderColor: colorWithOpacity(appearance.accent, 40),
    backgroundColor: mixHexColors(appearance.accent, appearance.card, 12),
  },
  metaBadgeConnected: {
    borderColor: colorWithOpacity(appearance.connected, 40),
    backgroundColor: mixHexColors(appearance.connected, appearance.card, 12),
  },
  metaBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaBadgeLabelMuted: {
    color: appearance.muted,
  },
  metaBadgeLabelAccent: {
    color: appearance.accent,
  },
  metaBadgeLabelConnected: {
    color: appearance.connected,
  },
  inlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: GhostexRadii.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    minHeight: 30,
  },
  inlineButtonPrimary: {
    backgroundColor: appearance.accent,
  },
  inlineButtonPrimaryPressed: {
    opacity: 0.85,
  },
  inlineButtonSecondary: {
    backgroundColor: appearance.neutralFill,
  },
  inlineButtonSecondaryPressed: {
    backgroundColor: appearance.neutralFillPressed,
  },
  inlineButtonActive: {
    backgroundColor: mixHexColors(appearance.accent, appearance.card, 18),
  },
  inlineButtonDisabled: {
    opacity: 0.45,
  },
  inlineButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineButtonLabelPrimary: {
    color: appearance.accentForeground,
  },
  inlineButtonLabelSecondary: {
    color: appearance.foreground,
  },
  inlineButtonLabelActive: {
    color: appearance.accent,
  },
  badge: {
    borderRadius: GhostexRadii.pill,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.working,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeLabel: {
    color: appearance.working,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryButton: {
    height: 48,
    borderRadius: GhostexRadii.card,
    backgroundColor: appearance.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonLabel: {
    color: appearance.accentForeground,
    fontSize: 15,
    fontWeight: '700',
  },
  pathInput: {
    backgroundColor: appearance.input,
    borderRadius: GhostexRadii.input,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    color: appearance.foreground,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 14,
    fontFamily: MONOSPACE,
  },
  errorBanner: {
    borderRadius: GhostexRadii.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.danger,
    backgroundColor: 'rgba(232,92,92,0.08)',
    padding: 12,
  },
  errorText: {
    color: readableSecondaryText(GhostexPalette.DANGER, appearance.foreground, [
      mixHexColors(GhostexPalette.DANGER, appearance.background, 8),
    ]),
    fontSize: 13,
    lineHeight: 18,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  pendingLabel: {
    color: appearance.muted,
    fontSize: 12,
    flex: 1,
  },
  repositoryCard: {
    borderRadius: GhostexRadii.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  repositoryTitle: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  repositorySubtitle: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});
