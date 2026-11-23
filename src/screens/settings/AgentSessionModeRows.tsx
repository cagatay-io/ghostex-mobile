/**
 * Settings › Chat › Session mode: per-agent Terminal / Native mode (`agentSessionMode`) for Claude
 * Code, Codex, and Antigravity on the picked computer, matching desktop's Settings › Agents ›
 * Session mode (`agentSessionMode`).
 *
 * CDXC:AgentProviders 2026-11-24 SEE-ALSO:
 * apps/mobile/app/src/settings/agentSessionMode.ts,
 * apps/mobile/app/src/screens/settings/ClaudeCompactionRows.tsx (same picked-computer pattern),
 * apps/mobile/app/src/screens/machine-form/MachineToolsSection.tsx (inline per-agent toggle).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ActionSheet from '../../components/common/ActionSheet';
import { isDemoMachine } from '../../demo/identity';
import {
  isMachineEnabled,
  machineDisplayLabel,
  machineName,
  useMachinesStore,
  type MachineRecord,
} from '../../machines/store';
import {
  modeForFamily,
  NATIVE_MODE_AGENTS,
  readAgentSessionModes,
  saveAgentSessionMode,
  SESSION_MODE_OPTIONS,
  type AgentSessionMode,
  type NativeModeFamily,
  type ReadSessionModesResult,
} from '../../settings/agentSessionMode';
import { useAppearance } from '../../theme/useAppearance';
import {
  Caption,
  LinkRow,
  NoticeCard,
  SectionHeader,
  SegmentedRow,
  useSettingsStyles,
} from './SettingsControls';
import { SettingsSearchAnchor } from './search/SettingsSearchAnchor';

type Loaded = { kind: 'loading' } | ReadSessionModesResult;

function useSessionModeComputer(pickedId: string | null): {
  machine: MachineRecord | null;
  machines: MachineRecord[];
} {
  const all = useMachinesStore((state) => state.machines);
  const selectedId = useMachinesStore((state) => state.selectedMachineId);
  return useMemo(() => {
    const machines = all.filter((entry) => isMachineEnabled(entry) && !isDemoMachine(entry));
    const machine =
      machines.find((entry) => entry.id === pickedId) ??
      machines.find((entry) => entry.id === selectedId) ??
      machines[0] ??
      null;
    return { machine, machines };
  }, [all, pickedId, selectedId]);
}

export function AgentSessionModeRows() {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const { machine, machines } = useSessionModeComputer(pickedId);
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const appearance = useAppearance();
  const machineId = machine?.id ?? null;

  const load = useCallback(() => {
    if (machine === null) return () => undefined;
    let live = true;
    setLoaded({ kind: 'loading' });
    setSaveError(null);
    void readAgentSessionModes(machine).then((next) => {
      if (live) setLoaded(next);
    });
    return () => {
      live = false;
    };
    // Reload when the picked computer changes, not on every store update of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId]);

  useEffect(() => load(), [load]);

  if (machine === null) return null;

  const change = (family: NativeModeFamily, mode: AgentSessionMode) => {
    if (loaded.kind !== 'values') return;
    const before = loaded.modes;
    const next = { ...before, [family]: mode };
    setLoaded({ kind: 'values', modes: next });
    setSaveError(null);
    void saveAgentSessionMode(machine, family, mode, before).then((error) => {
      if (error === null) return;
      setLoaded({ kind: 'values', modes: before });
      setSaveError(`Couldn't save it on ${machineDisplayLabel(machine)}: ${error}`);
    });
  };

  return (
    <>
      <SettingsSearchAnchor label="Session mode">
        <SectionHeader title="Session mode" />
      </SettingsSearchAnchor>
      {machines.length > 1 ? <ComputerRow machine={machine} machines={machines} onPick={setPickedId} /> : null}
      {loaded.kind === 'loading' ? <Caption>Reading {machineDisplayLabel(machine)}'s settings…</Caption> : null}
      {loaded.kind === 'unsupported' ? <Caption>{loaded.message}</Caption> : null}
      {loaded.kind === 'failed' ? (
        <>
          <Caption>{loaded.message}</Caption>
          <LinkRow title="Try again" onPress={() => load()} />
        </>
      ) : null}
      {loaded.kind === 'values' ? (
        <>
          {NATIVE_MODE_AGENTS.map((agent) => (
            <View key={agent.family} style={styles.agentGroup}>
              <Text style={[styles.agentLabel, { color: appearance.foreground }]}>{agent.label}</Text>
              <SegmentedRow
                label={`${agent.label} session mode`}
                options={SESSION_MODE_OPTIONS}
                value={modeForFamily(loaded.modes, agent.family)}
                onChange={(next) => change(agent.family, next)}
              />
            </View>
          ))}
          <Caption>
            Terminal runs in an interactive terminal with instant switching between Chat and Terminal. Native runs
            through a structured host for faster mobile chat and live approvals. Applies to chats started or resumed
            after you change it.
          </Caption>
          {saveError !== null ? <NoticeCard tone="error" title="Could not save Session mode" detail={saveError} /> : null}
        </>
      ) : null}
    </>
  );
}

function ComputerRow({
  machine,
  machines,
  onPick,
}: {
  machine: MachineRecord;
  machines: MachineRecord[];
  onPick: (id: string) => void;
}) {
  const settingsStyles = useSettingsStyles();
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);
  return (
    <SettingsSearchAnchor label="Session mode computer">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Session mode settings for ${machineDisplayLabel(machine)}`}
        accessibilityHint="Picks another computer"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [settingsStyles.row, local.computer, pressed && settingsStyles.rowPressed]}
      >
        <View style={settingsStyles.linkText}>
          <Text style={settingsStyles.linkTitle}>{machineDisplayLabel(machine)}</Text>
          <Text style={settingsStyles.linkDescription}>
            {`The Session mode settings below are saved on ${machineName(machine)}`}
          </Text>
        </View>
        <Text style={[settingsStyles.chevron, { color: appearance.muted }]}>⌄</Text>
      </Pressable>
      <ActionSheet
        visible={open}
        title="Change Session mode on"
        onClose={() => setOpen(false)}
        items={machines.map((entry) => ({
          key: entry.id,
          label: `${entry.id === machine.id ? '✓ ' : ''}${machineDisplayLabel(entry)}`,
          onPress: () => {
            setOpen(false);
            onPick(entry.id);
          },
        }))}
      />
    </SettingsSearchAnchor>
  );
}

const local = StyleSheet.create({
  computer: { minHeight: 56 },
});

const styles = StyleSheet.create({
  agentGroup: {
    gap: 6,
    marginBottom: 4,
  },
  agentLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    paddingHorizontal: 2,
  },
});
