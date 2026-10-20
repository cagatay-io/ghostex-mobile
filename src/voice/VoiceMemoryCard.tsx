/**
 * The voice screen's memory of the last conversation, above the captions while the call is live:
 * the Continue / Start fresh card, then "Remembering last conversation" (tap it for the whole
 * summary) with Forget, or "Forgot the last conversation."
 *
 * CDXC:VoiceMode 2026-10-20 SEE-ALSO: the user's answers are the DECISION in server/src/voice_agent/memory.rs; the desktop voice panel (apps/desktop/src/app/voice_agent/panel.rs, memory.rs) shows the same card.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GhostexPalette, GhostexRadii } from '../theme/palette';
import { continueVoiceMemory, forgetVoiceMemory, memoryAgo, startVoiceFresh, useVoiceStore } from './conversation';

/** The remembered conversation's accent (the desktop panel's violet). */
const MEMORY_ACCENT = '#A78BFA';

export function VoiceMemoryCard() {
  const memory = useVoiceStore((state) => state.memory);
  const memoryState = useVoiceStore((state) => state.memoryState);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (memoryState === 'forgotten') {
    return <Text style={styles.forgotten}>Forgot the last conversation.</Text>;
  }
  if (memory === null || (memoryState !== 'offered' && memoryState !== 'continued')) return null;
  const ago = memoryAgo(memory.endedAt);

  if (memoryState === 'continued') {
    return (
      <View style={styles.remembering}>
        <View style={styles.rememberingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? 'Hide what the agent remembers' : 'Show what the agent remembers'}
            accessibilityState={{ expanded: detailsOpen }}
            style={({ pressed }) => [styles.rememberingToggle, pressed && styles.pressed]}
            onPress={() => setDetailsOpen((open) => !open)}
          >
            <Text style={styles.rememberingText} numberOfLines={1}>
              <Text style={styles.rememberingStrong}>Remembering</Text>
              {ago ? ` last conversation (${ago})` : ' last conversation'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forget the last conversation"
            hitSlop={8}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            onPress={forgetVoiceMemory}
          >
            <Text style={styles.linkText}>Forget</Text>
          </Pressable>
        </View>
        {detailsOpen ? <Text style={styles.summary}>{memory.summary}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel="Last conversation">
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Last conversation</Text>
        {ago ? <Text style={styles.cardWhen}>{` · ${ago}`}</Text> : null}
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forget the last conversation"
          hitSlop={8}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          onPress={forgetVoiceMemory}
        >
          <Text style={styles.linkText}>Forget</Text>
        </Pressable>
      </View>
      <Text style={styles.summary} numberOfLines={4}>
        {memory.gist || memory.summary}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue the last conversation"
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
          onPress={continueVoiceMemory}
        >
          <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>Continue</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start fresh"
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={startVoiceFresh}
        >
          <Text style={styles.actionLabel}>Start fresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GhostexRadii.section,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.CARD,
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: GhostexPalette.FOREGROUND, fontSize: 16, fontWeight: '700' },
  cardWhen: { color: GhostexPalette.MUTED, fontSize: 15 },
  spacer: { flex: 1 },
  summary: { color: GhostexPalette.FOREGROUND, fontSize: 16, lineHeight: 22, opacity: 0.9 },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: GhostexRadii.section,
    backgroundColor: GhostexPalette.CARD_ACTIVE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: GhostexPalette.FOREGROUND },
  actionLabel: { color: GhostexPalette.FOREGROUND, fontSize: 17, fontWeight: '600' },
  actionLabelPrimary: { color: GhostexPalette.ACCENT_FOREGROUND },
  remembering: {
    borderRadius: GhostexRadii.section,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    backgroundColor: 'rgba(167,139,250,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rememberingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rememberingToggle: { flex: 1, minHeight: 32, justifyContent: 'center' },
  rememberingText: { color: GhostexPalette.MUTED, fontSize: 15 },
  rememberingStrong: { color: MEMORY_ACCENT, fontWeight: '700' },
  link: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: GhostexPalette.MUTED, fontSize: 15, textDecorationLine: 'underline' },
  forgotten: { color: GhostexPalette.MUTED, fontSize: 15, fontStyle: 'italic', paddingHorizontal: 4 },
  pressed: { opacity: 0.75 },
});
