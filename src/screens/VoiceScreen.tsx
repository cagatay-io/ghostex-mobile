/**
 * The voice screen: one conversation with the manager voice agent, made to be glanced at while
 * walking or driving. A big state circle (listening, thinking, speaking, running a tool), live
 * captions of what you and the agent said with tool calls as short rows, and large Mute, Stop
 * talking and Hang up controls. Closing the screen keeps the conversation going; the top bar's
 * Voice button and the "Voice mode on" notification bring it back.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { GhostexPalette, GhostexRadii } from '../theme/palette';
import {
  dismissVoice,
  hangUpVoice,
  interruptVoice,
  setVoiceMuted,
  startVoice,
  useVoiceStore,
  voiceActive,
  type VoiceLine,
} from '../voice/conversation';
import { MicrophoneGlyph } from '../voice/VoiceButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Voice'>;

/** The state circle's words and colour for what the agent is doing. */
function stateLook(state: ReturnType<typeof useVoiceStore.getState>): { label: string; color: string } {
  if (state.phase === 'starting') return { label: 'Connecting…', color: GhostexPalette.MUTED };
  if (state.phase === 'reattaching') return { label: 'Reconnecting…', color: GhostexPalette.STATUS_WORKING };
  if (state.phase === 'ended') return { label: 'Ended', color: GhostexPalette.MUTED };
  if (state.paused) return { label: 'Paused', color: GhostexPalette.STATUS_WORKING };
  switch (state.agentState) {
    case 'connecting':
      return { label: 'Connecting…', color: GhostexPalette.MUTED };
    case 'userSpeaking':
      return { label: 'Hearing you', color: GhostexPalette.ACCENT };
    case 'thinking':
      return { label: 'Thinking', color: GhostexPalette.STATUS_WORKING };
    case 'toolRunning':
      return { label: state.toolLabel ?? 'Working', color: GhostexPalette.STATUS_WORKING };
    case 'speaking':
      return { label: 'Speaking', color: GhostexPalette.STATUS_ATTENTION };
    default:
      return { label: state.muted ? 'Muted' : 'Listening', color: state.muted ? GhostexPalette.MUTED : GhostexPalette.ACCENT };
  }
}

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M 6 9 l 6 6 6 -6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Line({ line }: { line: VoiceLine }) {
  switch (line.kind) {
    case 'caption':
      return (
        <View style={[styles.caption, line.role === 'user' ? styles.captionUser : styles.captionAgent]}>
          <Text style={styles.captionWho}>{line.role === 'user' ? 'You' : 'Agent'}</Text>
          <Text style={[styles.captionText, !line.final && styles.captionDraft]}>
            {line.text}
            {line.cut ? ' …' : ''}
          </Text>
        </View>
      );
    case 'tool':
      return (
        <View style={styles.toolRow}>
          <Text style={[styles.toolDot, { color: line.finished ? (line.ok ? GhostexPalette.ACCENT : GhostexPalette.DANGER) : GhostexPalette.STATUS_WORKING }]}>
            ●
          </Text>
          <Text style={styles.toolText} numberOfLines={2}>
            {line.label}
          </Text>
        </View>
      );
    case 'announcement':
      return <Text style={styles.announcement}>{line.text}</Text>;
    case 'notice':
      return <Text style={styles.notice}>{line.text}</Text>;
  }
}

