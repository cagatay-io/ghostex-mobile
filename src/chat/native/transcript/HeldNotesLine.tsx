/**
 * "2 held notes went in with this message" under a message you sent, which opens onto each note:
 * who sent it and its words. They are the messages other sessions sent with `ghostex agents send
 * --with-next`, which Claude Code got inside this message (gx-chat-core `heldNotes`, CDXC:SessionChat
 * 2026-11-20 in packages/gx-chat-core/src/session/appended_notes.rs). The desktop draws the same line
 * (`transcript.rs` `held_notes_line`).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProjectedMessage } from '../../rust/document';
import { useNativeChatUi, useTranscriptEnv } from './context';
import { Chevron } from './Disclosure';
import { arr, obj, str } from './json';
import { Markdown } from './markdown/Markdown';
import { useDisclosure } from './state';
import { PROSE_SIZE } from './theme';

export function HeldNotesLine({ message, end = true }: { message: ProjectedMessage; end?: boolean }) {
  const { theme } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const [open, toggle] = useDisclosure(disclosures, `held-notes:${message.id}`);
  const held = obj(message.heldNotes);
  const label = str(held, 'label');
  if (held === null || label.length === 0) return null;
  const notes = arr(held.notes);
  return (
    <View style={[styles.column, end ? styles.end : styles.start]}>
      <Pressable onPress={toggle} style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Chevron open={open} color={theme.muted} />
        <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.notes, { borderLeftColor: theme.muted }]}>
          {notes.map((note, index) => {
            const from = str(note, 'from');
            return (
              <View key={index} style={styles.note}>
                {from.length > 0 ? <Text style={[styles.from, { color: theme.muted }]}>From {from}</Text> : null}
                <Markdown text={str(note, 'body')} color={theme.primary} breaks />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: '80%', gap: 6 },
  end: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  start: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: PROSE_SIZE - 2 },
  notes: { alignSelf: 'stretch', gap: 10, borderLeftWidth: 2, paddingLeft: 10, opacity: 0.95 },
  note: { gap: 2 },
  from: { fontSize: PROSE_SIZE - 3 },
});
