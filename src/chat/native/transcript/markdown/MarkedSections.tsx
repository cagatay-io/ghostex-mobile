/**
 * Marked sections in an agent's reply: each section drawn in its kind's colour, in the style picked
 * in Settings > Chat. The core finds the sections (`packages/gx-chat-core/src/transcript/marked_sections.rs`);
 * this file only draws them.
 *
 * CDXC:MarkedHandovers 2026-10-11 DECISION:
 * User picked three styles from the mockups (docs/2026-10-11/chat-section-markers/index.html in the Ghostex repo): A, a thin left rule in the kind's colour with the emoji kept; C, a coloured badge naming the kind in place of the emoji, dropping a bold label that only repeats it; D, the emoji kept and the label coloured, the default. The phone cannot read the computer's Marked handovers switch, so its own Settings > Chat entry picks the style and adds Plain text for no colouring. Supersedes the same day's summary strip at the top of the message (user: "let's actually just remove the summary at the top i don't think it's useful at all").
 *
 * CDXC:MarkedHandovers 2026-10-11 DECISION:
 * User: "add a toggle for emojis in the colorful handover please. and set it to off by default. and if enabled add emojis to all 3." Show marker emojis (Settings > Chat > Marked sections, off by default): off, no style shows the marker emoji and the colour and label carry the kind (a section with no label of its own shows the kind's name as its coloured label); on, all three show it, the badge style before its badge.
 * SEE-ALSO: apps/desktop/src/app/native_chat/marked_look.rs in the Ghostex repo (the desktop look and the same palette).
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSettingsStore, type MarkedHandoversStyle } from '../../../../settings/store';
import { PROSE_LINE, PROSE_SIZE, type TranscriptTheme } from '../theme';
import type { SectionMeta } from './parse';

/** The "In progress" colour (user pick 2026-10-11: #00A6ED); darkened on a light chat, where it reads 2.7:1. */
const IN_PROGRESS = { dark: '#00a6ed', light: '#0077b6' };

const PALETTE: { [kind: string]: { dark: string; light: string } } = {
  need: { dark: '#fb923c', light: '#c2410c' },
  done: { dark: '#4ade80', light: '#15803d' },
  read: { dark: '#fbbf24', light: '#b45309' },
  kicked: { dark: '#f472b6', light: '#be185d' },
  progress: IN_PROGRESS,
  untested: { dark: '#2dd4bf', light: '#0f766e' },
  shipped: { dark: '#818cf8', light: '#4f46e5' },
  blocked: { dark: '#f87171', light: '#dc2626' },
};

export function kindColor(kind: string, light: boolean): string {
  const entry = PALETTE[kind];
  if (entry === undefined) return light ? '#71717b' : '#9e9e9e';
  return light ? entry.light : entry.dark;
}

/** `#rrggbb` at `alpha`, as `#rrggbbaa`. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

function tint(theme: TranscriptTheme): { fill: number; edge: number } {
  return theme.light ? { fill: 0.07, edge: 0.28 } : { fill: 0.11, edge: 0.3 };
}

export function useMarkedStyle(): MarkedHandoversStyle {
  return useSettingsStore((store) => store.settings.markedHandoversStyle);
}

export function useMarkedEmoji(): boolean {
  return useSettingsStore((store) => store.settings.markedHandoversEmoji);
}

type SectionProps = {
  meta: SectionMeta;
  style: MarkedHandoversStyle;
  /** Show the marker emoji (Show marker emojis). */
  emoji: boolean;
  theme: TranscriptTheme;
  color: string;
  /** Every line of the section drawn as written (style A, and Plain text). */
  all: ReactNode;
  /** The lines after the first (styles C and D). */
  rest: ReactNode;
  /** The label, as inline text: a marked heading's label is the whole heading, links and code spans included (styles C and D). */
  label: ReactNode;
  /** The first line without its emoji, drawn as written (the thin rule with emojis off). */
  first: ReactNode;
  selectable: boolean;
};

export function MarkedSection({
  meta,
  style,
  emoji,
  theme,
  color,
  all,
  rest,
  label: labelText,
  first,
  selectable,
}: SectionProps) {
  if (style === 'plain') return <View>{all}</View>;
  const accent = kindColor(meta.kind, theme.light);
  if (style === 'rule') {
    return (
      <View style={[styles.rule, { borderLeftColor: accent }]}>
        {emoji ? (
          all
        ) : (
          <>
            {first}
            {rest}
          </>
        )}
      </View>
    );
  }
  // The label stands alone on its line: the core moves whatever followed it into `rest`, under it.
  if (style === 'badge') {
    const { fill, edge } = tint(theme);
    const label = meta.label.length > 0 && !meta.labelRepeats ? meta.label : '';
    return (
      <View>
        <View style={styles.badgeRow}>
          {emoji ? <Text style={[styles.prose, { color }]}>{meta.emoji}</Text> : null}
          <View style={styles.badgeLine}>
            <View
              style={[
                styles.badge,
                { borderColor: withAlpha(accent, edge), backgroundColor: withAlpha(accent, fill + 0.05) },
              ]}
            >
              <View style={[styles.badgeDot, { backgroundColor: accent }]} />
              <Text style={[styles.badgeText, { color: accent }]}>{meta.name.toUpperCase()}</Text>
            </View>
          </View>
          {label.length > 0 ? (
            <Text
              selectable={selectable}
              style={[styles.prose, styles.badgeLead, styles.label, { color: theme.foreground }]}
            >
              {labelText}
            </Text>
          ) : null}
        </View>
        {rest}
      </View>
    );
  }
  // Coloured labels: the line reads as written, with its label in the kind's colour; without the
  // emoji, a section with no label of its own shows the kind's name so the line keeps its colour.
  const label = meta.label.length > 0 ? labelText : emoji ? null : `${meta.name}:`;
  const hasLabel = meta.label.length > 0 || !emoji;
  return (
    <View>
      <Text selectable={selectable} style={[styles.prose, { color }]}>
        {emoji ? `${meta.emoji} ` : null}
        {hasLabel ? <Text style={[styles.label, { color: accent }]}>{label}</Text> : null}
      </Text>
      {rest}
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE },
  label: { fontWeight: '600' },
  rule: { borderLeftWidth: 3, paddingLeft: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  badgeLine: { height: PROSE_LINE, justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 7,
    paddingRight: 8,
    paddingVertical: 3,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, lineHeight: 13, fontWeight: '600', letterSpacing: 0.4 },
  badgeLead: { flex: 1, minWidth: 0 },
});
