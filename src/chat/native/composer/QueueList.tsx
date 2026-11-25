/**
 * Ghostex's own prompt queue above the input (`queue.rs`, React's `session-chat-queue-rows.tsx`):
 * one line per prompt with its grip, preview, and Retry / Edit / Send now / Delete. A phone has no
 * hover, so the controls stay on screen (React's `@media (hover: none)` rule). Dragging the grip
 * moves a row (`moveQueue`, the drop desktop sends).
 */

import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument, QueuedPrompt } from '../../rust/document';
import { Glyph, type GlyphName } from './icons';
import { useDispatchWithAnswerCancel } from '../transcript/context';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { colorWithOpacity } from '../../../theme/palette';

const ROW_HEIGHT = 34;
const ROW_GAP = 4;

/**
 * A failed row's line, in the chat's one wording for a message that did not go out (core `composer/delivery_card.rs`
 * `plain_reason`): the reason without the instructions written into it, since the row's buttons say what to do.
 */
function notSent(reason: string | null | undefined): string {
  let text = (reason ?? '').trim();
  for (const lead of ['Not sent.', 'Not sent:', 'Not delivered:']) {
    if (text.startsWith(lead)) text = text.slice(lead.length).trimStart();
  }
  for (const tail of [' Retry, or open Terminal view to check it.', ' Open Terminal view to check it.', ' Send it again.']) {
    if (text.endsWith(tail)) text = text.slice(0, -tail.length).trimEnd();
  }
  return text.length > 0 ? `Not sent: ${text}` : 'Not sent.';
}

