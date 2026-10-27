/**
 * The top bar's Voice button: starts a conversation with the manager voice agent on the computer
 * on screen, or opens the voice screen while one is running (it keeps running across screens).
 * Shown only when that computer's gxserver lists the `voiceAgent` capability and has the voice
 * agent switched on (`featureSwitch.ts`).
 */

import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import type { MachineConnectionTarget } from '../machines/credentials';
import type { RootStackParamList } from '../navigation/types';
import { GhostexPalette } from '../theme/palette';
import { startVoice, useVoiceStore, voiceActive, VOICE_SUPPORTED } from './conversation';
import { voiceAgentOnIn } from './featureSwitch';

export { HeadsetGlyph } from '../components/sessions/icons';
import { HeadsetGlyph } from '../components/sessions/icons';

/** A microphone: the voice screen's mute control. */
export function MicrophoneGlyph({ size, color, crossed = false }: { size: number; color: string; crossed?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={2} />
      <Path d="M 5 11 a 7 7 0 0 0 14 0 M 12 18 v 3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      {crossed ? <Path d="M 4 4 L 20 20" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
    </Svg>
  );
}

/** Whether `machineId`'s computer has the voice agent switched on (its last session summary says). */
export function voiceAgentOnFor(machineId: string): boolean {
  return voiceAgentOnIn(useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary);
}

/**
 * Whether `machine`'s gxserver can run the voice agent and has it switched on; asks the computer
 * once if nobody has yet.
 */
export function useVoiceCapability(machine: MachineConnectionTarget | null): boolean {
  const machineId = machine?.id ?? null;
  const switchedOn = useInventoryStore(
    (state) => machineId === null || voiceAgentOnIn(state.inventoriesByMachineId[machineId]?.summary),
  );
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    if (!VOICE_SUPPORTED || machine === null) {
      setCapable(false);
      return undefined;
    }
    const link = chatMachineLink(machine);
    const refresh = () => setCapable(link.capabilities()?.includes('voiceAgent') === true);
    const check = () => void link.route().then(refresh, refresh);
    refresh();
    check();
    // A computer that was offline when this mounted is asked again once SSH connects; the link
    // keeps a failed handshake for a few seconds, so the second ask lands after that.
    let later: ReturnType<typeof setTimeout> | null = null;
    const connected = GhostexNative.addListener('onConnectionState', (event) => {
      if (event.machineId !== machine.id || event.state !== 'connected') return;
      check();
      if (later !== null) clearTimeout(later);
      later = setTimeout(check, 6_000);
    });
    // A fresh session list means SSH works; a computer not yet known to be capable is asked then
    // (the link answers from its cache unless its last handshake failed).
    const inventory = useInventoryStore.subscribe((state, previous) => {
      const summary = state.inventoriesByMachineId[machine.id]?.summary;
      if (
        summary !== undefined &&
        summary !== null &&
        summary !== previous.inventoriesByMachineId[machine.id]?.summary
      ) {
        if (link.capabilities() === null) check();
      }
    });
    const unsubscribe = link.onRouteChange(refresh);
    return () => {
      unsubscribe();
      inventory();
      connected.remove();
      if (later !== null) clearTimeout(later);
    };
    // The machine object changes identity on every store update; only its id matters.
  }, [machineId]); // eslint-disable-line react-hooks/exhaustive-deps
  return capable && switchedOn;
}

type Props = {
  machine: (MachineConnectionTarget & { name?: string }) | null;
  style: StyleProp<ViewStyle>;
  color: string;
  size?: number;
  /** While a conversation runs: fill the button with the accent (filled top bars), else tint the glyph. */
  activeFill?: boolean;
  /** A label under the glyph (the Sessions screen's bottom bar). */
  label?: string;
  labelStyle?: StyleProp<TextStyle>;
};

export function VoiceButton({ machine, style, color, size = 22, activeFill = true, label, labelStyle }: Props) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const capable = useVoiceCapability(machine);
  const phase = useVoiceStore((state) => state.phase);
  const active = voiceActive(phase);
  // A running conversation stays reachable from every top bar, whichever computer is on screen.
  if (!active && (!capable || machine === null)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Voice mode on: open the voice agent' : 'Talk to the voice agent'}
      hitSlop={8}
      style={[style, active && activeFill ? { backgroundColor: GhostexPalette.ACCENT } : null]}
      onPress={() => {
        if (!active && machine !== null) {
          const name = machine.name && machine.name.length > 0 ? machine.name : machine.username;
          void startVoice(machine, name);
        }
        navigation.navigate('Voice');
      }}
    >
      <HeadsetGlyph
        size={size}
        color={active ? (activeFill ? GhostexPalette.ACCENT_FOREGROUND : GhostexPalette.ACCENT) : color}
      />
      {label !== undefined ? (
        <Text style={[labelStyle, active && !activeFill ? { color: GhostexPalette.ACCENT } : null]}>{label}</Text>
      ) : null}
    </Pressable>
  );
}
