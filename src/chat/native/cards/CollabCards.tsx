/**
 * Ghostex Collab above the chat box (`collab` in the chat core's document,
 * `packages/gx-chat-core/src/extras/collab.rs`): a "Message from <guest>" card with Decline, Edit
 * and Send for each guest message waiting for the owner, and who is typing. Port of desktop
 * `native_chat/collab.rs` (the phone is always the owner: guests use the browser).
 *
 * CDXC:Collab 2026-11-07 DECISION: User (Q1616): the phone is "full (share, approve messages, Stop sharing, see viewers)".
 */

import { useMemo } from 'react';
import { Text } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { TranscriptEnvProvider, type TranscriptEnv } from '../transcript/context';
import { arr, isTrue, obj, str, type JsonRecord } from './json';
import { CARD_TEXT_SIZE } from './primitives';
import { ToneButton, ToneCard } from './ToneCard';
import { PageAnswersCards } from '../transcript/PageAnswersCard';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

function collabOf(document: ChatDocument): JsonRecord | null {
  return obj(document.collab);
}

/** Whether there is a card or a typing line to draw. */
export function collabCardsShown(document: ChatDocument): boolean {
  const collab = collabOf(document);
  return collab !== null && (arr(collab.cards).length > 0 || str(collab, 'typing').length > 0);
}

export function CollabCards({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const styles = useStyles();
  const theme = useTranscriptTheme();
  const env = useMemo<TranscriptEnv>(
    () => ({
      dispatch: chat.dispatch,
      theme,
      simple: false,
      workOpen: false,
      filePreviews: false,
      mutedThinking: false,
      main: false,
    }),
    [chat.dispatch, theme],
  );
  const collab = collabOf(document);
  if (collab === null) return null;
  const cards = arr(collab.cards)
    .map(obj)
    .filter((card): card is JsonRecord => card !== null && str(card, 'id').length > 0);
  const typing = str(collab, 'typing');
  return (
    <TranscriptEnvProvider value={env}>
      {cards.map((card) => {
        const id = str(card, 'id');
        const busy = isTrue(card, 'busy');
        const pictures = arr(card.images).length;
        const answerCards = [obj(card.answers), ...arr(card.extraAnswers).map(obj)].filter(
          (entry): entry is JsonRecord => entry !== null,
        );
        const resolve = (action: 'send' | 'edit' | 'decline') =>
          chat.dispatch({ type: 'resolveCollabMessage', heldId: id, action });
        return (
          <ToneCard
            key={id}
            tone="info"
            icon="users"
            title={str(card, 'title')}
            body={[
              pictures > 0 ? (
                <Text key="pictures" style={styles.pictures}>
                  {pictures === 1 ? 'With 1 picture' : `With ${pictures} pictures`}
                </Text>
              ) : null,
              answerCards.length > 0 ? <PageAnswersCards key="answers" rowId={`collab:${id}`} cards={answerCards} /> : null,
              str(card, 'text').length > 0 ? (
                <Text key="text" selectable style={styles.text}>
                  {str(card, 'text')}
                </Text>
              ) : null,
            ]}
            footerEnd={[
              <ToneButton
                key="decline"
                kind="secondary"
                label="Decline"
                disabled={busy}
                onPress={() => resolve('decline')}
              />,
              <ToneButton key="edit" kind="secondary" label="Edit" disabled={busy} onPress={() => resolve('edit')} />,
              <ToneButton key="send" kind="primary" label="Send" disabled={busy} onPress={() => resolve('send')} />,
            ]}
          />
        );
      })}
      {typing.length > 0 ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.typing}>
          {`${typing}…`}
        </Text>
      ) : null}
    </TranscriptEnvProvider>
  );
}

const useStyles = themedStyles((P) => ({
  text: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
    lineHeight: 20,
  },
  pictures: {
    color: P.muted,
    fontSize: 12.5,
  },
  typing: {
    color: P.muted,
    fontSize: 12,
    paddingHorizontal: 4,
  },
}));
