/**
 * Everything the chat stacks between the transcript and the composer, in desktop's order
 * (`render_composer` in apps/desktop/src/app/native_chat/composer.rs):
 *
 * 1. the working strip, with the pills (Threads, Tasks, Subagents) on their own line under the word,
 * 2. the composer-not-ready card, or a refused operation's error line,
 * 3. the terminal notice,
 * 4. the async questions,
 * 5. the blocking question or approval.
 *
 * The incoming draft bar and the session note sit in the same stack on desktop but belong to the
 * composer. While a `question` prompt shows, desktop draws this stack instead of the composer; see
 * `questionReplacesComposer`.
 */

import { useRef } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import type { RustChat } from '../../rust/useRustChat';
import { ApiErrorCard } from './ApiErrorCard';
import { AsyncQuestionsCard } from './AsyncQuestionsCard';
import { ChatPillsRow } from './ChatPills';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { ComposerNotReadyCard } from './ComposerNotReadyCard';
import { obj } from './json';
import { NoticeCard } from './NoticeCard';
import { QuestionCard } from './QuestionCard';
import type { CardHostAction } from './types';
import { WorkingStrip, type ArmedAction } from './WorkingStrip';

const NO_ARMED: readonly ArmedAction[] = [];

/** A failure the agent keeps no record of (Codex shows it only on screen): its card sits here, where its screen notice would have been. */
function unrecordedApiError(card: unknown): boolean {
  const value = obj(card);
  return value !== null && value.messageId === null;
}

export type NativeChatCardsProps = {
  chat: RustChat;
  /** The app-shell actions a card offers (Terminal View, Switch account). Without it those buttons are not drawn. */
  onHostAction?: CardHostAction;
  /** The session's armed Delayed Send / Close After Done, drawn on the working row. */
  armed?: readonly ArmedAction[];
  /** Opens Delayed Actions from an armed item; without it the items are not pressable. */
  onArmedPress?: () => void;
};

export function NativeChatCards({ chat, onHostAction, armed = NO_ARMED, onArmedPress }: NativeChatCardsProps) {
  const { height } = useWindowDimensions();
  const band = useRef<ScrollView>(null);
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const document = chat.state?.document ?? null;
  if (document === null) return null;
  // The pills' row: the question and scroll-to-bottom icon pills, then Threads, Tasks, Subagents.
  const hasPills = (document.chatPills?.length ?? 0) > 0 || (document.openQuestions?.count ?? 0) > 0 || awayFromBottom;
  const hasAny =
    armed.length > 0 ||
    typeof document.workingStrip?.label === 'string' ||
    obj(document.workingStrip?.presentation) !== null ||
    typeof document.operationError === 'string' ||
    hasPills ||
    (obj(document.terminalNotice) !== null && document.noticeVisible === true) ||
    unrecordedApiError(document.apiErrorCard) ||
    typeof document.asyncQuestions?.question?.key === 'string' ||
    document.questionCard?.visible === true;
  if (!hasAny) return null;
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
      <WorkingStrip
        chat={chat}
        document={document}
        armed={armed}
        {...(hasPills ? { pills: <ChatPillsRow chat={chat} document={document} /> } : {})}
        {...(onArmedPress !== undefined ? { onArmedPress } : {})}
      />
      <ComposerNotReadyCard chat={chat} document={document} onHostAction={onHostAction} />
      <NoticeCard chat={chat} document={document} onHostAction={onHostAction} />
      {unrecordedApiError(document.apiErrorCard) ? <ApiErrorCard card={document.apiErrorCard} dispatch={chat.dispatch} /> : null}
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