export function QueueList({
  document,
  dispatch: rawDispatch,
}: {
  document: ChatDocument;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const dispatch = useDispatchWithAnswerCancel(rawDispatch);
  // The row whose status chip or "+N lines" was tapped or held: its full sentence or message
  // shows under the list.
  const [shown, setShown] = useState<{ id: string; part: RowDetail } | null>(null);
  const prompts = document.queue.prompts.filter((prompt) => prompt.startupSend !== true);
  const capabilities = document.queue.capabilities;
  if (!capabilities.supported || prompts.length === 0) return null;
  const blocked = typeof document.sendBlockedReason === 'string';
  const canDrag = !blocked && prompts.length > 1 && capabilities.canReorder;
  // The sentence sits under the list rather than in the row, whose fixed height the drag math
  // counts on; the chip in the row says the short form (desktop: the chip's tooltip, queue.rs).
  const shownPrompt = shown === null ? undefined : prompts.find((prompt) => prompt.id === shown.id);
  const detail =
    shown === null || shownPrompt === undefined
      ? ''
      : shown.part === 'wait'
        ? waitReason(shownPrompt)
        : (shownPrompt.fullText ?? '');
  return (
    <View style={styles.list} accessibilityLabel="Queued prompts">
      {prompts.map((prompt, index) => (
        <QueueRow
          key={prompt.id}
          prompt={prompt}
          index={index}
          count={prompts.length}
          canDrag={canDrag}
          blocked={blocked}
          capabilities={capabilities}
          onCard={document.sendFailureCardPromptId === prompt.id}
          shownPart={shown?.id === prompt.id ? shown.part : null}
          onDetailPress={(part, hold) =>
            setShown((current) =>
              current?.id === prompt.id && current.part === part && !hold ? null : { id: prompt.id, part },
            )
          }
          onMove={(to) => {
            const target = prompts[to];
            if (target !== undefined && to !== index)
              dispatch({ type: 'moveQueue', promptId: prompt.id, targetId: target.id });
          }}
          dispatch={dispatch}
        />
      ))}
      {detail.length > 0 ? (
        <Text style={styles.waitReason} accessibilityRole="text">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** What a press on a row shows under the list: its status sentence or its whole message. */
type RowDetail = 'wait' | 'text';

/** Why gxserver still holds a waiting row, once it has waited about a minute; empty otherwise. */
function waitReason(prompt: QueuedPrompt): string {
  return prompt.state === 'failed' ? '' : (prompt.waitReason ?? '').trim();
}

function QueueRow({
  prompt,
  index,
  count,
  canDrag,
  blocked,
  capabilities,
  onCard,
  shownPart,
  onDetailPress,
  onMove,
  dispatch,
}: {
  prompt: QueuedPrompt;
  index: number;
  count: number;
  canDrag: boolean;
  blocked: boolean;
  capabilities: ChatDocument['queue']['capabilities'];
  /** The card that stands for this failed row is showing, with its own Retry. */
  onCard: boolean;
  /** Which of this row's details shows under the list, if any. */
  shownPart: RowDetail | null;
  /** A tap toggles a detail; a hold (`hold`) shows it. */
  onDetailPress: (part: RowDetail, hold: boolean) => void;
  onMove: (to: number) => void;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const busy = prompt.busy;
  const failed = prompt.state === 'failed';
  const locked = blocked || busy;
  const reason = waitReason(prompt);
  const label = (prompt.waitLabel ?? '').trim();
  const moreLines = prompt.moreLines ?? '';
  const fullText = prompt.fullText ?? '';
  const offset = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ index, count, onMove });
  latest.current = { index, count, onMove };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_, gesture) => offset.setValue(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        const { index: from, count: total, onMove: move } = latest.current;
        const to = Math.min(total - 1, Math.max(0, from + Math.round(gesture.dy / (ROW_HEIGHT + ROW_GAP))));
        offset.setValue(0);
        setDragging(false);
        move(to);
      },
      onPanResponderTerminate: () => {
        offset.setValue(0);
        setDragging(false);
      },
    }),
  ).current;

  const actions: { glyph: GlyphName; label: string; action: UserAction; show: boolean; disabled: boolean }[] = [
    {
      glyph: 'refresh',
      label: 'Retry',
      action: { type: 'retryQueue', promptId: prompt.id },
      show: capabilities.canRetry && failed && !onCard,
      disabled: blocked,
    },
    {
      glyph: 'pencil',
      label: 'Edit',
      action: { type: 'removeQueue', promptId: prompt.id, edit: true },
      show: capabilities.canEdit,
      disabled: locked,
    },
    {
      glyph: 'arrow-up',
      label: 'Send now',
      action: { type: 'sendQueue', promptId: prompt.id },
      show: capabilities.canSendNow,
      disabled: locked,
    },
    {
      glyph: 'trash',
      label: 'Delete',
      action: { type: 'removeQueue', promptId: prompt.id },
      show: capabilities.canRemove,
      disabled: locked,
    },
  ];

  return (
    <Animated.View
      style={[
        styles.row,
        failed ? styles.rowFailed : null,
        dragging ? styles.rowDragging : null,
        { transform: [{ translateY: offset }], zIndex: dragging ? 2 : 0 },
      ]}
    >
      {canDrag && !busy ? (
        <View
          {...responder.panHandlers}
          style={styles.grip}
          accessibilityRole="adjustable"
          accessibilityLabel="Reorder queued prompt"
        >
          <Glyph name="grip-vertical" size={15} color={P.muted} strokeWidth={1.8} />
        </View>
      ) : (
        <View style={[styles.grip, busy ? null : styles.gripInert]}>
          {busy ? (
            <ActivityIndicator size="small" color={P.muted} />
          ) : (
            <Glyph name="grip-vertical" size={15} color={P.muted} strokeWidth={1.8} />
          )}
        </View>
      )}
      <Text
        style={[styles.text, failed ? styles.textFailed : null, prompt.state === 'sending' ? styles.textSending : null]}
        numberOfLines={1}
      >
        {prompt.preview}
      </Text>
      {moreLines.length > 0 && fullText.length > 0 ? (
        // CDXC:SessionChat 2026-11-25 DECISION: User (Q4866, "line count"): a queued message of
        // several lines keeps its one line plus the core's "+N lines" (`queue_row_more`), and the
        // whole message shows on hover on the desktop; here a tap or a hold shows it under the list.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fullText}
          accessibilityState={{ expanded: shownPart === 'text' }}
          hitSlop={6}
          onPress={() => onDetailPress('text', false)}
          onLongPress={() => onDetailPress('text', true)}
          style={({ pressed }) => [styles.moreLines, pressed ? styles.actionPressed : null]}
        >
          <Text style={styles.moreLinesText} numberOfLines={1}>
            {moreLines}
          </Text>
        </Pressable>
      ) : null}
      {failed ? (
        <View style={styles.error}>
          <Glyph name="alert-triangle" size={13} color={P.error} />
          <Text style={styles.errorText} numberOfLines={1}>
            {notSent(prompt.errorMessage)}
          </Text>
        </View>
      ) : null}
      {reason.length > 0 && label.length > 0 ? (
        // CDXC:SessionChat 2026-11-25 DECISION: User (Q4865, "chip"): the status is a short chip on
        // the row's right, worded by gxserver (`waitLabel`, wait_reason.rs) as on the desktop, and
        // "the full text on hovering on that status pill": a phone has no hover, so a tap or a hold
        // on the chip shows the sentence, as the (i) of a background task does (WorkingStrip.tsx).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reason}
          accessibilityState={{ expanded: shownPart === 'wait' }}
          hitSlop={6}
          onPress={() => onDetailPress('wait', false)}
          onLongPress={() => onDetailPress('wait', true)}
          style={({ pressed }) => [styles.waitChip, pressed ? styles.actionPressed : null]}
        >
          <Glyph name="clock" size={11} color={P.muted} />
          <Text style={styles.waitChipText} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ) : null}
      {actions
        .filter((entry) => entry.show)
        .map((entry) => (
          <Pressable
            key={entry.label}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            disabled={entry.disabled}
            hitSlop={4}
            onPress={() => dispatch(entry.action)}
            style={({ pressed }) => [
              styles.action,
              pressed ? styles.actionPressed : null,
              entry.disabled ? styles.disabled : null,
            ]}
          >
            <Glyph name={entry.glyph} size={15} color={P.muted} />
          </Pressable>
        ))}
    </Animated.View>
  );
}

