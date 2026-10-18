/**
 * Every transcript card that folds to one line: the "Worked for 12s" / "Previous turn" fold
 * (`TranscriptItemRow.tsx`), the Message from / Message to / subagent reply cards
 * (`AgentMessageCards.tsx`), the answered question form (`QuestionForm.tsx`) and the "You answered"
 * receipts (`cards/QuestionExchangeCards.tsx`). They are 44pt tall with their border, wear the fold's
 * fill and hairline, and title in the fold's type; an icon tile shrinks to fit the row. None draws a
 * chevron (the whole card opens and closes), and every status on the right is a `SingleLinePill`
 * shaped like the fold's "1 tool call", in its own colour.
 *
 * CDXC:SessionChat 2026-10-18 SEE-ALSO:
 * The values are `packages/gx-chat-core/visual/single-line-card.json`, which the desktop reads in
 * `apps/desktop/src/app/native_chat/cards.rs` (`SINGLE_LINE_CARD`, where the user's decision is).
 * Change them together. The phone keeps its fold's own fill (`ink(0.025)`), not the desktop's
 * input tone.
 */

import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { Glyph, type GlyphName } from './icons';
import { useTranscriptTheme, type TranscriptTheme } from './theme';

export const SINGLE_LINE_CARD = {
  height: 44,
  radius: 10,
  paddingX: 12,
  titleSize: 13.5,
  titleLineHeight: 18,
  titleWeight: '500' as TextStyle['fontWeight'],
  iconBox: 24,
  iconSize: 13,
  borderAlpha: 0.06,
  pill: { paddingX: 8, paddingY: 2, gap: 5, textSize: 11.5, lineHeight: 16, iconSize: 12, borderAlpha: 0.1 },
};

/** The fold's border width, which the header inside a shell leaves room for. */
const BORDER = StyleSheet.hairlineWidth;

/** The header inside a bordered shell, so the folded card is 44pt tall with its border. */
export const SINGLE_LINE_HEADER_HEIGHT = SINGLE_LINE_CARD.height - 2 * BORDER;

/** The shell: the fold's fill, hairline and radius. */
export function singleLineShell(theme: TranscriptTheme): ViewStyle {
  return {
    borderRadius: SINGLE_LINE_CARD.radius,
    borderWidth: BORDER,
    borderColor: theme.ink(SINGLE_LINE_CARD.borderAlpha),
    backgroundColor: theme.ink(0.025),
    overflow: 'hidden',
  };
}

/** The title's type, the fold's "Worked for 12s". */
export const SINGLE_LINE_TITLE: TextStyle = {
  fontSize: SINGLE_LINE_CARD.titleSize,
  lineHeight: SINGLE_LINE_CARD.titleLineHeight,
  fontWeight: SINGLE_LINE_CARD.titleWeight,
};

/** A pill on the card's right: `color` tints its glyph and words, its hairline stays neutral. */
export function SingleLinePill({ icon, label, color }: { icon?: GlyphName; label?: string; color: string }) {
  const theme = useTranscriptTheme();
  const pill = SINGLE_LINE_CARD.pill;
  return (
    <View style={[styles.pill, { borderColor: theme.ink(pill.borderAlpha) }]}>
      {icon !== undefined ? <Glyph name={icon} size={pill.iconSize} color={color} /> : null}
      {label !== undefined ? <Text style={[styles.pillText, { color }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: SINGLE_LINE_CARD.pill.gap,
    paddingHorizontal: SINGLE_LINE_CARD.pill.paddingX,
    paddingVertical: SINGLE_LINE_CARD.pill.paddingY,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: SINGLE_LINE_CARD.pill.textSize, lineHeight: SINGLE_LINE_CARD.pill.lineHeight },
});
