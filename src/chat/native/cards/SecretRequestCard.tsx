/**
 * The private secret request cards above the composer (`secretRequests` in the chat core's
 * document, `packages/gx-chat-core/src/extras/secret_requests.rs`): an agent asked for a
 * password, key or token with `ghostex secret request`. Port of desktop `secret_request.rs`.
 *
 * The typed value lives only in this card's own state, in a secure field, until Save sends it
 * once with the `answerSecretRequest` action; it is never echoed through the core's document or
 * the composer draft. The field is cleared when its card closes.
 */

import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph } from './icons';
import { ErrorLine } from './ErrorLine';
import { arr, isTrue, str, type JsonRecord, obj } from './json';
import { CARD_TEXT_SIZE } from './primitives';
import { ToneButton, ToneCard } from './ToneCard';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { TranscriptEnvProvider, useOptionalNativeChatUi, type TranscriptEnv } from '../transcript/context';
import { Markdown } from '../transcript/markdown/Markdown';
import type { SecretField } from '../composer/dictationTarget';

/**
 * Whether the chat has an open (unanswered) secret request card.
 *
 * CDXC:Secrets 2026-11-18 WHY:
 * #648: a secret typed into the card could end up in the chat box. Here the composer took the keyboard on its own
 * whenever a draft arrived from another device, a send settled or the core put text back (`onFocusRequested` in
 * `rust/composer.ts`), and when a hardware keyboard moved to the chat's pane, so a password being typed in the card
 * went on into the chat box. While a card is open those automatic moves are skipped (`NativeComposer.tsx`); the
 * composer still takes the keyboard when it is tapped.
 */
export function secretRequestOpen(document: ChatDocument | null): boolean {
  return arr(document?.secretRequests)
    .map(obj)
    .some((card) => card !== null && isTrue(card, 'open'));
}

export function SecretRequestCards({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const cards = arr(document.secretRequests)
    .map(obj)
    .filter((card): card is JsonRecord => card !== null && str(card, 'id').length > 0);
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => (
        <SecretRequestCard key={str(card, 'id')} chat={chat} card={card} />
      ))}
    </>
  );
}

function SecretRequestCard({ chat, card }: { chat: RustChat; card: JsonRecord }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [secret, setSecret] = useState('');
  const id = str(card, 'id');
  const open = isTrue(card, 'open');
  const busy = isTrue(card, 'busy');
  useEffect(() => {
    if (!open) setSecret('');
  }, [open]);
  // Dictate does not start while this field has the keyboard (`SecretField` in composer/dictationTarget.ts).
  const targets = useOptionalNativeChatUi()?.dictationTargets ?? null;
  const field = useMemo<SecretField>(() => ({}), []);
  useEffect(() => () => targets?.setSecretFocused(field, false), [targets, field]);
  if (!open) {
    return <ToneCard tone="approval" icon="lock" title={str(card, 'label')} detail={str(card, 'closedLabel')} />;
  }
  const canSave = !busy && secret.trim().length > 0;
  const save = () => {
    if (canSave) chat.dispatch({ type: 'answerSecretRequest', requestId: id, secret });
  };
  const error = str(card, 'error');
  return (
    <ToneCard
      tone="approval"
      icon="lock"
      title={str(card, 'label')}
      detail={str(card, 'title')}
      body={[
        <SecretReason key="reason" dispatch={chat.dispatch} reason={str(card, 'reason')} />,
        <TextInput
          key="field"
          style={styles.field}
          value={secret}
          onChangeText={setSecret}
          editable={!busy}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          spellCheck={false}
          submitBehavior="submit"
          returnKeyType="done"
          onSubmitEditing={save}
          onFocus={() => targets?.setSecretFocused(field, true)}
          onBlur={() => targets?.setSecretFocused(field, false)}
          placeholder={str(card, 'placeholder')}
          placeholderTextColor={P.placeholder}
          accessibilityLabel={str(card, 'label')}
        />,
        error.length > 0 ? <ErrorLine key="error" message={error} /> : null,
        <View key="note" style={styles.note}>
          <Glyph name="shield-check" size={13} color={P.muted} />
          <Text style={styles.noteText}>{str(card, 'note')}</Text>
        </View>,
      ]}
      footerEnd={[
        <ToneButton
          key="decline"
          kind="secondary"
          label={str(card, 'declineLabel')}
          disabled={busy}
          onPress={() => chat.dispatch({ type: 'answerSecretRequest', requestId: id, decline: true })}
        />,
        <ToneButton
          key="save"
          kind="primary"
          icon="lock"
          label={str(card, 'saveLabel')}
          disabled={!canSave}
          onPress={save}
        />,
      ]}
    />
  );
}

/**
 * The card's reason as a message's text (`Markdown`): selectable, with its web addresses opening on a tap.
 *
 * CDXC:Secrets 2026-11-25 WHY:
 * #752: the reason was plain text, so a web address in it could not be opened. It is drawn by the chat's own message
 * text view, the way the side question card draws its answer; the secure field is unchanged. Desktop:
 * `secret_request_card` in `apps/desktop/src/app/native_chat/secret_request.rs`.
 */
function SecretReason({ dispatch, reason }: { dispatch: RustChat['dispatch']; reason: string }) {
  const P = useTranscriptTheme();
  const env = useMemo<TranscriptEnv>(
    () => ({
      dispatch,
      theme: P,
      simple: false,
      workOpen: false,
      filePreviews: false,
      mutedThinking: false,
      main: false,
    }),
    [dispatch, P],
  );
  return (
    <TranscriptEnvProvider value={env}>
      <Markdown text={reason} color={P.foreground} />
    </TranscriptEnvProvider>
  );
}

const useStyles = themedStyles((P) => ({
  field: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: P.background,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteText: {
    flex: 1,
    color: P.muted,
    fontSize: 12,
    lineHeight: 16,
  },
}));
