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
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ChatDocument, ChatPill } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Sheet } from '../composer/Sheet';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { QUESTION_TAGS } from '../transcript/OpenQuestions';
import { AgentFleetMenu, AgentTasksMenu, CoordinatorThreadsMenu } from './AgentPanels';
import { Glyph } from './icons';
import { obj } from './json';
import { BackgroundTasksMenu } from './WorkingStrip';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** The amber of a thread waiting on the user's approval (`AgentPanels.tsx`). */
const ATTENTION_COLOR = '#f5a524';

const NO_PILLS: readonly ChatPill[] = [];

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
  if (pills.length === 0 && question === null && !showJump) return null;
  // The amber outline an open Q-tag has (CDXC:SessionChat 2026-10-15 on gx-chat-core's `TagState`).
  const questionTone = (P.light ? QUESTION_TAGS.tone.light : QUESTION_TAGS.tone.dark).open;
  const close = () => {
    // The Threads list goes back to its first step, as folding the panel did (desktop `pill_menu_closed`).
    if (open === 'threads') chat.dispatch({ type: 'toggleCoordinatorThreadsMore', step: 0 });
    setOpen(null);
  };
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Chat panels"
        style={styles.scroller}
        contentContainerStyle={styles.row}
      >
        {showJump ? (
          <IconPill glyph="arrow-down" accessibilityLabel="Scroll to bottom" color={P.primary} onPress={() => jumpToBottom?.()} />
        ) : null}
        {question !== null ? (
          <IconPill
            glyph="question-mark"
            accessibilityLabel={question.accessibilityLabel}
            color={questionTone.text}
            style={{ backgroundColor: 'transparent', borderColor: questionTone.border }}
            onPress={() => chat.dispatch({ type: 'previousQuestion' })}
          />
        ) : null}
        {pills.map((pill) => (
          <Pill key={pill.id} pill={pill} open={pill.id === open} onPress={() => setOpen(pill.id)} />
        ))}
      </ScrollView>
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
}: {
  glyph: 'question-mark' | 'arrow-down';
  accessibilityLabel: string;
  color: string;
  style?: { backgroundColor: string; borderColor: string };
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, styles.iconPill, style, pressed && styles.pillPressed]}
    >
      <Glyph name={glyph} size={14} color={color} />
    </Pressable>
  );
}

/** One pill in the Worked row's chip look (`TranscriptItemRow.tsx` `chip`): icon, label, count. */
function Pill({ pill, open, onPress }: { pill: ChatPill; open: boolean; onPress: () => void }) {
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
      <Glyph name={pill.id === 'tasks' ? 'list-check' : pill.id === 'background' ? 'terminal-2' : 'users'} size={12} color={P.cardMuted} />
      <Text style={styles.label}>{pill.label}</Text>
      {pill.count.length > 0 ? <Text style={styles.count}>{pill.count}</Text> : null}
      {pill.attention ? <View style={styles.attention} /> : null}
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
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
  /** Square-ish around its glyph, the row's height (the label pills' 16pt line plus 2pt above and below). */
  iconPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
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
  attention: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ATTENTION_COLOR,
  },
}));
