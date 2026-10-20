/**
 * Dictate's row above the chat box (`useDictation.ts`; desktop: `render_dictation_row` in
 * `native_chat/dictation.rs`): "Recording 0:07" while the microphone records, "Transcribing…"
 * after Stop, or why the transcription failed with Transcribe again. The ✕ cancels; the recording
 * is kept either way.
 */

import { Pressable, Text, View } from 'react-native';

import { Glyph } from './icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { dictationClock, type DictationPhase } from './useDictation';

export function DictationBar({
  phase,
  elapsedMs,
  failure,
  onCancel,
  onRetry,
}: {
  phase: DictationPhase;
  elapsedMs: number;
  failure: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (phase === 'idle') return null;
  const failed = phase === 'failed';
  const label =
    phase === 'starting'
      ? 'Starting the microphone…'
      : phase === 'recording'
        ? `Recording ${dictationClock(elapsedMs)}`
        : phase === 'transcribing'
          ? 'Transcribing…'
          : 'Transcription failed.';
  return (
    <View style={styles.bar}>
      {phase === 'recording' ? <View style={styles.dot} /> : null}
      <View style={styles.texts}>
        <Text style={[styles.text, failed ? styles.failed : null]}>{label}</Text>
        {failed && failure ? <Text style={styles.detail}>{`${failure} Your recording is kept.`}</Text> : null}
      </View>
      {failed ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}>
          <Text style={styles.buttonText}>Transcribe again</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={failed ? 'Dismiss (the recording is kept)' : 'Cancel (the recording is kept)'}
        hitSlop={8}
        onPress={onCancel}
        style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
      >
        <Glyph name="x" size={14} color={P.muted} />
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  texts: { flex: 1, gap: 2 },
  text: { color: P.primary, fontSize: 13 },
  failed: { color: '#ef9999' },
  detail: { color: P.muted, fontSize: 12.5, lineHeight: 17 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: P.border },
  button: { paddingHorizontal: 10, height: 30, justifyContent: 'center', borderRadius: 8, backgroundColor: P.neutralFill },
  buttonPressed: { backgroundColor: P.neutralFillPressed },
  buttonText: { color: P.primary, fontSize: 13 },
}));