const useStyles = themedStyles((P) => ({
  list: { gap: ROW_GAP, paddingBottom: 6, maxHeight: 5 * (ROW_HEIGHT + ROW_GAP) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: ROW_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.border,
    paddingRight: 2,
    backgroundColor: P.composerBackground,
  },
  rowFailed: {},
  rowDragging: { backgroundColor: P.cardPanel, opacity: 0.9 },
  grip: { width: 26, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  gripInert: { opacity: 0.35 },
  text: { flex: 1, minWidth: 64, color: P.muted, fontSize: 13 },
  textFailed: { color: P.muted },
  textSending: { opacity: 0.7 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, maxWidth: '45%' },
  errorText: { color: P.cardMuted, fontSize: 11.5, flexShrink: 1 },
  waitReason: { color: P.muted, fontSize: 11.5, paddingLeft: 26, paddingRight: 8 },
  waitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    height: 22,
    paddingHorizontal: 8,
    marginLeft: 2,
    borderRadius: 11,
    backgroundColor: colorWithOpacity(P.foreground, 6),
  },
  waitChipText: { color: P.muted, fontSize: 11.5 },
  moreLines: { flexShrink: 0, height: 22, justifyContent: 'center', paddingHorizontal: 4, borderRadius: 6 },
  moreLinesText: { color: colorWithOpacity(P.muted, 75), fontSize: 11.5 },
  action: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  actionPressed: { backgroundColor: P.controlPressed },
  disabled: { opacity: 0.4 },
}));
