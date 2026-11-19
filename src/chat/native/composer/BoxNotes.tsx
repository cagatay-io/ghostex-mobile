/**
 * The quiet lines inside the chat box, between its text and its toolbar: who else is typing in a
 * shared chat (the key hints beside it are `SecretSendWarning.tsx`). They were lines over the box; the dock above it is the one bar there (gx-chat-core
 * `extras/dock_stack.rs`, CDXC:SessionChat 2026-11-20). Desktop: `box_notes.rs`.
 */

import { Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument } from '../../rust/document';
import { BoostHint } from '../cards/Boosts';
import { obj, str } from '../cards/json';
import { themedStyles } from '../transcript/theme';

/** Who is typing in a shared chat ("Sam is typing"), or '' for none. */
function typingLine(document: ChatDocument): string {
  const collab = obj(document.collab);
  if (collab === null || collab.shared !== true) return '';
  return str(collab, 'typing');
}

export function BoxNotes({
  document,
  dispatch,
}: {
  document: ChatDocument;
  dispatch?: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const typing = typingLine(document);
  // The Boosts' one-time hint (`cards/Boosts.tsx`), until it is seen on this computer.
  const hint = dispatch !== undefined ? (document.boosts?.hint ?? null) : null;
  if (typing.length === 0 && hint === null) return null;
  return (
    <View style={styles.notes}>
      {hint !== null ? <BoostHint hint={hint} dispatch={dispatch!} /> : null}
      {typing.length > 0 ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.line}>
          {`${typing}…`}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  notes: { gap: 4, paddingTop: 4 },
  line: { color: P.muted, fontSize: 12, lineHeight: 16 },
}));
