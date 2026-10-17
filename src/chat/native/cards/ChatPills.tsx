/**
 * The working row's pills and the sheet each one opens. Port of desktop `chat_pills.rs`. Always
 * leftmost, two icon pills: "Scroll to bottom" (a down arrow, while the reader is away from the
 * bottom, published by the transcript in `bottomStore.ts`), then "Previous question" (a ?, while the
 * chat has unanswered questions, from the core's `openQuestions`). The row is right-aligned, so a pill
 * appearing at its left end moves nothing else. Then Threads, Tasks, Subagents and Background, whose
 * labels, counts and order come from the core (`chatPills`,
 * packages/gx-chat-core/src/extras/chat_pills.rs, where the user's decision lives).
 * The phone always puts the pills on their own line under the working word, right-aligned and
 * scrolling sideways when they do not fit. A pill opens the chat's bottom sheet (`Sheet`, the phone
 * form of desktop's floating menus) over the transcript; a tap outside it or Back closes it.
 *
 * CDXC:SessionChat 2026-10-17 DECISION:
 * User picked the attention dot ping (Q236 G) and "Once on arrival, then every 30 s" (Q237) for the
 * "Previous question" pill: it keeps the Threads pill's neutral look plus its amber attention dot,
 * which sends out one ping (under a second) when a question arrives and every 30 s while any is
 * unanswered; a new question restarts the 30 s and the pings stop once nothing waits. With the
 * phone's reduce-motion setting on, the dot stays and never pings. Desktop: `question_ping.rs`, with
 * the timings of `questionPing` in packages/gx-chat-core/visual/scroll-bottom.json.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View, type LayoutRectangle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { ChatDocument, ChatPill } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Sheet } from '../composer/Sheet';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { AgentFleetMenu, AgentTasksMenu, CoordinatorThreadsMenu } from './AgentPanels';
import { Glyph } from './icons';
import { obj } from './json';
import { BackgroundTasksMenu } from './WorkingStrip';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** The amber of a thread waiting on the user's approval (`AgentPanels.tsx`). */
const ATTENTION_COLOR = '#f5a524';

const NO_PILLS: readonly ChatPill[] = [];

/** `questionPing` in packages/gx-chat-core/visual/scroll-bottom.json (desktop `question_ping.rs`). */
const QUESTION_PING = { durationMs: 800, everyMs: 30000, dotSize: 6, scale: 2.8, alpha: 0.8 };
/** The dot's corner offsets inside the ? pill's edge, which keep it inside the scroller's clip. */
const DOT_TOP = 1;
const DOT_RIGHT = 2;
const PILL_BORDER = 1;

export function ChatPillsRow({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const pills = document.chatPills ?? NO_PILLS;
  const [open, setOpen] = useState<string | null>(null);
  const shown = pills.find((pill) => pill.id === open);
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  // A panel that went away (the subagents finished) takes its sheet with it.
  useEffect(() => {
    if (open !== null && shown === undefined) setOpen(null);
  }, [open, shown]);
  const questions = document.openQuestions;
  const question = questions !== undefined && questions !== null && questions.count > 0 ? questions : null;
  const showJump = awayFromBottom && jumpToBottom !== null;
  const ping = useQuestionPing(question?.count ?? 0, question?.newest ?? null);
  const [questionPill, setQuestionPill] = useState<LayoutRectangle | null>(null);
  const [scrollX, setScrollX] = useState(0);
  if (pills.length === 0 && question === null && !showJump) return null;
  const close = () => {
    // The Threads list goes back to its first step, as folding the panel did (desktop `pill_menu_closed`).
    if (open === 'threads') chat.dispatch({ type: 'toggleCoordinatorThreadsMore', step: 0 });
    setOpen(null);
  };
  return (
    <>
      <View style={styles.scrollerHost}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel='Chat panels'
          style={styles.scroller}
          contentContainerStyle={styles.row}
          onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          {showJump ? (
            <IconPill
              glyph='arrow-down'
              accessibilityLabel='Scroll to bottom'
              color={P.primary}
              onPress={() => jumpToBottom?.()}
            />
          ) : null}
          {question !== null ? (
            <IconPill
              glyph='question-mark'
              accessibilityLabel={question.accessibilityLabel}
              color={P.cardMuted}
              onPress={() => chat.dispatch({ type: 'previousQuestion' })}
              onLayout={setQuestionPill}
            >
              <View pointerEvents='none' style={styles.questionDot} />
            </IconPill>
          ) : null}
          {pills.map((pill) => (
            <Pill key={pill.id} pill={pill} open={pill.id === open} onPress={() => setOpen(pill.id)} />
          ))}
        </ScrollView>
        {question !== null && questionPill !== null ? (
          <PingRing progress={ping} pill={questionPill} scrollX={scrollX} />
        ) : null}
      </View>
      <Sheet visible={shown !== undefined} onClose={close} title={shown?.label ?? ''}>
        {open === 'threads' ? (
          <CoordinatorThreadsMenu chat={chat} document={document} onDone={close} />
        ) : open === 'tasks' ? (
          <AgentTasksMenu chat={chat} document={document} />
        ) : open === 'subagents' ? (
          <AgentFleetMenu chat={chat} document={document} onDone={close} />
        ) : open === 'background' && obj(document.backgroundTasksPanel) !== null ? (
          <BackgroundTasksMenu tasks={obj(document.backgroundTasksPanel)!} />
        ) : null}
      </Sheet>
    </>
  );
}

/** An icon-only pill (Previous question, Scroll to bottom): the chip's shape around one glyph. */
function IconPill({
  glyph,
  accessibilityLabel,
  color,
  style,
  onPress,
  onLayout,
  children,
}: {
  glyph: 'question-mark' | 'arrow-down';
  accessibilityLabel: string;
  color: string;
  style?: { backgroundColor: string; borderColor: string };
  onPress: () => void;
  onLayout?: (layout: LayoutRectangle) => void;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLayout={onLayout === undefined ? undefined : (event) => onLayout(event.nativeEvent.layout)}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, styles.iconPill, style, pressed && styles.pillPressed]}
    >
      <Glyph name={glyph} size={14} color={color} />
      {children}
    </Pressable>
  );
}

