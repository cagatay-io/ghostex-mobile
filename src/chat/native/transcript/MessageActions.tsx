/**
 * What sits under a message (desktop `message_actions.rs`, React `CopyFooter`) and the actions a
 * long press on it offers: the time under a final reply, starting at the prose column, and under a
 * prompt, right-aligned; the buttons desktop shows on hover are rows of the long-press menu.
 *
 * CDXC:SessionChat 2026-10-12 DECISION: User: "hold on message to see options on the phone, we dont show buttons on any messages in the transcript without holding on it first (since these are shown on hover on desktop but there's no hover on mobile)". No message shows a button, in the main transcript or the subagent viewer: Copy, Edit, Back to composer, Delete, Rewind, Save prompt, Save to md and Send now are rows of the long-press menu (`TranscriptMenu.tsx`), built from `useUserActionItems` / `useReplyActionItems` here. Only the time, a queued message's play glyph and a "taking it back" spinner stay under a message. The user picked "Give it the same long-press menu and hide the buttons" for the subagent viewer. Supersedes the always-visible row of 2026-10-11 and the 2026-10-12 copy button under a `!` command.
 */

import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ProjectedMessage } from '../../rust/document';
import { useTranscriptEnv, useTranscriptFlags } from './context';
import { Glyph } from './icons';
import { arr, obj, str } from './json';
import { rememberSaveMarkdown } from './saveMarkdownStore';
import { PROSE_COLUMN } from './theme';
import type { MessageMenuAction } from './transcriptMenuStore';

/** One action of a message: a row of its long-press menu. */
type ActionItem = MessageMenuAction;

function MessageTime({ message }: { message: ProjectedMessage }) {
  const { theme } = useTranscriptEnv();
  const label = str(message.time, 'label');
  if (label.length === 0) return null;
  return (
    <Text style={[styles.time, { color: theme.muted }]} accessibilityLabel={str(message.time, 'title') || label}>
      {label}
    </Text>
  );
}

/**
 * A turn's final answer with no tool calls of its own: drawn flush with the chat column, without
 * the reply dot (desktop `is_flush_reply` in native_chat/message_actions.rs).
 */
export function isFlushReply(message: ProjectedMessage, finalIds: ReadonlySet<string>): boolean {
  return message.role === 'assistant' && arr(message.tools).length === 0 && finalIds.has(message.id);
}

/** Whether a reply gets its actions: a copyable assistant row whose turn is final. */
export function hasReplyActions(message: ProjectedMessage, finalIds: ReadonlySet<string>): boolean {
  return message.role === 'assistant' && obj(message.actionContent)?.copyable === true && finalIds.has(message.id);
}

/**
 * Desktop's reply row: Copy, Reply by Annotating, Save to md, then the time. Reply by Annotating
 * opens the reply in the desktop Docs review surface, which the phone does not have, so it is left
 * out rather than drawn as a control that does nothing.
 */
export const ReplyActions = memo(function ReplyActions({
  message,
  flush,
}: {
  message: ProjectedMessage;
  flush: boolean;
}) {
  // Only the time shows; Save to md is in the long-press menu (see the file doc).
  if (str(message.time, 'label').length === 0) return null;
  return (
    <View style={[styles.row, { paddingLeft: flush ? 0 : PROSE_COLUMN }]}>
      <MessageTime message={message} />
    </View>
  );
});

/** A reply's own actions besides Copy, which the menu's core row covers. */
function useReplyActionItems(message: ProjectedMessage): ActionItem[] {
  const { dispatch } = useTranscriptEnv();
  const markdown = typeof message.copyText === 'string' ? message.copyText : '';
  if (obj(message.actionContent)?.canSaveMarkdown !== true) return [];
  return [
    {
      label: 'Save message to Markdown',
      icon: 'file-export',
      run: () => {
        rememberSaveMarkdown(markdown);
        dispatch({ type: 'markdownSaveOpen', markdown });
      },
    },
  ];
}

/** The actions a long press on a reply offers after Copy and Add to Chat. */
export function useReplyMenuActions(message: ProjectedMessage): MessageMenuAction[] {
  return useReplyActionItems(message);
}

/**
 * Desktop's `delivery_indicator` (`startup_delivery.rs`): a spinner while the send waits for the
 * agent's terminal, a play button while the agent holds it queued behind its running turn, drawn
 * left of the bubble level with its last line. A tap on play sends one Escape so the agent takes
 * the queued prompt now.
 */
