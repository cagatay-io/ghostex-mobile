/**
 * The tone card the notices and approvals above the composer are drawn in: a faint wash of the
 * card's tone, a tinted icon tile beside a title and a muted detail line, the body, and a footer
 * with one primary action and neutral filled secondary buttons. Port of desktop
 * `tone_card.rs`; the decision is on `notice_tone` in
 * `packages/gx-chat-core/src/questions/notice_tone.rs`.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Glyph, type GlyphName } from './icons';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';

/** `packages/gx-chat-core/visual/notice-tone.json`. */
const TONES: Record<string, { icon: GlyphName; dark: string | null; light: string | null }> = {
  wait: { icon: 'clock', dark: '#fbbf24', light: '#b45309' },
  approval: { icon: 'shield-check', dark: '#fb923c', light: '#c2410c' },
  error: { icon: 'alert-circle', dark: '#fb7185', light: '#be123c' },
  warning: { icon: 'alert-triangle', dark: '#fbbf24', light: '#b45309' },
  info: { icon: 'info-circle', dark: '#7dd3fc', light: '#0369a1' },
  terminal: { icon: 'terminal-2', dark: null, light: null },
};
const SHELL = {
  radius: 14,
  padX: 14,
  padY: 12,
  tile: 28,
  tileRadius: 8,
  tileIcon: 15,
  headerGap: 10,
  titleSize: 13.5,
  titleLineHeight: 18,
  detailSize: 12,
  detailLineHeight: 16,
  washDark: 0.05,
  washLight: 0.04,
  tileFill: 0.12,
  tileRing: 0.2,
  footerShadeDark: 0.14,
  footerShadeLight: 0.025,
  buttonHeight: 28,
  buttonRadius: 8,
  buttonTextSize: 13,
};

/** `#rrggbb` at `alpha`. */
function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export type ToneLook = { hue: string | null; icon: GlyphName };

export function toneLook(tone: string, light: boolean): ToneLook {
  const entry = TONES[tone] ?? TONES.info;
  return { hue: light ? entry.light : entry.dark, icon: entry.icon };
}

export function ToneCard({
  tone,
  icon,
  title,
  detail,
  trailing,
  body,
  footerStart,
  footerEnd,
  onPressHeader,
  accessibilityLabel,
}: {
  tone: string;
  /** Replaces the tone's own glyph (an API error card draws its failure's). */
  icon?: GlyphName;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  body?: ReactNode[];
  footerStart?: ReactNode[];
  footerEnd?: ReactNode[];
  /** Makes the header the fold's target. */
  onPressHeader?: () => void;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const toneOnly = toneLook(tone, P.light);
  const look = icon === undefined ? toneOnly : { ...toneOnly, icon };
  const bodyItems = (body ?? []).filter((item) => item !== null && item !== undefined && item !== false);
  const start = (footerStart ?? []).filter(Boolean);
  const end = (footerEnd ?? []).filter(Boolean);
  const hasFooter = start.length > 0 || end.length > 0;
  const wash = look.hue === null ? null : withAlpha(look.hue, P.light ? SHELL.washLight : SHELL.washDark);
  const headerContent = (
    <>
      <View
        style={[
          styles.tile,
          look.hue === null
            ? { backgroundColor: P.light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderColor: P.controlBorder }
            : {
                backgroundColor: withAlpha(look.hue, SHELL.tileFill),
                borderColor: withAlpha(look.hue, SHELL.tileRing),
              },
        ]}
      >
        <Glyph name={look.icon} size={SHELL.tileIcon} color={look.hue ?? P.muted} />
      </View>
      <View style={styles.titleColumn}>
        <Text style={styles.title}>{title}</Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  return (
    <View style={[styles.card, { backgroundColor: P.cardPanel }]}>
      {wash !== null ? (
        <Svg style={styles.wash} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="tone-wash" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={wash} stopOpacity={1} />
              <Stop offset="1" stopColor={wash} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#tone-wash)" />
        </Svg>
      ) : null}
      {onPressHeader === undefined ? (
        <View style={styles.header}>{headerContent}</View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPressHeader}
          style={({ pressed }) => [styles.header, pressed && { backgroundColor: P.pressedFill }]}
        >
          {headerContent}
        </Pressable>
      )}
      {bodyItems.length > 0 ? <View style={styles.body}>{bodyItems}</View> : null}
      {hasFooter ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: `rgba(0,0,0,${P.light ? SHELL.footerShadeLight : SHELL.footerShadeDark})` },
          ]}
        >
          {start}
          <View style={styles.spacer} />
          {end}
        </View>
      ) : null}
    </View>
  );
}

