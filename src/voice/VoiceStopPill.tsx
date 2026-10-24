/**
 * The strip between the captions and the voice screen's buttons: a Stop talking pill while the
 * agent speaks, "Release to cancel" while a hold has slid off its button, and the short hints
 * ("Unmute to talk") otherwise. It keeps its height for the whole call, so nothing moves when the
 * pill comes and goes and it never covers a caption.
 *
 * CDXC:VoiceMode 2026-10-24 SEE-ALSO: the user's DECISION about the Stop talking pill is in apps/desktop/src/app/voice_agent/panel_controls.rs; the phone's buttons stay Mute, the hold button and Hang up for the whole call.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GhostexPalette } from '../theme/palette';
import { interruptVoice, useVoiceStore } from './conversation';

export const VOICE_STRIP_HEIGHT = 44;

export function VoiceStopPill({ slidOff }: { slidOff: boolean }) {
  const speaking = useVoiceStore((state) => state.phase === 'live' && state.agentState === 'speaking');
  const hint = useVoiceStore((state) => state.hint);
  const talking = useVoiceStore((state) => state.talking);

  let content = null;
  if (talking && slidOff) {
    content = (
      <View style={[styles.note, styles.cancel]} accessibilityLiveRegion="polite">
        <Text style={[styles.noteText, styles.cancelText]}>Release to cancel</Text>
      </View>
    );
  } else if (speaking) {
    content = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop the agent talking"
        hitSlop={8}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        onPress={interruptVoice}
      >
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path d="M 7 7 h 10 v 10 h -10 z" fill={GhostexPalette.FOREGROUND} />
        </Svg>
        <Text style={styles.pillText}>Stop talking</Text>
      </Pressable>
    );
  } else if (hint !== null) {
    content = (
      <View style={styles.note} accessibilityLiveRegion="polite">
        <Text style={styles.noteText}>{hint}</Text>
      </View>
    );
  }
  return <View style={styles.strip}>{content}</View>;
}

const styles = StyleSheet.create({
  strip: { height: VOICE_STRIP_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: GhostexPalette.CARD_ACTIVE,
  },
  pillPressed: { opacity: 0.75 },
  pillText: { color: GhostexPalette.FOREGROUND, fontSize: 15, fontWeight: '600' },
  note: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    justifyContent: 'center',
    backgroundColor: 'rgba(38, 38, 38, 0.95)',
  },
  noteText: { color: GhostexPalette.FOREGROUND, fontSize: 14 },
  cancel: { borderWidth: 1, borderColor: 'rgba(232, 92, 92, 0.45)' },
  cancelText: { color: GhostexPalette.DANGER },
});
