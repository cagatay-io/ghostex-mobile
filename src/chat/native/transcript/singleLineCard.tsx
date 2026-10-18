/**
 * Every transcript card that folds to one line: the "Worked for 12s" / "Previous turn" fold
 * (`TranscriptItemRow.tsx`), the Message from / Message to / subagent reply cards
 * (`AgentMessageCards.tsx`), the answered question form (`QuestionForm.tsx`) and the "You answered"
 * receipts (`cards/QuestionExchangeCards.tsx`). They are 44pt tall with their border, wear the fold's
 * fill and hairline, and title in the fold's type. None draws a chevron (the whole card opens and
 * closes), and every status on the right is a `SingleLinePill` shaped like the fold's "1 tool call",
 * in its own colour. The fold leads with a clock `SingleLineTile` wearing a green check badge, the
 * question cards with a question-bubble tile, sized like the agent mark on "Message from".
 *
 * CDXC:SessionChat 2026-10-18 SEE-ALSO:
 * The values are `packages/gx-chat-core/visual/single-line-card.json`, which the desktop reads in
 * `apps/desktop/src/app/native_chat/cards.rs` (`SINGLE_LINE_CARD`, where the user's decision is).
 * Change them together. The phone keeps its fold's own fill (`ink(0.025)`), not the desktop's
 * input tone.
 */

import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Glyph, type GlyphName } from './icons';
import { useTranscriptTheme, type TranscriptTheme } from './theme';

export const SINGLE_LINE_CARD = {
  height: 44,
  radius: 10,
  paddingX: 12,
  titleSize: 13.5,
  titleLineHeight: 18,
  titleWeight: '500' as TextStyle['fontWeight'],
  borderAlpha: 0.06,
  pill: { paddingX: 8, paddingY: 2, gap: 5, textSize: 11.5, lineHeight: 16, iconSize: 12, borderAlpha: 0.1 },
  tile: { size: 22, radius: 6, glyphSize: 14, fillAlpha: 0.06, glyphAlpha: 0.8 },
  badge: { size: 13, ring: 2, offset: -4, glyphSize: 8, fill: '#16a34a' },
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

/**
 * The tile leading the fold (`clock`, with the green check badge when `checked`) and the question
 * cards (`question`). The glyphs are the mockup's own 16-unit drawings (desktop
 * `assets/titlebar/chat-card-*.svg`), not the 24-unit Tabler set `Glyph` draws.
 */
export function SingleLineTile({ glyph, checked }: { glyph: 'clock' | 'question'; checked?: boolean }) {
  const theme = useTranscriptTheme();
  const { tile, badge } = SINGLE_LINE_CARD;
  const ink = theme.ink(tile.glyphAlpha);
  const ring = badge.size + 2 * badge.ring;
  return (
    <View style={[styles.tile, { backgroundColor: theme.ink(tile.fillAlpha) }]}>
      <Svg width={tile.glyphSize} height={tile.glyphSize} viewBox='0 0 16 16' fill='none' stroke={ink}>
        {glyph === 'clock' ? (
          <>
            <Circle cx={8} cy={8} r={5.8} strokeWidth={1.4} />
            <Path d='M8 4.8V8l2.2 1.4' strokeWidth={1.4} strokeLinecap='round' />
          </>
        ) : (
          <>
            <Path
              d='M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5V11.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z'
              strokeWidth={1.3}
              strokeLinejoin='round'
            />
            <Path d='M6.6 6.2a1.5 1.5 0 1 1 2.1 1.4c-.5.2-.7.5-.7 1' strokeWidth={1.3} strokeLinecap='round' />
            <Circle cx={8} cy={10} r={0.7} fill={ink} stroke='none' />
          </>
        )}
      </Svg>
      {checked === true ? (
        // The ring is the card's own fill over the transcript, so the tile's corner never shows through it.
        <View style={[styles.badge, { width: ring, height: ring, borderRadius: ring / 2, backgroundColor: theme.background }]}>
          <View style={[styles.badgeRing, { borderRadius: ring / 2, backgroundColor: theme.ink(0.025) }]}>
            <View style={[styles.badgeDot, { backgroundColor: badge.fill }]}>
              <Svg width={badge.glyphSize} height={badge.glyphSize} viewBox='0 0 10 10' fill='none'>
                <Path d='M2 5.2 4.2 7.4 8 2.8' stroke='#ffffff' strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round' />
              </Svg>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: SINGLE_LINE_CARD.tile.size,
    height: SINGLE_LINE_CARD.tile.size,
    borderRadius: SINGLE_LINE_CARD.tile.radius,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: { position: 'absolute', right: SINGLE_LINE_CARD.badge.offset, bottom: SINGLE_LINE_CARD.badge.offset },
  badgeRing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeDot: {
    width: SINGLE_LINE_CARD.badge.size,
    height: SINGLE_LINE_CARD.badge.size,
    borderRadius: SINGLE_LINE_CARD.badge.size / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