/**
 * How much a footer button stands out. There is no ghost or outlined footer button: every labelled
 * one is filled (CDXC:AppModal 2026-10-14 on the desktop's `neutral_button_fills`).
 */
export type ToneButtonKind = 'primary' | 'secondary';

/** A footer button. The phone has no keyboard hints. */
export function ToneButton({
  label,
  icon,
  kind,
  disabled,
  onPress,
}: {
  label: string;
  icon?: GlyphName;
  kind: ToneButtonKind;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const fill = kind === 'primary' ? P.controlPrimary : P.neutralFill;
  const pressedFill = kind === 'primary' ? P.controlPrimary : P.neutralFillPressed;
  const ink = kind === 'primary' ? P.background : P.foreground;
  const border = kind === 'primary' ? P.controlPrimary : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled === true}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? pressedFill : fill, borderColor: border },
        pressed && kind === 'primary' && { opacity: 0.88 },
        disabled === true && styles.disabled,
      ]}
    >
      {icon !== undefined ? <Glyph name={icon} size={14} color={ink} /> : null}
      <Text style={[styles.buttonLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

/** The circled X every chat card dismisses with, filled like the secondary footer buttons (the 2026-09-07 decision in the desktop's approval.rs). */
export function ToneDismiss({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.dismiss, pressed && { backgroundColor: P.neutralFillPressed }]}
    >
      <Glyph name="x" size={14} color={P.muted} />
    </Pressable>
  );
}

/** The command an approval shows, a muted `$ ` before a shell command. */
export function CommandBox({ command, shell }: { command: string; shell: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.commandBox}>
      <ScrollView style={styles.commandScroll} nestedScrollEnabled>
        <Text style={styles.commandText} selectable>
          {shell ? <Text style={styles.promptSign}>{'$ '}</Text> : null}
          {command}
        </Text>
      </ScrollView>
    </View>
  );
}

/** Whether an approval's tool runs shell commands (`is_shell_tool` in tone_card.rs). */
export function isShellTool(tool: string): boolean {
  const lower = tool.toLowerCase();
  return ['bash', 'shell', 'command', 'exec', 'terminal', 'powershell'].some((needle) => lower.includes(needle));
}

const useStyles = themedStyles((P) => ({
  card: {
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: SHELL.radius,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SHELL.headerGap,
    paddingHorizontal: SHELL.padX,
    paddingVertical: SHELL.padY,
  },
  tile: {
    width: SHELL.tile,
    height: SHELL.tile,
    borderRadius: SHELL.tileRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: P.foreground,
    fontSize: SHELL.titleSize,
    lineHeight: SHELL.titleLineHeight,
    fontWeight: '600',
  },
  detail: {
    color: P.muted,
    fontSize: SHELL.detailSize,
    lineHeight: SHELL.detailLineHeight,
  },
  body: {
    gap: 12,
    paddingHorizontal: SHELL.padX,
    paddingBottom: SHELL.padX,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SHELL.padX,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.controlBorder,
  },
  spacer: {
    flexGrow: 1,
  },
  button: {
    height: SHELL.buttonHeight,
    paddingHorizontal: 11,
    borderRadius: SHELL.buttonRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonLabel: {
    fontSize: SHELL.buttonTextSize,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
  dismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: P.neutralFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandBox: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: P.wellBorder,
    backgroundColor: P.light ? P.input : 'rgba(14,14,14,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commandScroll: {
    maxHeight: 160,
  },
  commandText: {
    color: P.foreground,
    fontFamily: MONO_FONT,
    fontSize: 12.5,
    lineHeight: 20,
  },
  promptSign: {
    color: P.muted,
  },
}));
