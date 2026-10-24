/**
 * The pills on the working card (`WorkingCard.tsx`) and the sheet each one opens. Port of desktop
 * `chat_pills.rs`. Always leftmost, two icon pills: "Scroll to bottom" (a down arrow, while the
 * reader is away from the bottom, published by the transcript in `bottomStore.ts`), then "Previous
 * question" (a ?, while the chat has unanswered questions, from the core's `openQuestions`). Then
 * Threads, Tasks, Subagents and Background, whose labels, counts and order come from the core
 * (`chatPills`, packages/gx-chat-core/src/extras/chat_pills.rs, where the user's decision lives). A
 * pill opens the chat's bottom sheet (`Sheet`, the phone form of desktop's floating menus) with that
 * panel's rows; a tap outside it or Back closes it.
 *
 * CDXC:SessionChat 2026-10-17 DECISION:
 * User picked the attention dot ping (Q236 G) and "Once on arrival, then every 30 s" (Q237) for the
 * "Previous question" pill: it keeps the Threads pill's neutral look plus its amber attention dot,
 * which sends out one ping (under a second) when a question arrives and every 30 s while any is
 * unanswered; a new question restarts the 30 s and the pings stop once nothing waits. With the
 * phone's reduce-motion setting on, the dot stays and never pings. Desktop: `question_ping.rs`, with
 * the timings of `questionPing` in packages/gx-chat-core/visual/scroll-bottom.json.
 *
 * CDXC:SessionChat 2026-10-24 DECISION:
 * User: "for questions if there's 2 or more questions i want to go between showing ? and showing the
 * number pls (every x seconds)". With two or more unanswered questions the ? pill shows the ? for 2 s,
 * then the count for 2 s (`countSwapMs`), as a plain cut like the desktop, whose GPUI fade would
 * redraw the whole chat every frame; with one it stays a ?. One interval, cleared when fewer than two
 * wait, and the slot keeps the wider of the two so the row never moves. Desktop: `chat_pills.rs`.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { ChatDocument, ChatPill } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Sheet } from '../composer/Sheet';
import { AgentFleetMenu, AgentTasksMenu, CoordinatorThreadsMenu } from './AgentPanels';
import { Glyph } from './icons';
import { obj } from './json';
import { BackgroundTasksMenu } from './WorkingStrip';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** The amber of a thread waiting on the user's approval (`AgentPanels.tsx`). */
const ATTENTION_COLOR = '#f5a524';

/** The running corner dot's fade: the Subagents menu's 1.6 s beat (desktop `chat_pills.rs` `running_dot`). */
const RUNNING_PULSE_MS = 1600;

/** `questionPing` in packages/gx-chat-core/visual/scroll-bottom.json (desktop `question_ping.rs`). */
const QUESTION_PING = { durationMs: 800, everyMs: 30000, dotSize: 6, scale: 2.8, alpha: 0.8, countSwapMs: 2000 };
/** The corner dot's offsets inside a pill's edge (the ? pill's and a running pill's, desktop `corner_dot`). */
const DOT_TOP = 1;
const DOT_RIGHT = 2;

/** An icon-only pill (Previous question, Scroll to bottom): the chip's shape around one glyph. */
export function IconPill({
  glyph,
  accessibilityLabel,
  color,
  onPress,
  count,
  children,
}: {
  glyph: 'question-mark' | 'arrow-down';
  accessibilityLabel: string;
  color: string;
  onPress: () => void;
  /** Shown instead of the glyph (the ? pill's count); both stay laid out, so the pill keeps the wider. */
  count?: { text: string; shown: boolean };
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, styles.iconPill, pressed && styles.pillPressed]}
    >
      {count === undefined ? (
        <Glyph name={glyph} size={14} color={color} />
      ) : (
        <View style={styles.glyphSlot}>
          <Text style={[styles.slotCount, { color, opacity: count.shown ? 1 : 0 }]}>{count.text}</Text>
          <View style={[styles.slotGlyph, { opacity: count.shown ? 0 : 1 }]}>
            <Glyph name={glyph} size={14} color={color} />
          </View>
        </View>
      )}
      {children}
    </Pressable>
  );
}