export default function VoiceScreen({ navigation }: Props) {
  const voice = useVoiceStore();
  const scroll = useRef<ScrollView>(null);
  const look = stateLook(voice);
  const active = voiceActive(voice.phase);
  const compact = voice.lines.length > 0;
  const machine = useMachinesStore((state) => state.machines.find((entry) => entry.id === voice.machineId) ?? null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [voice.lines]);

  const close = () => {
    if (!active) dismissVoice();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Sessions');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the voice screen" hitSlop={10} style={styles.headerButton} onPress={close}>
          <ChevronDown color={GhostexPalette.FOREGROUND} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Voice agent</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {voice.machineName}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Big while nothing has been said yet; once captions arrive it shrinks so they get the room. */}
      <View style={[styles.stateBlock, compact && styles.stateBlockCompact]} accessibilityLiveRegion="polite">
        <View style={[styles.orb, compact && styles.orbCompact, { borderColor: look.color }]}>
          <View style={[styles.orbCore, compact && styles.orbCoreCompact, { backgroundColor: look.color }]} />
        </View>
        <Text style={[styles.stateLabel, compact && styles.stateLabelCompact, { color: look.color }]} numberOfLines={2}>
          {look.label}
        </Text>
      </View>

      {voice.problem !== null ? (
        <View style={styles.problem}>
          <Text style={styles.problemText}>{voice.problem.message}</Text>
        </View>
      ) : null}

      <ScrollView ref={scroll} style={styles.lines} contentContainerStyle={styles.linesContent}>
        {voice.lines.length === 0 && active ? <Text style={styles.hint}>Ask what your agents are doing, or tell one what to do next.</Text> : null}
        {voice.lines.map((line) => (
          <Line key={line.key} line={line} />
        ))}
        {voice.phase === 'ended' && voice.endedMessage !== null && voice.problem?.message !== voice.endedMessage ? (
          <Text style={styles.notice}>{voice.endedMessage}</Text>
        ) : null}
      </ScrollView>

      {active ? (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voice.muted ? 'Unmute the microphone' : 'Mute the microphone'}
            style={({ pressed }) => [styles.control, voice.muted && styles.controlOn, pressed && styles.controlPressed]}
            onPress={() => setVoiceMuted(!voice.muted)}
          >
            <MicrophoneGlyph size={30} color={voice.muted ? GhostexPalette.ACCENT_FOREGROUND : GhostexPalette.FOREGROUND} crossed={voice.muted} />
            <Text style={[styles.controlLabel, voice.muted && styles.controlLabelOn]}>{voice.muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the agent talking"
            disabled={voice.agentState !== 'speaking'}
            style={({ pressed }) => [styles.control, voice.agentState !== 'speaking' && styles.controlDisabled, pressed && styles.controlPressed]}
            onPress={interruptVoice}
          >
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Path d="M 7 7 h 10 v 10 h -10 z" fill={GhostexPalette.FOREGROUND} />
            </Svg>
            <Text style={styles.controlLabel}>Stop talking</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hang up"
            style={({ pressed }) => [styles.control, styles.hangUp, pressed && styles.hangUpPressed]}
            onPress={hangUpVoice}
          >
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
              <Path
                d="M 3 14 c 5 -5 13 -5 18 0 l -2 3 l -4 -1.5 v -2.5 c -2 -0.6 -4 -0.6 -6 0 v 2.5 l -4 1.5 z"
                fill={GhostexPalette.FOREGROUND}
              />
            </Svg>
            <Text style={styles.controlLabel}>Hang up</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.controls}>
          {machine !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new conversation"
              style={({ pressed }) => [styles.control, styles.wide, styles.controlOn, pressed && styles.controlPressed]}
              onPress={() => void startVoice(machine, voice.machineName)}
            >
              <MicrophoneGlyph size={30} color={GhostexPalette.ACCENT_FOREGROUND} />
              <Text style={[styles.controlLabel, styles.controlLabelOn]}>Talk again</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.control, styles.wide, pressed && styles.controlPressed]}
            onPress={close}
          >
            <Text style={styles.controlLabel}>Close</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  title: { color: GhostexPalette.FOREGROUND, fontSize: 18, fontWeight: '600' },
  subtitle: { color: GhostexPalette.MUTED, fontSize: 14, marginTop: 2 },
  stateBlock: { alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  orb: { width: 132, height: 132, borderRadius: 66, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  orbCore: { width: 72, height: 72, borderRadius: 36, opacity: 0.85 },
  stateLabel: { marginTop: 14, fontSize: 26, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  stateBlockCompact: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 4, paddingBottom: 12 },
  orbCompact: { width: 64, height: 64, borderRadius: 32 },
  orbCoreCompact: { width: 34, height: 34, borderRadius: 17 },
  stateLabelCompact: { marginTop: 0, paddingHorizontal: 0, flexShrink: 1 },
  problem: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: GhostexRadii.section,
    backgroundColor: GhostexPalette.DANGER_FILL,
  },
  problemText: { color: GhostexPalette.FOREGROUND, fontSize: 17, lineHeight: 24 },
  lines: { flex: 1 },
  linesContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  hint: { color: GhostexPalette.MUTED, fontSize: 17, textAlign: 'center', marginTop: 8 },
  caption: { borderRadius: GhostexRadii.section, padding: 12, maxWidth: '92%' },
  captionUser: { alignSelf: 'flex-end', backgroundColor: GhostexPalette.CARD_ACTIVE },
  captionAgent: { alignSelf: 'flex-start', backgroundColor: GhostexPalette.CARD },
  captionWho: { color: GhostexPalette.MUTED, fontSize: 13, marginBottom: 4 },
  captionText: { color: GhostexPalette.FOREGROUND, fontSize: 19, lineHeight: 26 },
  captionDraft: { opacity: 0.7 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  toolDot: { fontSize: 12 },
  toolText: { color: GhostexPalette.MUTED, fontSize: 15, flex: 1 },
  announcement: { color: GhostexPalette.STATUS_ATTENTION, fontSize: 16, paddingHorizontal: 4 },
  notice: { color: GhostexPalette.MUTED, fontSize: 15, fontStyle: 'italic', paddingHorizontal: 4 },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  control: {
    flex: 1,
    minHeight: 96,
    borderRadius: GhostexRadii.section,
    backgroundColor: GhostexPalette.CARD_ACTIVE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  wide: { minHeight: 72 },
  controlOn: { backgroundColor: GhostexPalette.ACCENT },
  controlPressed: { opacity: 0.75 },
  controlDisabled: { opacity: 0.35 },
  controlLabel: { color: GhostexPalette.FOREGROUND, fontSize: 17, fontWeight: '600' },
  controlLabelOn: { color: GhostexPalette.ACCENT_FOREGROUND },
  hangUp: { backgroundColor: GhostexPalette.DANGER },
  hangUpPressed: { opacity: 0.8 },
});
