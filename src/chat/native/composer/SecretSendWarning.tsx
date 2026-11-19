/**
 * The quiet warning above the chat box for text that looks like a key or token: the first Send of it stays in the
 * box and shows this, and a second Send of the same text posts it (`ComposerModel.submit`, `rust/secretLike.ts`).
 * Port of desktop `native_chat/secret_send_warning.rs` (CDXC:Secrets 2026-11-19 in
 * `packages/gx-chat-core/src/composer/secret_like.rs`).
 */

import { Text, View } from 'react-native';

import type { ComposerModelState } from '../../rust/composer';
import { Glyph } from '../cards/icons';
import { CARD_TEXT_SIZE } from '../cards/primitives';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

export function SecretSendWarning({
  model,
  cardOpen,
  keptOnDevice,
}: {
  model: ComposerModelState | null;
  cardOpen: boolean;
  keptOnDevice: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const held = model?.secretHeld ?? null;
  if (model === null || held === null || held.draftId !== model.draftId || held.revision !== model.revision) {
    // While the chat box holds a key or a piece of one, its draft stays on this device (`draftKeptOnDevice`).
    if (!keptOnDevice) return null;
    return (
      <View style={styles.row} accessibilityRole="text">
        <Glyph name="lock" size={12} color={P.muted} />
        <Text style={styles.note}>This draft stays on this device because it looks like it holds a key or token.</Text>
      </View>
    );
  }
  const words = cardOpen
    ? 'This looks like a key or token. Paste it into the private card above to keep it out of the chat, or send again to post it here.'
    : 'This looks like a key or token, and anyone who can read this chat would see it. Send again to post it anyway.';
  return (
    <View style={styles.row} accessibilityRole="alert">
      <Glyph name="alert-triangle" size={13} color={P.light ? '#e17100' : '#fe9a00'} />
      <Text style={styles.text}>{words}</Text>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  note: {
    flex: 1,
    color: P.muted,
    fontSize: CARD_TEXT_SIZE - 2,
    lineHeight: 16,
  },
  text: {
    flex: 1,
    color: P.muted,
    fontSize: CARD_TEXT_SIZE - 1.5,
    lineHeight: 17,
  },
}));
