/**
 * Everything the chat stacks between the transcript and the composer, in desktop's order
 * (`render_composer` in apps/desktop/src/app/native_chat/composer.rs):
 *
 * 1. the composer-not-ready card, or a refused operation's error line,
 * 2. the terminal notice,
 * 3. the async questions,
 * 4. the blocking question or approval.
 *
 * The working card and its pills are not here: the screen draws them in their own row right above
 * this stack (`WorkingCard.tsx`), where desktop puts them first in the same stack.
 *
 * The incoming draft bar and the session note sit in the same stack on desktop but belong to the
 * composer. While a `question` prompt shows, desktop draws this stack instead of the composer; see
 * `questionReplacesComposer`.
 */

import { useRef } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { ApiErrorCard } from './ApiErrorCard';
import { AsyncQuestionsCard } from './AsyncQuestionsCard';
import { ComposerNotReadyCard } from './ComposerNotReadyCard';
import { obj } from './json';
import { NoticeCard } from './NoticeCard';
import { QuestionCard } from './QuestionCard';
import type { CardHostAction } from './types';

/** A failure the agent keeps no record of (Codex shows it only on screen): its card sits here, where its screen notice would have been. */
function unrecordedApiError(card: unknown): boolean {
  const value = obj(card);
  return value !== null && value.messageId === null;
}

/** Whether this stack draws anything, so the working card above it knows what it sits on (`WorkingCard.tsx`). */
export function chatCardsShown(document: ChatDocument): boolean {
  return (
    typeof document.operationError === 'string' ||
    (obj(document.terminalNotice) !== null && document.noticeVisible === true) ||
    unrecordedApiError(document.apiErrorCard) ||
    typeof document.asyncQuestions?.question?.key === 'string' ||
    document.questionCard?.visible === true
  );
}

export type NativeChatCardsProps = {
  chat: RustChat;
  /** The app-shell actions a card offers (Terminal View, Switch account). Without it those buttons are not drawn. */
  onHostAction?: CardHostAction;
};

export function NativeChatCards({ chat, onHostAction }: NativeChatCardsProps) {
  const { height } = useWindowDimensions();
  const band = useRef<ScrollView>(null);
  const document = chat.state?.document ?? null;
  if (document === null) return null;
  if (!chatCardsShown(document)) return null;
  return (
    // A phone is short: several cards at once scroll inside a band so the transcript keeps its room.
    // When the band overflows, the newest card (the blocking question, nearest the composer) stays in view.
    <ScrollView
      ref={band}
      onContentSizeChange={() => band.current?.scrollToEnd({ animated: false })}
      style={[styles.band, { maxHeight: height * 0.6 }]}
      contentContainerStyle={styles.stack}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <ComposerNotReadyCard chat={chat} document={document} onHostAction={onHostAction} />
      <NoticeCard chat={chat} document={document} onHostAction={onHostAction} />
      {unrecordedApiError(document.apiErrorCard) ? (
        <ApiErrorCard card={document.apiErrorCard} dispatch={chat.dispatch} />
      ) : null}
      <AsyncQuestionsCard chat={chat} document={document} />
      <QuestionCard chat={chat} document={document} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  band: {
    flexGrow: 0,
    width: '100%',
  },
  stack: {
    width: '100%',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
