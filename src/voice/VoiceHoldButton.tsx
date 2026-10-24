/**
 * The voice screen's hold button: icon only, full tile height so it is comfortable to hold. Press
 * and hold to talk (or, in a muted Regular call, to unmute); let go to send. Sliding the finger off
 * shows "Release to cancel" and letting go there sends nothing; sliding back keeps talking.
 *
 * CDXC:VoiceMode 2026-10-24 DECISION: User, asked "On the phone, what happens when your finger slides off the hold button?", picked "It cancels: "Release to cancel", and sliding back on keeps talking". Built on the touch responder, not `Pressable`, whose `onPressOut` fired as soon as the finger left the button's press area and sent the turn early.
 * CDXC:VoiceMode 2026-10-24 DECISION: User: "On the phone it's icon-only beside Mute; keep it a comfortable size to hold, but no label." The tile keeps the controls' size and shows a waveform, so it never reads as Mute's microphone.
 * SEE-ALSO: server/src/voice_agent/talk.rs (what a hold does), apps/desktop/src/app/voice_agent/panel_controls.rs (the computer's button).
 */

import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GhostexPalette } from '../theme/palette';
import { cancelVoiceTalking, setVoiceTalking, useVoiceStore, voiceHoldMode } from './conversation';

/** How far past the button's edge the finger may wander before it counts as slid off. */
const SLIDE_SLOP = 24;

export function WaveformGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M 4 10 v 4 M 8 7 v 10 M 12 4 v 16 M 16 7 v 10 M 20 10 v 4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** `onSlide` tells the screen whether the finger is off the button, for "Release to cancel". */
export function VoiceHoldButton({ style, onSlide }: { style: ViewStyle; onSlide: (off: boolean) => void }) {
  const voice = useVoiceStore();
  const mode = voiceHoldMode(voice);
  const ready = mode === 'talk' || mode === 'unmute';
  const size = useRef({ width: 0, height: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const offRef = useRef(false);
  const [off, setOff] = useState(false);

  const setSlid = (next: boolean) => {
    if (offRef.current === next) return;
    offRef.current = next;
    setOff(next);
    onSlide(next);
    if (next) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const outside = (event: GestureResponderEvent): boolean => {
    const x = event.nativeEvent.pageX - origin.current.x;
    const y = event.nativeEvent.pageY - origin.current.y;
    const { width, height } = size.current;
    return x < -SLIDE_SLOP || y < -SLIDE_SLOP || x > width + SLIDE_SLOP || y > height + SLIDE_SLOP;
  };

  const press = (event: GestureResponderEvent) => {
    // The children ignore touches, so the location is within this view.
    origin.current = {
      x: event.nativeEvent.pageX - event.nativeEvent.locationX,
      y: event.nativeEvent.pageY - event.nativeEvent.locationY,
    };
    offRef.current = false;
    setOff(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setVoiceTalking(true);
  };

  /** Lifting the finger (or the system taking the touch, like the screen locking): off the button cancels. */
  const release = () => {
    const slidOff = offRef.current;
    setSlid(false);
    if (!useVoiceStore.getState().talking) return;
    if (slidOff) {
      cancelVoiceTalking();
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
      setVoiceTalking(false);
    }
  };

  const held = voice.talking;
  const accessibilityLabel =
    mode === 'mutedLock'
      ? 'Unmute to talk'
      : mode === 'alreadyHeard'
        ? 'Hold to talk while muted'
        : mode === 'unmute'
          ? 'Hold to unmute'
          : 'Hold to talk';
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Hold and speak, then let go to send. Slide off to cancel."
      accessibilityState={{ disabled: !ready, selected: held }}
      // A screen reader taps once to start and once to send, since holding is hard to do with one.
      accessibilityActions={[{ name: 'activate', label: held ? 'Send' : 'Start talking' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') setVoiceTalking(!useVoiceStore.getState().talking);
      }}
      onLayout={(event: LayoutChangeEvent) => {
        size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
      }}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={press}
      onResponderMove={(event) => {
        if (useVoiceStore.getState().talking) setSlid(outside(event));
      }}
      onResponderRelease={release}
      onResponderTerminate={release}
      style={[
        style,
        ready ? styles.ready : styles.unavailable,
        held && (off ? styles.slidOff : styles.held),
      ]}
    >
      <View pointerEvents="none">
        <WaveformGlyph
          size={34}
          color={
            held && off
              ? GhostexPalette.DANGER
              : ready || held
                ? GhostexPalette.ACCENT_FOREGROUND
                : GhostexPalette.MUTED
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ready: { backgroundColor: GhostexPalette.ACCENT },
  unavailable: { opacity: 0.35 },
  held: {
    backgroundColor: '#BAE6FD',
    transform: [{ scale: 0.96 }],
    borderWidth: 3,
    borderColor: 'rgba(125, 211, 252, 0.45)',
  },
  slidOff: {
    backgroundColor: '#3a2a2a',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(232, 92, 92, 0.6)',
  },
});
