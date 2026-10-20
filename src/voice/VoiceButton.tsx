/**
 * The top bar's Voice button: starts a conversation with the manager voice agent on the computer
 * on screen, or opens the voice screen while one is running (it keeps running across screens).
 * Shown only when that computer's gxserver lists the `voiceAgent` capability.
 */

import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import type { MachineConnectionTarget } from '../machines/credentials';
import type { RootStackParamList } from '../navigation/types';
import { GhostexPalette } from '../theme/palette';
import { startVoice, useVoiceStore, voiceActive, VOICE_SUPPORTED } from './conversation';

/**
 * A headset (Tabler `headset`): the voice agent's glyph, the same icon the desktop's work area
 * header uses (`apps/desktop/assets/titlebar/headset.svg`), so the microphone stays Dictate's.
 */
export function HeadsetGlyph({ size, color }: { size: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 14v-3a8 8 0 1 1 16 0v3" {...stroke} />
      <Path d="M18 19c0 1.657 -2.686 3 -6 3" {...stroke} />
      <Path d="M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3z" {...stroke} />
      <Path d="M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3z" {...stroke} />
    </Svg>
  );
}

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

/** Whether `machine`'s gxserver can run the voice agent; asks the computer once if nobody has yet. */
export function useVoiceCapability(machine: MachineConnectionTarget | null): boolean {
  const machineId = machine?.id ?? null;
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
  return capable;
}

type Props = {
  machine: (MachineConnectionTarget & { name?: string }) | null;
  style: StyleProp<ViewStyle>;
  color: string;
  size?: number;
  /** While a conversation runs: fill the button with the accent (filled top bars), else tint the glyph. */
  activeFill?: boolean;
};

export function VoiceButton({ machine, style, color, size = 22, activeFill = true }: Props) {
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
    </Pressable>
  );
}
