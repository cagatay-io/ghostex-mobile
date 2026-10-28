/**
 * The working card (`workingCard`, decided in packages/gx-chat-core/src/extras/working_card.rs). Port
 * of desktop `working_card.rs`: one line with the spark, the label and the pills, in its own row right
 * above the cards and the composer, so the transcript's visible area ends above it and nothing scrolls
 * under it. It never opens; while the scroll-to-bottom pill shows, a tap anywhere on the card
 * scrolls to the bottom (otherwise a tap does nothing); each pill opens its own sheet
 * (`ChatPills.tsx`). The inverted transcript already keeps a short conversation at its bottom, right
 * above this row.
 *
 * One line while the label and the pills fit, else two: the label's line on top, the pills under
 * it (gx-chat-core `extras/working_card_rows.rs` decides, with hysteresis, from what this measures;
 * `useCardRows`). A label longer than the whole card is cut with an ellipsis; pressing and holding
 * the card shows the whole label in a bubble above it, as hovering does on the desktop. The armed Delayed Send / Close After Done timers come
 * from the app shell, not the document (desktop's `armed_actions`); a tap opens Delayed Actions.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { ChatDocument, WorkingCard as WorkingCardValue } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import type { GhostexSessionLinks } from '../../../contract/mobileSummary';
import { sessionLinksChatPill } from '../sessionLinks';
import { HorizontalFade } from '../transcript/verticalFade';
import { IconPill, LinksPill, Pill, PillMenuSheet, QuestionPill } from './ChatPills';
import { Glyph } from './icons';
import { isTrue, num, obj, str } from './json';
import { chatCardsShown, COMPOSER_TOP_PADDING, STACK_GAP } from './NativeChatCards';
import { PulseDot, Spinner } from './primitives';
import { ProgressTrack, VISUAL, WorkingSpark, type ArmedAction } from './WorkingStrip';

/** The transcript rows' column (`Transcript.tsx` `ROW_MAX_WIDTH`). */
const ROW_MAX_WIDTH = 768;
/** How far the lone scroll-to-bottom pill sits above the transcript's bottom edge (desktop `transcript_layout.rs`). */
const END_PADDING = 16;
const HEADER_PAD_Y = 6;

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
 * User: "i want clicking anywhere on the bar that's above the composer to scroll to the bottom (when the scroll to bottom button is shown) so i dont need to click specifically on that button". The card's own press scrolls to the bottom while the pill shows; the pills and timers on it keep their taps. Desktop: `render_working_card` in apps/desktop/src/app/native_chat/working_card.rs.
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

/** Whether the card shows: the core has something for it, or a timer is armed. */
function cardShown(document: ChatDocument, armed: readonly ArmedAction[]): boolean {
  return document.workingCard?.visible === true || armed.length > 0;
}

/** The session's links and the Links pill's tap, from the screen that knows the session (`TerminalScreen`). */
export type WorkingCardLinks = { links: GhostexSessionLinks | undefined; onOpen: () => void };

/** The decision gx-chat-core's `workingCardRows` hands back (`extras/working_card_rows.rs`). */
type RowsMemo = { rows: number; sinceMs: number; recheckAtMs: number | null };

/** `working_card_rows::ANIMATION_MS`: the card grows into two rows or shrinks back this fast. */
const ROWS_ANIMATION_MS = 200;
/** The label's own row above the divider with two rows, and the room above and below it and above
 * and below the pills under it (desktop `TOP_ROW_HEIGHT`, `TOP_ROW_PAD`, `PILLS_ROW_PAD`). */
const TOP_ROW = 22;
const ROW_PAD = 7;
/** The top row, its padding and the divider: what grows in when the card takes two rows. */
const LANE = TOP_ROW + ROW_PAD * 2 + 1;
/** How far the label rises into its row while the card grows (desktop `LABEL_RISE`). */
const LABEL_RISE = 6;
/** The card's side paddings: the label 12 in from the left, the pills 10 in from the right. */
const PAD_LEFT = 12;
const PAD_RIGHT = 10;
/** The width of the fade at a scrolling pill row's edge (desktop `PILLS_FADE`). */
const PILLS_FADE = 24;