/**
 * The question pill's ping: 0 at rest, running to 1 once on arrival and every 30 s while questions
 * wait. A new question (the newest id changing without the count dropping) restarts the beat; the
 * beats stop when nothing waits; with reduce motion on it never runs, so only the dot shows.
 */
function useQuestionPing(count: number, newest: string | null): Animated.Value {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const seen = useRef<{ count: number; newest: string | null }>({ count: 0, newest: null });
  const [arrival, setArrival] = useState(0);
  useEffect(() => {
    const before = seen.current;
    seen.current = { count, newest };
    if (newest !== null && newest !== before.newest && count >= before.count) setArrival((n) => n + 1);
  }, [count, newest]);
  const waiting = count > 0;
  useEffect(() => {
    if (!waiting || reduceMotion || arrival === 0) return undefined;
    const play = () => {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: QUESTION_PING.durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => progress.setValue(0));
    };
    play();
    const beat = setInterval(play, QUESTION_PING.everyMs);
    return () => {
      clearInterval(beat);
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [arrival, waiting, reduceMotion, progress]);
  return progress;
}

/**
 * The ring spreading out of the ? pill's dot. The pills' ScrollView clips everything outside its
 * own box (the pills' height), so the ring is its sibling over it, placed from the pill's layout and
 * the row's scroll, and takes no touches (desktop draws it deferred for the same reason).
 */
function PingRing({ progress, pill, scrollX }: { progress: Animated.Value; pill: LayoutRectangle; scrollX: number }) {
  const { dotSize, scale, alpha } = QUESTION_PING;
  const size = dotSize * scale;
  const centerX = pill.x - scrollX + pill.width - PILL_BORDER - DOT_RIGHT - dotSize / 2;
  const centerY = pill.y + PILL_BORDER + DOT_TOP + dotSize / 2;
  return (
    <Animated.View
      pointerEvents='none'
      style={{
        position: 'absolute',
        left: centerX - size / 2,
        top: centerY - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ATTENTION_COLOR,
        opacity: progress.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, alpha, 0] }),
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1 / scale, 1],
              easing: Easing.out(Easing.cubic),
            }),
          },
        ],
      }}
    />
  );
}

/** One pill in the Worked row's chip look (`TranscriptItemRow.tsx` `chip`): icon, label, count. */
function Pill({ pill, open, onPress }: { pill: ChatPill; open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={pill.ariaLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, (pressed || open) && styles.pillPressed]}
    >
      <Glyph
        name={pill.id === 'tasks' ? 'list-check' : pill.id === 'background' ? 'terminal-2' : 'users'}
        size={12}
        color={P.cardMuted}
      />
      <Text style={styles.label}>{pill.label}</Text>
      {pill.count.length > 0 ? <Text style={styles.count}>{pill.count}</Text> : null}
      {pill.attention ? <View style={styles.attention} /> : null}
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
  /** Holds the scroller and the ping ring drawn over it, outside its clip. */
  scrollerHost: {
    width: '100%',
  },
  scroller: {
    flexGrow: 0,
    width: '100%',
  },
  /** Right-aligned while the pills fit; once they overflow the row starts at the first one and scrolls. */
  row: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  /**
   * Square-ish around its glyph, the label pills' height: their 16pt line plus 2pt above and below,
   * so the 14pt glyph takes 3pt. The ? pill is neutral like Threads (user, 2026-10-15: "same height as
   * the threads and scroll to bottom pills (and same color)", desktop `chat_pills.rs`).
   */
  iconPill: {
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  pillPressed: {
    backgroundColor: P.ink(0.08),
  },
  label: {
    color: P.cardMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  count: {
    color: P.foreground,
    fontSize: 11.5,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  /** The ? pill's amber attention dot, inside its edge in the top right corner. */
  questionDot: {
    position: 'absolute',
    top: DOT_TOP,
    right: DOT_RIGHT,
    width: QUESTION_PING.dotSize,
    height: QUESTION_PING.dotSize,
    borderRadius: QUESTION_PING.dotSize / 2,
    backgroundColor: ATTENTION_COLOR,
  },
  attention: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ATTENTION_COLOR,
  },
}));
