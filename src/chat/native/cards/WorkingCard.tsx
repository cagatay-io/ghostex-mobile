/**
 * The working card (`workingCard`, decided in packages/gx-chat-core/src/extras/working_card.rs). Port
 * of desktop `working_card.rs`: one row with the spark and the working or worked line, right above
 * the cards and the composer, so the transcript's visible area ends above it and nothing scrolls
 * under it. The pills it used to carry sit in the chat box's strip (`PillsStrip.tsx`). It never
 * opens; while the scroll-to-bottom pill shows, a tap anywhere on the card scrolls to the bottom
 * (otherwise a tap does nothing). The inverted transcript already keeps a short conversation at its
 * bottom, right above this row.
 *
 * A label longer than the card is cut with an ellipsis, a tool's file paths shortened to their file
 * names (the core's `labelParts`); pressing and holding the card shows the whole label in a bubble
 * above it, as hovering does on the desktop.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ChatDocument, WorkingCard as WorkingCardValue } from '../../rust/document';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { IconPill } from './ChatPills';
import { Glyph } from './icons';
import { isTrue, num, obj, str } from './json';
import { chatCardsShown, COMPOSER_TOP_PADDING, STACK_GAP } from './NativeChatCards';
import { pillsStripShown, type PillsStripLinks } from './PillsStrip';
import { PulseDot, Spinner } from './primitives';
import { ProgressTrack, VISUAL, WorkingSpark, type ArmedAction } from './WorkingStrip';

/** The transcript rows' column (`Transcript.tsx` `ROW_MAX_WIDTH`). */
const ROW_MAX_WIDTH = 768;
/** How far the lone scroll-to-bottom pill sits above the transcript's bottom edge (desktop `transcript_layout.rs`). */
const END_PADDING = 16;
const HEADER_PAD_Y = 6;
/** The line's height, the pills' 22 it was sized for, so the bar keeps its height (desktop `LINE_HEIGHT`). */
const LINE_HEIGHT = 22;

/**
 * The gap between the card's bottom edge and the chat box's top edge when nothing stacks between
 * them; the composer brings 6 of it (`NativeComposer.tsx` `root.paddingTop`), the card's row the rest.
 *
 * CDXC:SessionChat 2026-10-18 DECISION:
 * User, pointing at the gap between the working card and the chat box: "reduce the margin here to
 * 9px". A card stacked under the working card sits `STACK_GAP` below it instead (the 2026-10-23
 * decision in `NativeChatCards.tsx`). Desktop: `WORKING_CARD_GAP` in
 * apps/desktop/src/app/native_chat/working_card.rs.
 */
const BOX_GAP = 9;
/*
 * CDXC:SessionChat 2026-10-20 DECISION:
 * User: "i want clicking anywhere on the bar that's above the composer to scroll to the bottom (when the scroll to bottom button is shown) so i dont need to click specifically on that button". The card's own press scrolls to the bottom while the pill shows. Desktop: `render_working_card` in apps/desktop/src/app/native_chat/working_card.rs.
 */

/** Nothing stacks between the card and the chat box: no card band and nothing above the box in the composer. */
function sitsOnBox(document: ChatDocument): boolean {
  return (
    !chatCardsShown(document) &&
    document.incomingDraft === null &&
    !document.note.open &&
    document.catchUp?.open !== true &&
    obj(document.suggestions) === null &&
    document.runLocation === undefined
  );
}

/** The card's share of the gap under it: the card band brings its own top padding, the composer 6. */
function cardGap(document: ChatDocument): number {
  if (sitsOnBox(document)) return BOX_GAP - COMPOSER_TOP_PADDING;
  return chatCardsShown(document) ? 0 : STACK_GAP - COMPOSER_TOP_PADDING;
}