/** The Links pill goes before the first of these, after Resources and Workers (desktop `links_pill_index`). */
const AFTER_LINKS: ReadonlySet<string> = new Set(['tasks', 'subagents', 'background']);

export function WorkingCard({
  chat,
  document,
  armed,
  onArmedPress,
  links,
}: {
  chat: RustChat;
  document: ChatDocument;
  armed: readonly ArmedAction[];
  /** Opens Delayed Actions; without it the timers are drawn but not pressable. */
  onArmedPress?: () => void;
  /** The session's links for the Links pill (none with no links and no suggestions). */
  links?: WorkingCardLinks | null;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  const [held, setHeld] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const card = document.workingCard;
  const rows = useCardRows(chat, card ?? null);
  if (!cardShown(document, armed) || card === undefined) return null;
  const showJump = awayFromBottom && jumpToBottom !== null;
  const questions = document.openQuestions;
  // The ? pill shows only while a question form or page is unanswered and not put off For later
  // (`count`); a tap goes to the previous one (`previousQuestion`). The rest are in the Resources
  // pill's list (`chatPills`).
  const question = questions !== undefined && questions !== null && questions.count > 0 ? questions : null;
  const pills = card.pills
    .map((id) => (document.chatPills ?? []).find((pill) => pill.id === id))
    .filter((pill) => pill !== undefined);
  const linksPill = links ? sessionLinksChatPill(links.links, P.cardMuted) : null;
  const linksAt = pills.findIndex((pill) => AFTER_LINKS.has(pill.id));
  const panelPills = pills.map((pill) => (
    <Pill key={pill.id} pill={pill} open={pill.id === menu} onPress={() => setMenu(pill.id)} />
  ));
  if (links && linksPill !== null) {
    panelPills.splice(
      linksAt === -1 ? panelPills.length : linksAt,
      0,
      <LinksPill key="links" pill={linksPill} onPress={links.onOpen} />,
    );
  }
  const label = card.label;
  const labelText =
    label !== null ? (
      <Text
        style={card.labelKind === 'tool' || card.labelKind === 'activity' ? styles.labelStrong : styles.label}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    ) : null;
  const labelSlot = (
    <View style={styles.labelSlot}>
      {labelText}
      {card.labelKind === 'activity' ? (
        <View style={styles.trailing} onLayout={(event) => rows.measure('trailing', event.nativeEvent.layout.width)}>
          <ActivityTrailing activity={obj(card.activity)} />
        </View>
      ) : null}
    </View>
  );
  const pillRow = (
    <View style={styles.pills} onLayout={(event) => rows.measure('pills', event.nativeEvent.layout.width)}>
      {/* Right to left from the card's edge: panel pills, question, timers, then scroll-to-bottom
          leftmost, so one appearing moves none of the others. */}
      {showJump ? (
        <IconPill glyph="arrow-down" accessibilityLabel="Scroll to bottom" color={P.primary} onPress={() => jumpToBottom?.()} />
      ) : null}
      {armed.map((action) => (
        <Pressable
          key={action.id}
          disabled={onArmedPress === undefined}
          onPress={onArmedPress}
          accessibilityRole="button"
          accessibilityLabel={`${action.label}. Manage delayed actions`}
          hitSlop={6}
          style={({ pressed }) => [styles.armed, pressed ? styles.armedPressed : null]}
        >
          <ComposerGlyph
            name="clock"
            size={VISUAL.sparkSize}
            color={action.id === 'delayedSend' ? VISUAL.delayedSendColor : VISUAL.closeAfterDoneColor}
          />
          <Text style={styles.armedLabel} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
      {question !== null ? (
        <QuestionPill
          count={question.count}
          newest={question.newest ?? null}
          accessibilityLabel={question.accessibilityLabel}
          onPress={() => chat.dispatch({ type: 'previousQuestion' })}
        />
      ) : null}
      {panelPills}
    </View>
  );
  const twoRows = label !== null && rows.layoutTwo;
  // Option C's top row (gx-chat-core `extras/working_card_label.rs` has the user's words): the
  // label with its paths' folders dimmed and shortened, then how long the action has run.
  const parts = card.labelParts ?? [];
  const topLabel =
    label !== null && parts.length > 0 ? (
      <Text style={styles.labelStrong} numberOfLines={1} ellipsizeMode="tail">
        {parts.map((part, index) => (
          <Text key={index} style={part.dim === true ? styles.dim : null}>
            {part.text}
          </Text>
        ))}
      </Text>
    ) : (
      labelText
    );
  const elapsed = card.elapsed ?? null;
  return (
    <View style={styles.row}>
      <View style={[styles.column, { paddingBottom: cardGap(document) }]}>
        <Pressable
          disabled={label === null && !showJump}
          onPress={showJump ? () => jumpToBottom?.() : undefined}
          onLongPress={label !== null ? () => setHeld(true) : undefined}
          onPressOut={() => setHeld(false)}
          onLayout={(event) => rows.measure('card', event.nativeEvent.layout.width)}
          accessibilityRole="summary"
          accessibilityLabel={card.ariaLabel}
          style={[styles.card, twoRows ? styles.cardTwo : null]}
        >
          {twoRows ? (
            // The lead, the label and its time on their own row over a hairline; they grow in (or
            // shrink away) while the pills keep their place at the bottom.
            <Animated.View
              style={[
                styles.lane,
                {
                  height: rows.grow.interpolate({ inputRange: [0, 1], outputRange: [0, LANE] }),
                  opacity: rows.grow,
                  transform: [{ translateY: rows.grow.interpolate({ inputRange: [0, 1], outputRange: [LABEL_RISE, 0] }) }],
                },
              ]}
            >
              <View style={styles.topRow}>
                <Lead card={card} />
                <View style={styles.labelSlot}>
                  {topLabel}
                  {card.labelKind === 'activity' ? (
                    <View style={styles.trailing}>
                      <ActivityTrailing activity={obj(card.activity)} />
                    </View>
                  ) : null}
                </View>
                {elapsed !== null ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
              </View>
              <View style={styles.divider} />
            </Animated.View>
          ) : null}
          <View style={[styles.line, twoRows ? styles.lineTwo : null]}>
            {twoRows ? null : <Lead card={card} />}
            {twoRows || label === null ? null : (
              <Animated.View style={[styles.labelLine, { opacity: rows.labelIn }]}>{labelSlot}</Animated.View>
            )}
            <PillsArea fill={twoRows || label === null} fromLeft={twoRows}>
              {pillRow}
            </PillsArea>
          </View>
        </Pressable>
        {label !== null ? (
          // The label at its natural width on one line, uncut, for the row rule.
          <View pointerEvents="none" style={styles.measure}>
            <Text
              style={card.labelKind === 'tool' || card.labelKind === 'activity' ? styles.labelStrong : styles.label}
              numberOfLines={1}
              onLayout={(event) => rows.measure('label', event.nativeEvent.layout.width)}
            >
              {label}
            </Text>
          </View>
        ) : null}
        {held && label !== null ? (
          <View pointerEvents="none" style={styles.bubble}>
            <Text style={styles.bubbleText}>{label}</Text>
          </View>
        ) : null}
      </View>
      <PillMenuSheet chat={chat} document={document} open={menu} onClose={closeMenu} />
    </View>
  );
}

/**
 * One row or two for the card: measures its parts, asks gx-chat-core's `workingCardRows` (the rule
 * and its hysteresis, CDXC:SessionChat 2026-10-28 in `extras/working_card_rows.rs`) and animates the
 * change. A core too old to know the query answers null, which leaves the card on one row.
 */
function useCardRows(chat: RustChat, card: WorkingCardValue | null) {
  const reduceMotion = useReducedMotion();
  const widths = useRef({ card: 0, label: 0, trailing: 0, pills: 0 });
  const memo = useRef<RowsMemo | null>(null);
  const asked = useRef(0);
  const [two, setTwo] = useState(false);
  const [layoutTwo, setLayoutTwo] = useState(false);
  const grow = useRef(new Animated.Value(0)).current;
  const labelIn = useRef(new Animated.Value(1)).current;
  const [tick, setTick] = useState(0);
  const label = card?.label ?? null;
  const kind = card?.labelKind ?? null;
  const working = card?.working === true;
  const phase = card?.phase ?? 'idle';
  if (label === null) widths.current.label = 0;
  if (kind !== 'activity') widths.current.trailing = 0;
  const decide = useCallback(() => {
    const w = widths.current;
    const hasLead = kind === 'activity' || kind === 'worked' || (kind !== null && working);
    const input = {
      width: w.card - 2 - PAD_LEFT - PAD_RIGHT,
      lead: hasLead ? VISUAL.sparkBox + VISUAL.gap : 0,
      label: w.label > 0 && w.trailing > 0 ? w.label + VISUAL.gap + w.trailing : w.label,
      pills: w.pills,
      gap: VISUAL.gap,
      phase,
      nowMs: Date.now(),
    };
    const ask = ++asked.current;
    void chat.queryAsync('workingCardRows', [memo.current, input]).then((answer) => {
      if (ask !== asked.current) return;
      const next = answer !== null && typeof answer === 'object' ? (answer as RowsMemo) : null;
      memo.current = next;
      setTwo(next?.rows === 2);
    });
  }, [chat, kind, working, phase]);
  // Ask again whenever the label, the phase or the hold's end (`recheckAtMs`) may change the answer.
  useEffect(() => decide(), [decide, label, tick]);
  useEffect(() => {
    const at = memo.current?.recheckAtMs;
    if (at === null || at === undefined) return undefined;
    const wait = setTimeout(() => setTick((n) => n + 1), Math.max(0, at - Date.now()));
    return () => clearTimeout(wait);
  });
  useEffect(() => {
    if (reduceMotion) {
      grow.setValue(two ? 1 : 0);
      labelIn.setValue(1);
      setLayoutTwo(two);
      return undefined;
    }
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration: ROWS_ANIMATION_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    if (two) {
      setLayoutTwo(true);
      const run = timing(grow, 1);
      run.start();
      return () => run.stop();
    }
    // Shrink the top row away, then put the label back on the pills' line and fade it in.
    const run = timing(grow, 0);
    run.start(({ finished }) => {
      if (!finished) return;
      setLayoutTwo(false);
      labelIn.setValue(0);
      timing(labelIn, 1).start();
    });
    return () => run.stop();
  }, [two, reduceMotion, grow, labelIn]);
  const measure = useCallback(
    (part: 'card' | 'label' | 'trailing' | 'pills', width: number) => {
      // Sub-pixel jitter from a re-layout is not a change.
      if (Math.abs(widths.current[part] - width) < 0.5) return;
      widths.current[part] = width;
      decide();
    },
    [decide],
  );
  return { layoutTwo, grow, labelIn, measure };
}

/**
 * The pills' area. With room of its own (`fill`: no label beside it, or the bottom of two rows) it
 * takes the line's width, keeps the pills at its right end while they fit and scrolls sideways when
 * they don't; beside a label on one line it takes the pills' own width. An edge that hides more pills
 * fades them into the card's fill; the card's rounded edge stays whole.
 *
 * CDXC:SessionChat 2026-10-28 SEE-ALSO:
 * The user's words (no cut background, no inner shadow) are on desktop `working_card_pills_area` in
 * apps/desktop/src/app/native_chat/working_card.rs.
 */
function PillsArea({ fill, fromLeft, children }: { fill: boolean; fromLeft: boolean; children: ReactNode }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [edges, setEdges] = useState({ left: false, right: false });
  const metrics = useRef({ x: 0, width: 0, content: 0 });
  const update = () => {
    const { x, width, content } = metrics.current;
    const next = { left: x > 0.5, right: content - width - x > 0.5 };
    setEdges((was) => (was.left === next.left && was.right === next.right ? was : next));
  };
  return (
    <View style={fill ? styles.pillsFill : styles.pillsFit}>
      <ScrollView
        horizontal
        style={fill ? styles.pillsScrollFill : styles.pillsScroll}
        contentContainerStyle={fill ? (fromLeft ? styles.pillsContentLeft : styles.pillsContentFill) : null}
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          metrics.current.x = event.nativeEvent.contentOffset.x;
          update();
        }}
        onLayout={(event) => {
          metrics.current.width = event.nativeEvent.layout.width;
          update();
        }}
        onContentSizeChange={(width) => {
          metrics.current.content = width;
          update();
        }}
      >
        {children}
      </ScrollView>
      {edges.left ? (
        <HorizontalFade id="pills-fade-left" color={P.composerBackground} from={1} to={0} style={[styles.fade, styles.fadeLeft]} />
      ) : null}
      {edges.right ? (
        <HorizontalFade id="pills-fade-right" color={P.composerBackground} from={0} to={1} style={[styles.fade, styles.fadeRight]} />
      ) : null}
    </View>
  );
}

/**
 * Scroll-to-bottom on its own over the transcript's bottom edge, while the reader is away from the
 * bottom and no card shows to carry it (desktop `render_lone_scroll_bottom`).
 */
export function LoneScrollBottom({ document, armed }: { document: ChatDocument; armed: readonly ArmedAction[] }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  if (cardShown(document, armed) || !awayFromBottom || jumpToBottom === null) return null;
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
    minHeight: VISUAL.minHeight + HEADER_PAD_Y * 2,
    // The pills scroll inside these paddings, so the rounded edge is never cut by a pill; an edge
    // that hides pills fades them out (`PillsArea`).
    paddingLeft: PAD_LEFT,
    paddingRight: PAD_RIGHT,
    paddingTop: HEADER_PAD_Y,
    paddingBottom: HEADER_PAD_Y,
    flexDirection: 'column',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.inputBorder,
    // A capsule, like the pills it carries (desktop working_card.rs); with two rows its corners
    // keep the one-row capsule's radius.
    borderRadius: VISUAL.minHeight / 2 + HEADER_PAD_Y + 1,
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
  /** The pills' line: the bottom row with two rows, the whole card with one. */
  line: {
    minHeight: VISUAL.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
  },
  /** Two rows: the rows bring their own padding above and below. */
  cardTwo: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  /** The top row and the divider under it, which grow in together. */
  lane: {
    overflow: 'hidden',
  },
  topRow: {
    height: TOP_ROW + ROW_PAD * 2,
    paddingVertical: ROW_PAD,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
  },
  /** The hairline between the rows, the card's border colour, across the card. */
  divider: {
    height: 1,
    marginLeft: -(PAD_LEFT - 2),
    marginRight: -(PAD_RIGHT - 2),
    backgroundColor: P.inputBorder,
  },
  /** The pills' row under the divider: the same room above and below. */
  lineTwo: {
    minHeight: TOP_ROW + ROW_PAD * 2,
    paddingVertical: ROW_PAD,
  },
  dim: {
    color: P.muted,
  },
  /** The action's elapsed time at the top row's right end. */
  elapsed: {
    flexShrink: 0,
    color: P.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  labelLine: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
    flexShrink: 0,
  },
  /** Off-screen, unbounded: the label laid out at its natural width for the row rule. */
  measure: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 4000,
    flexDirection: 'row',
    alignItems: 'flex-start',
    opacity: 0,
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
  /**
   * The pills' scroll row. A horizontal ScrollView grows by default; here it takes only its content's
   * width (so the label keeps the rest while everything fits) and shrinks, then scrolls, when the
   * pills outgrow the card.
   */
  pillsScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  pillsFit: {
    flexShrink: 1,
    minWidth: 0,
  },
  /** With room of its own the area takes the line and keeps the pills at its right end. */
  pillsFill: {
    flex: 1,
    minWidth: 0,
  },
  pillsScrollFill: {
    flexGrow: 1,
  },
  pillsContentFill: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  /** Under the divider the pills start at the left, under the label. */
  pillsContentLeft: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PILLS_FADE,
  },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  armed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.armedIconGap,
  },
  armedPressed: {
    opacity: 0.8,
  },
  armedLabel: {
    color: P.foreground,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
}));