export function DeliveryIndicator({ message }: { message: ProjectedMessage }) {
  const { theme } = useTranscriptEnv();
  const delivery = message.startupDelivery;
  const waiting = delivery !== undefined && delivery !== null && delivery.state !== 'failed';
  const queued = message.queued === true && (delivery === undefined || delivery === null);
  if (waiting) {
    return (
      <View
        style={[styles.button, styles.indicator]}
        accessibilityRole="progressbar"
        accessibilityLabel="Waiting for agent"
      >
        <ActivityIndicator size={13} color={theme.muted} />
      </View>
    );
  }
  if (!queued) return null;
  // The play button's action ("Send now") is in the long-press menu; the glyph stays as the sign
  // that the message is waiting.
  return (
    <View style={[styles.button, styles.indicator]} accessibilityLabel="Queued. Hold the message to send it now">
      <Glyph name="player-play" size={13} color={theme.muted} />
    </View>
  );
}

export const UserActions = memo(function UserActions({ message }: { message: ProjectedMessage }) {
  const { main, theme } = useTranscriptEnv();
  const flags = useTranscriptFlags();
  const prompt = typeof message.copyText === 'string' ? message.copyText : '';
  if (prompt.length === 0) return null;
  // A message the agent itself queued comes back to the composer (CDXC:SessionChat 2026-10-11 in
  // packages/gx-chat-core/src/composer/queue_take_back.rs); the menu row starts it, the spinner shows it.
  const takingBack = main && flags.takeBackIds.has(message.id) && flags.takeBackBusy === message.id;
  if (str(message.time, 'label').length === 0 && !takingBack) return null;
  return (
    <View style={[styles.row, styles.userRow]}>
      <MessageTime message={message} />
      {takingBack ? (
        <View style={styles.button} accessibilityRole="progressbar" accessibilityLabel="Taking the message back">
          <ActivityIndicator size={13} color={theme.muted} />
        </View>
      ) : null}
    </View>
  );
});

/**
 * A prompt's own actions besides Copy, in the order desktop shows them: Edit, Back to composer,
 * Delete, Rewind, Save prompt, and Send now for a message waiting behind the agent's running turn.
 */
function useUserActionItems(message: ProjectedMessage): ActionItem[] {
  const { dispatch, main } = useTranscriptEnv();
  const flags = useTranscriptFlags();
  const prompt = typeof message.copyText === 'string' ? message.copyText : '';
  if (prompt.length === 0) return [];
  const saved = flags.savedPrompts[message.id];
  // A rewind types into this session's own pane, so a subagent's transcript never offers one.
  const rewindable = main && message.canRewind === true && flags.rewindAvailable && flags.rewindEnabled;
  // A message gxserver still holds for the agent can be taken back the way a queued row can
  // (CDXC:SessionChat 2026-10-11 in server/src/session_chat_send_wake.rs; desktop `message_actions.rs`).
  const waitingPromptId = message.startupDelivery?.state === 'queued' ? message.startupDelivery.promptId : null;
  const takeable = main && flags.takeBackIds.has(message.id) && flags.takeBackBusy !== message.id;
  const delivery = message.startupDelivery;
  const queued = message.queued === true && (delivery === undefined || delivery === null);
  const items: ActionItem[] = [];
  if (queued) {
    items.push({ label: 'Send now', icon: 'arrow-up', run: () => dispatch({ type: 'sendKey', key: 'escape' }) });
  }
  if (waitingPromptId !== null && flags.canEditQueued) {
    items.push({
      label: 'Edit message',
      icon: 'pencil',
      run: () => dispatch({ type: 'removeQueue', promptId: waitingPromptId, edit: true }),
    });
  }
  if (takeable) {
    items.push({
      label: 'Back to composer',
      icon: 'arrow-back-up',
      run: () => dispatch({ type: 'takeBackQueued', messageId: message.id }),
    });
  }
  if (waitingPromptId !== null && flags.canRemoveQueued) {
    items.push({
      label: 'Delete message',
      icon: 'trash',
      run: () => dispatch({ type: 'removeQueue', promptId: waitingPromptId }),
    });
  }
  if (rewindable) {
    items.push({
      label: 'Rewind to here',
      icon: 'arrow-back-up',
      run: () => dispatch({ type: 'rewindOpen', messageId: message.id, prompt }),
    });
  }
  if (flags.canSavePrompt) {
    items.push({
      label:
        saved === 'saved'
          ? 'Prompt saved'
          : saved === 'saving'
            ? 'Saving prompt'
            : saved === 'error'
              ? 'Could not save prompt. Tap to retry.'
              : 'Save prompt',
      icon: 'star',
      run: () => dispatch({ type: 'savePrompt', messageId: message.id, prompt }),
    });
  }
  return items;
}

/** The actions a long press on a prompt offers after Copy and Add to Chat. */
export function useUserMenuActions(message: ProjectedMessage): MessageMenuAction[] {
  return useUserActionItems(message);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userRow: { justifyContent: 'flex-end', paddingRight: 4 },
  indicator: { marginBottom: 10 },
  button: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 12 },
});