export function WorkingCard({ document }: { document: ChatDocument }) {
  const styles = useStyles();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  const [held, setHeld] = useState(false);
  const card = document.workingCard;
  if (card === undefined || card.visible !== true || card.label === null) return null;
  const showJump = awayFromBottom && jumpToBottom !== null;
  const label = card.label;
  const strong = card.labelKind === 'tool' || card.labelKind === 'activity';
  const parts = card.labelParts ?? [];
  return (
    <View style={styles.row}>
      <View style={[styles.column, { paddingBottom: cardGap(document) }]}>
        <Pressable
          onPress={showJump ? () => jumpToBottom?.() : undefined}
          onLongPress={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
          accessibilityRole="summary"
          accessibilityLabel={card.ariaLabel}
          style={styles.card}
        >
          <Lead card={card} />
          <View style={styles.labelSlot}>
            <Text style={strong ? styles.labelStrong : styles.label} numberOfLines={1} ellipsizeMode="tail">
              {parts.length > 0
                ? parts.map((part, index) => (
                    <Text key={index} style={part.dim === true ? styles.dim : null}>
                      {part.text}
                    </Text>
                  ))
                : label}
            </Text>
            {card.labelKind === 'activity' ? <ActivityTrailing activity={obj(card.activity)} /> : null}
          </View>
        </Pressable>
        {held ? (
          <View pointerEvents="none" style={styles.bubble}>
            <Text style={styles.bubbleText}>{label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Scroll-to-bottom on its own over the transcript's bottom edge, while the reader is away from the
 * bottom and the chat box has no pill strip to carry it (desktop `render_lone_scroll_bottom`): a strip
 * opened only for the ↓ would resize the box every time the reader scrolled up.
 */
export function LoneScrollBottom({
  document,
  armed,
  links,
}: {
  document: ChatDocument;
  armed: readonly ArmedAction[];
  links?: PillsStripLinks | null;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  if (pillsStripShown(document, armed, links ?? null, P.cardMuted) || !awayFromBottom || jumpToBottom === null) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={styles.lone}>
      <View pointerEvents="box-none" style={styles.loneColumn}>
        <IconPill
          glyph="arrow-down"
          accessibilityLabel="Scroll to bottom"
          color={P.primary}
          onPress={() => jumpToBottom()}
        />
      </View>
    </View>
  );
}

function Lead({ card }: { card: WorkingCardValue }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (card.labelKind === null) return null;
  if (card.labelKind === 'activity') {
    return (
      <View style={styles.sparkBox}>
        {isTrue(obj(card.activity), 'shellsRunning') ? (
          <Spinner size={14} color={P.controlPrimary} />
        ) : (
          <PulseDot size={6} color={P.controlPrimary} active />
        )}
      </View>
    );
  }
  if (card.labelKind === 'worked') {
    return (
      <View style={styles.sparkBox}>
        <Glyph name="check" size={VISUAL.sparkSize} color={P.muted} />
      </View>
    );
  }
  return card.working ? <WorkingSpark /> : null;
}

/** A live activity's progress track, clock, tokens and percent after its label (compaction). */
function ActivityTrailing({ activity }: { activity: Record<string, unknown> | null }) {
  const styles = useStyles();
  if (activity === null) return null;
  const percent = num(activity, 'percent');
  const indeterminate = isTrue(activity, 'indeterminate');
  const elapsed = str(activity, 'elapsedLabel');
  const tokens = str(activity, 'tokens');
  return (
    <>
      {percent !== null || indeterminate ? (
        <View style={styles.track}>
          <ProgressTrack percent={percent} />
        </View>
      ) : null}
      {elapsed.length > 0 ? <Text style={styles.numbers}>{elapsed}</Text> : null}
      {tokens.length > 0 ? <Text style={styles.numbers}>{tokens}</Text> : null}
      {percent !== null ? <Text style={styles.numbers}>{`${percent}%`}</Text> : null}
    </>
  );
}

const useStyles = themedStyles((P) => ({
  /** Its own row above the cards and the composer, in the rows' column. */
  row: {
    width: '100%',
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: ROW_MAX_WIDTH,
    paddingHorizontal: 12,
  },
  /** Scroll-to-bottom alone over the transcript's bottom edge, at the card's right end. */
  lone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: END_PADDING,
    alignItems: 'center',
  },
  loneColumn: {
    width: '100%',
    maxWidth: ROW_MAX_WIDTH,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12 + 10,
  },
  card: {
    minHeight: LINE_HEIGHT + HEADER_PAD_Y * 2,
    paddingHorizontal: 12,
    paddingVertical: HEADER_PAD_Y,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
    borderWidth: 1,
    borderColor: P.inputBorder,
    // A capsule (desktop working_card.rs).
    borderRadius: 999,
    overflow: 'hidden',
    // The composer's own fill, so the card and the chat box under it always match.
    backgroundColor: P.composerBackground,
  },
  /** The whole label while the card is held, above the card, so the card keeps its height. */
  bubble: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: '100%',
    marginBottom: -2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
  },
  bubbleText: {
    color: P.foreground,
    fontSize: 13,
    lineHeight: 19.5,
  },
  sparkBox: {
    width: VISUAL.sparkBox,
    height: VISUAL.sparkBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
  },
  label: {
    flexShrink: 1,
    color: P.muted,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
  labelStrong: {
    flexShrink: 1,
    color: P.foreground,
    fontSize: 13,
    lineHeight: 19.5,
  },
  dim: {
    color: P.muted,
  },
  numbers: {
    flexShrink: 0,
    color: P.muted,
    fontSize: VISUAL.fontSize,
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: 48,
    flexShrink: 0,
  },
}));
