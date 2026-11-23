/**
 * A one-click question's Reply sheet: the reader's own words go as its answer (`inlineAnswerText`;
 * desktop `reply_popover.rs`, CDXC:SessionChat 2026-11-05 DECISION on `open_question_reply`). The
 * pill's ✎ segment (`InlineAnswers.tsx`) and the question's own Q-tag pill (`Markdown.tsx`) open it;
 * one sheet per transcript draws it (`Transcript.tsx`). `form` is null when the Q-tag opened it,
 * and the core finds the question by its tag.
 *
 * A work item's Reply (the dock's and the Work panel's) keeps what was typed and not sent
 * (`replyDrafts.ts`, the desktop's `KEPT_REPLIES`): it opens with those words again however it
 * closed, and after a restart of the app; sending drops them.
 */

import { create } from 'zustand';

import type { RustChat } from '../../rust/useRustChat';
import { useTranscriptEnv } from './context';
import { ReplySheet } from './ReplySheet';
import {
  dropReplyDrafts,
  keepReplyDraft,
  replyDraft,
  replyDraftRow,
  replyDraftScopeOf,
  SESSION_REPLY_ROW,
  type ReplyDraftScope,
} from '../cards/replyDrafts';

/** `item` and `key` when it answers a coordinator's work item ask (the dock's Reply). */
export type QuestionReplyTarget = {
  form: string | null;
  tag: string;
  item?: string;
  key?: string;
  /**
   * A whole form's or page's id (its dock row's Reply), and what its words go after: its open tags
   * ("Q12 Q13") or, for a page that asks nothing, its mention. They go as one message
   * (`questionsReply`, "Q12 Q13: words"), and its questions stay open.
   */
  questions?: string;
  to?: string;
  /** The chat it belongs to, so its draft is kept (a work item's Reply). */
  scope?: ReplyDraftScope | null;
  /**
   * What the sheet calls it: a page's or form's title, a question's words (gx-chat-core
   * `reply_name`). Never its tags: the user, of a sheet titled "Answer Q3310 Q3311 …": "Please
   * stop showing Q1, Q2, Q3, Q4 like this. Just say the main title of what you want me to answer
   * about" (CDXC:Coordinators 2026-11-15 DECISION).
   */
  name?: string;
};

type Opened = { target: QuestionReplyTarget; row: string | null; initial: string };

const useQuestionReply = create<{ opened: Opened | null }>(() => ({ opened: null }));

export function openQuestionReply(target: QuestionReplyTarget): void {
  // A work item's own Reply (no question tag) answers the item: "W7: words".
  if (target.tag.length === 0 && (target.item ?? '').length === 0 && (target.questions ?? '').length === 0) return;
  const scope = target.scope ?? null;
  const row = replyDraftRow(target) ?? SESSION_REPLY_ROW;
  useQuestionReply.setState({ opened: { target, row, initial: replyDraft(scope, row) } });
}

function closeQuestionReply(): void {
  useQuestionReply.setState({ opened: null });
}

export function QuestionReplyHost({ chat }: { chat: RustChat }) {
  const { dispatch } = useTranscriptEnv();
  const opened = useQuestionReply((store) => store.opened);
  const target = opened?.target ?? null;
  // Every Reply keeps the session's one draft: a question in the transcript has no scope of its
  // own, so it takes its chat's (the dock registers it, `replyDrafts.ts`).
  const scope = target === null ? null : (target.scope ?? replyDraftScopeOf(chat.dispatch));
  const row = opened?.row ?? null;
  const initial = opened === null ? '' : opened.initial.length > 0 ? opened.initial : replyDraft(scope, row);
  return (
    <ReplySheet
      quote={target !== null ? '' : null}
      question={target?.name ?? ''}
      chat={chat}
      initialText={initial}
      onChangeText={scope !== null && row !== null ? (text) => keepReplyDraft(scope, row, text) : undefined}
      onClose={closeQuestionReply}
      extras={{ machine: chat.machine, uploadFiles: chat.uploadFiles }}
      onReply={(_, reply, action) => {
        closeQuestionReply();
        const text = reply.trim();
        if (target === null) return;
        // Reply in chat box: what it answers goes into the chat box as a pill inside the text, by
        // its title, with the words after it; its tags ride in the pill's link only (gx-chat-core
        // `questions/answer_pills.rs`, CDXC:Coordinators 2026-11-16 DECISION). It goes also with
        // no words yet, to say them in the chat box, beside other answers.
        if (action === 'add') {
          const whole = target.questions !== undefined && target.questions.length > 0;
          const item = target.item ?? '';
          const tags = !whole && item.length > 0 ? `${item} ${target.tag}` : target.tag;
          void chat
            .queryAsync('answerInChatBox', [
              { draft: chat.state?.composer.text ?? '', name: target.name ?? '', tags, settles: !whole, reply: text },
            ])
            .then((draft) => {
              if (typeof draft !== 'string' || chat.composer === null) return;
              if (scope !== null && row !== null) dropReplyDrafts(scope, [row]);
              chat.composer.replace(draft);
            });
          return;
        }
        if (text.length === 0) return;
        // Sent: the draft has done its job.
        if (scope !== null && row !== null) dropReplyDrafts(scope, [row]);
        // A whole form or page: the words go after its open tags, as one message.
        if (target.questions !== undefined && target.questions.length > 0) {
          const to = target.to ?? '';
          dispatch({
            type: 'questionsReply',
            id: target.questions,
            text: to.length > 0 ? `${to}: ${text}` : text,
          } as never);
          return;
        }
        // A work item: the words are its answer, recorded once and sent as "W7 Q12: words" (or
        // "W7: words" for an item that asks no question), settled at once.
        if (target.item !== undefined && target.item.length > 0) {
          const ask = target.tag;
          dispatch({
            type: 'coordinatorBoardAnswer',
            op: 'reply',
            key: target.key ?? '',
            item: target.item,
            ask,
            label: text,
            text: ask.length > 0 ? `${target.item} ${ask}: ${text}` : `${target.item}: ${text}`,
          } as never);
          return;
        }
        dispatch({
          type: 'inlineAnswerText',
          ...(target.form !== null ? { form: target.form } : {}),
          tag: target.tag,
          text,
        });
      }}
    />
  );
}