/** "Previous question" with its amber dot, which pings now and then while questions wait. */
export function QuestionPill({
  count,
  newest,
  accessibilityLabel,
  onPress,
}: {
  count: number;
  newest: string | null;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const ping = useQuestionPing(count, newest);
  const showingCount = useCountSwap(count);
  return (
    <IconPill
      glyph="question-mark"
      accessibilityLabel={accessibilityLabel}
      color={P.cardMuted}
      onPress={onPress}
      count={{ text: String(count), shown: showingCount }}
    >
      <PingRing progress={ping} />
      <View pointerEvents="none" style={styles.cornerDot} />
    </IconPill>
  );
}

/** True while the ? pill shows its count: every other `countSwapMs` while two or more questions wait. */
function useCountSwap(count: number): boolean {
  const [shown, setShown] = useState(false);
  const swapping = count >= 2;
  useEffect(() => {
    if (!swapping) return undefined;
    const swap = setInterval(() => setShown((was) => !was), QUESTION_PING.countSwapMs);
    return () => {
      clearInterval(swap);
      setShown(false);
    };
  }, [swapping]);
  return shown;
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

/** The ring spreading out of the ? pill's dot; it takes no touches. */
function PingRing({ progress }: { progress: Animated.Value }) {
  const { dotSize, scale, alpha } = QUESTION_PING;
  const size = dotSize * scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: DOT_TOP + dotSize / 2 - size / 2,
        right: DOT_RIGHT + dotSize / 2 - size / 2,
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

/** One panel pill in the Worked row's chip look (`TranscriptItemRow.tsx` `chip`): icon, label, count. A tap opens its sheet. */
export function Pill({ pill, open, onPress }: { pill: ChatPill; open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pill.ariaLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, (pressed || open) && styles.pillPressed]}
    >
      {pill.running ? <RunningDot /> : null}
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

/**
 * A running pill's corner dot (`running`, gx-chat-core `extras/chat_pills.rs`, where the user's
 * decision lives): the ? pill's own dot (`cornerDot`), fading to 35% and back every 1.6 s, and still
 * with the phone's reduce-motion setting on.
 */
function RunningDot() {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const half = { duration: RUNNING_PULSE_MS / 2, easing: Easing.linear, useNativeDriver: true };
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { ...half, toValue: 0.35 }),
        Animated.timing(opacity, { ...half, toValue: 1 }),
      ]),
    );
    beat.start();
    return () => {
      beat.stop();
      opacity.setValue(1);
    };
  }, [reduceMotion, opacity]);
  return <Animated.View pointerEvents="none" style={[styles.cornerDot, { opacity }]} />;
}

/** The sheet a pill opens: that panel's rows, titled by the pill. `open` is the pill's id, or null. */
export function PillMenuSheet({
  chat,
  document,
  open,
  onClose,
}: {
  chat: RustChat;
  document: ChatDocument;
  open: string | null;
  onClose: () => void;
}) {
  const shown = (document.chatPills ?? []).find((pill) => pill.id === open);
  // A panel that went away (the subagents finished) takes its sheet with it.
  useEffect(() => {
    if (open !== null && shown === undefined) onClose();
  }, [open, shown, onClose]);
  const close = () => {
    // The Threads list goes back to its first step, as folding the panel did (desktop `pill_menu_closed`).
    if (open === 'threads') chat.dispatch({ type: 'toggleCoordinatorThreadsMore', step: 0 });
    onClose();
  };
  const background = obj(document.backgroundTasksPanel);
  return (
    <Sheet visible={shown !== undefined} onClose={close} title={shown?.label ?? ''}>
      {open === 'threads' ? (
        <CoordinatorThreadsMenu chat={chat} document={document} onDone={close} />
      ) : open === 'tasks' ? (
        <AgentTasksMenu chat={chat} document={document} />
      ) : open === 'subagents' ? (
        <AgentFleetMenu chat={chat} document={document} onDone={close} />
      ) : open === 'background' && background !== null ? (
        <BackgroundTasksMenu tasks={background} />
      ) : null}
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
  /** The ? pill's and a running pill's amber dot, inside the pill's edge in the top right corner. */
  cornerDot: {
    position: 'absolute',
    top: DOT_TOP,
    right: DOT_RIGHT,
    width: QUESTION_PING.dotSize,
    height: QUESTION_PING.dotSize,
    borderRadius: QUESTION_PING.dotSize / 2,
    backgroundColor: ATTENTION_COLOR,
  },
  /** The ? pill's glyph and count share this slot; the count sets its width once wider than the glyph. */
  glyphSlot: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCount: {
    minWidth: 14,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  slotGlyph: {
    position: 'absolute',
  },
  attention: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ATTENTION_COLOR,
  },
}));
