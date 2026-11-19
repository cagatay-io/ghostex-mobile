/**
 * The quiet lines inside the chat box, between its text and its toolbar: who else is typing in a
 * shared chat. They were lines over the box; the dock above it is the one bar there (gx-chat-core
 * `extras/dock_stack.rs`, CDXC:SessionChat 2026-11-20). Desktop: `box_notes.rs`.
 */

import { Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import { obj, str } from '../cards/json';
import { themedStyles } from '../transcript/theme';

/** Who is typing in a shared chat ("Sam is typing"), or '' for none. */
function typingLine(document: ChatDocument): string {
  const collab = obj(document.collab);
  if (collab === null || collab.shared !== true) return '';
  return str(collab, 'typing');
}

export function BoxNotes({ document }: { document: ChatDocument }) {
  const styles = useStyles();
  const typing = typingLine(document);
  if (typing.length === 0) return null;
  return (
    <View style={styles.notes}>
      <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.line}>
        {`${typing}…`}
      </Text>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  notes: { gap: 4, paddingTop: 4 },
  line: { color: P.muted, fontSize: 12, lineHeight: 16 },
}));
