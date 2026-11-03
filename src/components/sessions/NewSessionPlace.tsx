/**
 * The agent menu's top rows: the project a session starts in (a tap opens the project list) and
 * the machines that have it as chips filling the row (the desktop New thread picker's Run on row).
 * A machine that can't be reached keeps its chip, dimmed and not pressable.
 *
 * CDXC:Sidebar 2026-11-03 DECISION:
 * User (Q1180, on the desktop's Run on row): "it's left aligned while the rest are filling the row fam". The machine chips share the row's whole width in equal parts, on the phone as on the desktop.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnifiedChoiceMachine } from '../../contract/unified/choices';
import { SidebarPalette } from '../../theme/palette';

export function NewSessionProjectRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Project: ${label}. Tap to change project`}
      onPress={onPress}
      style={({ pressed }) => [styles.project, pressed ? styles.pressed : null]}
    >
      <View style={styles.tile}>
        <Text style={styles.tileText}>{label.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.projectText}>
        <Text style={styles.projectLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.projectHint} numberOfLines={1}>
          Tap to change project
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function NewSessionMachineChips({
  machines,
  selectedMachineId,
  onPick,
}: {
  machines: readonly UnifiedChoiceMachine[];
  selectedMachineId: string;
  onPick: (machine: UnifiedChoiceMachine) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Run on">
      {machines.map((machine) => {
        const on = machine.machineId === selectedMachineId;
        return (
          <Pressable
            key={machine.machineId}
            accessibilityRole="radio"
            accessibilityLabel={machine.connected ? machine.label : `${machine.label}, not connected`}
            accessibilityState={{ selected: on, disabled: !machine.connected }}
            disabled={!machine.connected}
            onPress={() => onPick(machine)}
            style={({ pressed }) => [
              styles.chip,
              on ? styles.chipOn : null,
              pressed && !on ? styles.pressed : null,
              machine.connected ? null : styles.chipAway,
            ]}
          >
            <Text style={[styles.chipText, on ? styles.chipTextOn : null]} numberOfLines={1}>
              {machine.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  project: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: SidebarPalette.MENU_HOVER,
  },
  pressed: { opacity: 0.7 },
  tile: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tileText: { color: SidebarPalette.MUTED, fontSize: 11, fontWeight: '600' },
  projectText: { flex: 1, minWidth: 0 },
  projectLabel: { color: SidebarPalette.FOREGROUND, fontSize: 15, fontWeight: '600' },
  projectHint: { color: SidebarPalette.MUTED, fontSize: 12 },
  chevron: { color: SidebarPalette.MUTED, fontSize: 18 },
  chips: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingBottom: 4 },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.28)' },
  chipAway: { opacity: 0.45 },
  chipText: { color: SidebarPalette.MUTED, fontSize: 13 },
  chipTextOn: { color: SidebarPalette.FOREGROUND, fontWeight: '600' },
});
