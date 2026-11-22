/**
 * Bottom sheet for one-time theme copy from a paired computer (Q4466 Option A).
 *
 * Lists paired computers (online computers selectable with live mini theme swatches; offline computers
 * dimmed), previews the selected computer's theme chips, and applies a one-time local copy to the phone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '../../chat/native/cards/icons';
import BottomSheet from '../../components/common/BottomSheet';
import { isDemoMachine } from '../../demo/identity';
import { useInventoryStore } from '../../inventory/store';
import { machineDisplayLabel, useMachinesStore, type MachineRecord } from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { fetchComputerTheme, type ComputerThemePreview } from '../../theme/computerTheme';
import { colorWithOpacity, GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

type FetchEntry =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly preview: ComputerThemePreview }
  | { readonly status: 'error'; readonly message: string };

export type CopyComputerThemeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCopied?: (machineName: string, themeName: string) => void;
};

export function CopyComputerThemeSheet({ visible, onClose, onCopied }: CopyComputerThemeSheetProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const machines = useMachinesStore((state) => state.machines);
  const inventories = useInventoryStore((state) => state.inventoriesByMachineId);
  const patchSettings = useSettingsStore((state) => state.patchSettings);

  const candidates = useMemo(() => {
    const list = machines.filter((machine) => machine.disabled !== true && !isDemoMachine(machine));
    return list.sort((a, b) => {
      const aOnline = isMachineOnline(inventories[a.id]);
      const bOnline = isMachineOnline(inventories[b.id]);
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return machineDisplayLabel(a).localeCompare(machineDisplayLabel(b));
    });
  }, [machines, inventories]);

  // Stable key of currently online machine ids so background 5s inventory polls do not restart fetches or clear state.
  const onlineIdsKey = useMemo(
    () =>
      candidates
        .filter((machine) => isMachineOnline(inventories[machine.id]))
        .map((machine) => machine.id)
        .sort()
        .join('\0'),
    [candidates, inventories],
  );

  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, FetchEntry>>({});
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);
  const activeRun = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const wasVisibleRef = useRef(false);

  const loadMachine = useCallback(async (machine: MachineRecord, runId: number, signal: AbortSignal) => {
    fetchedIdsRef.current.add(machine.id);
    setEntries((prev) => ({ ...prev, [machine.id]: { status: 'loading' } }));
    try {
      const preview = await fetchComputerTheme(machine, signal);
      if (activeRun.current !== runId || signal.aborted) return;
      setEntries((prev) => ({ ...prev, [machine.id]: { status: 'ready', preview } }));
    } catch (error) {
      if (activeRun.current !== runId || signal.aborted) return;
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : `Could not read theme from ${machineDisplayLabel(machine)}.`;
      setEntries((prev) => ({ ...prev, [machine.id]: { status: 'error', message } }));
    }
  }, []);

  // Lifecycle on open/close: start fresh when opening, abort in-flight work on close or unmount.
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      wasVisibleRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const runId = activeRun.current + 1;
      activeRun.current = runId;
      fetchedIdsRef.current = new Set();
      setEntries({});
      setCopiedBanner(null);
    } else if (!visible && wasVisibleRef.current) {
      wasVisibleRef.current = false;
      activeRun.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      fetchedIdsRef.current = new Set();
    }
  }, [visible]);

  useEffect(
    () => () => {
      activeRun.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  // Fetch only newly-online machines not yet loaded/loading during this open session; never wipe copiedBanner.
  useEffect(() => {
    if (!visible) return;
    const onlineIds = onlineIdsKey === '' ? [] : onlineIdsKey.split('\0');
    const onlineSet = new Set(onlineIds);
    const onlineMachines = candidatesRef.current.filter((machine) => onlineSet.has(machine.id));

    setSelectedId((current) => {
      if (current !== null && onlineSet.has(current)) return current;
      return onlineMachines[0]?.id ?? null;
    });

    const controller = abortRef.current;
    if (controller === null) return;
    const runId = activeRun.current;
    for (const machine of onlineMachines) {
      if (fetchedIdsRef.current.has(machine.id)) continue;
      void loadMachine(machine, runId, controller.signal);
    }
  }, [visible, onlineIdsKey, loadMachine]);

  const selectedMachine = candidates.find((m) => m.id === selectedId) ?? null;
  const selectedEntry = selectedId !== null ? entries[selectedId] : undefined;
  const selectedPreview = selectedEntry?.status === 'ready' ? selectedEntry.preview : null;

  const handleCopy = (): void => {
    if (selectedMachine === null || selectedPreview === null) return;
    patchSettings(selectedPreview.patch);
    const label = machineDisplayLabel(selectedMachine);
    setCopiedBanner(`Copied ${selectedPreview.themeName} from ${label}. Tweaks stay on this phone.`);
    onCopied?.(label, selectedPreview.themeName);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Copy theme from a computer</Text>
          <Text style={styles.subtitle}>
            Preview a connected computer&apos;s look and copy it once. Your phone tweaks stay independent.
          </Text>
        </View>

        {candidates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No paired computers yet</Text>
            <Text style={styles.emptyDetail}>Connect a Mac or PC first, then come back here to copy its theme.</Text>
          </View>
        ) : (
          <View style={styles.machineList}>
            {candidates.map((machine) => {
              const online = isMachineOnline(inventories[machine.id]);
              const entry = entries[machine.id];
              const isSelected = machine.id === selectedId;
              const label = machineDisplayLabel(machine);
              const meta = !online
                ? 'Offline'
                : entry?.status === 'ready'
                  ? `${entry.preview.themeName} · ${entry.preview.modeLabel}`
                  : entry?.status === 'error'
                    ? 'Could not read theme'
                    : 'Reading theme…';

              return (
                <Pressable
                  key={machine.id}
                  disabled={!online}
                  accessibilityRole="radio"
                  accessibilityLabel={`${label}, ${meta}`}
                  accessibilityState={{ selected: isSelected, disabled: !online }}
                  onPress={() => {
                    setSelectedId(machine.id);
                    setCopiedBanner(null);
                    if (entry?.status === 'error' && abortRef.current !== null) {
                      fetchedIdsRef.current.delete(machine.id);
                      void loadMachine(machine, activeRun.current, abortRef.current.signal);
                    }
                  }}
                  style={[
                    styles.machineRow,
                    isSelected && styles.machineRowSelected,
                    !online && styles.machineRowDisabled,
                  ]}
                >
                  <View style={styles.iconBox}>
                    <Glyph name="device-desktop" size={16} color={appearance.foreground} />
                  </View>
                  <View style={styles.machineInfo}>
                    <Text style={styles.machineName} numberOfLines={1}>
                      {label}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: online ? appearance.connected : appearance.mutedGlyph },
                        ]}
                      />
                      <Text style={styles.machineMeta} numberOfLines={1}>
                        {meta}
                      </Text>
                    </View>
                  </View>

                  {online && entry?.status === 'loading' ? (
                    <ActivityIndicator size="small" color={appearance.muted} />
                  ) : entry?.status === 'ready' ? (
                    <View style={styles.swatchBox}>
                      <View style={[styles.swatchSide, { backgroundColor: entry.preview.sidebar }]} />
                      <View style={[styles.swatchMain, { backgroundColor: entry.preview.workArea }]}>
                        <View style={[styles.swatchAccent, { backgroundColor: entry.preview.accent }]} />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.swatchBox, styles.swatchOffline]}>
                      <View style={[styles.swatchSide, { backgroundColor: appearance.card }]} />
                      <View style={[styles.swatchMain, { backgroundColor: appearance.background }]} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedMachine !== null && selectedEntry?.status === 'error' ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Could not read theme</Text>
            <Text style={styles.emptyDetail}>{selectedEntry.message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry reading theme"
              onPress={() => {
                if (abortRef.current === null) return;
                fetchedIdsRef.current.delete(selectedMachine.id);
                void loadMachine(selectedMachine, activeRun.current, abortRef.current.signal);
              }}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill },
              ]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {selectedMachine !== null && selectedPreview !== null ? (
          <View style={styles.previewCard}>
            <View style={styles.previewHead}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {machineDisplayLabel(selectedMachine)} · {selectedPreview.themeName}
              </Text>
              <Text style={styles.previewReady}>Ready</Text>
            </View>
            <View style={styles.chipsRow}>
              {selectedPreview.chips.map((chip) => (
                <View key={chip} style={styles.chip}>
                  <Text style={styles.chipText}>{chip}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy to phone"
          disabled={selectedPreview === null}
          onPress={handleCopy}
          style={({ pressed }) => [
            styles.primaryBtn,
            selectedPreview === null && styles.primaryBtnDisabled,
            pressed && selectedPreview !== null && { opacity: 0.86 },
          ]}
        >
          <Text style={styles.primaryBtnText}>Copy to phone</Text>
        </Pressable>

        {copiedBanner !== null ? <Text style={styles.statusText}>{copiedBanner}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function isMachineOnline(inventory: { summary: unknown; lastError: string | null } | undefined): boolean {
  return inventory !== undefined && inventory.summary !== null && inventory.lastError === null;
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    root: {
      gap: 10,
      paddingTop: 2,
    },
    header: {
      gap: 3,
    },
    title: {
      color: appearance.foreground,
      fontSize: 16,
      fontWeight: '600',
    },
    subtitle: {
      color: appearance.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    emptyCard: {
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      borderRadius: GhostexRadii.section,
      padding: 12,
      gap: 4,
    },
    emptyTitle: {
      color: appearance.foreground,
      fontSize: 14,
      fontWeight: '600',
    },
    emptyDetail: {
      color: appearance.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    machineList: {
      gap: 8,
    },
    machineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    machineRowSelected: {
      borderColor: appearance.accent,
      backgroundColor: appearance.cardActive,
    },
    machineRowDisabled: {
      opacity: 0.5,
    },
    iconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: appearance.cardActive,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    machineInfo: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    machineName: {
      color: appearance.foreground,
      fontSize: 14,
      fontWeight: '600',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    machineMeta: {
      color: appearance.muted,
      fontSize: 12,
      flexShrink: 1,
    },
    swatchBox: {
      width: 48,
      height: 28,
      borderRadius: 6,
      borderWidth: GhostexStrokeWidth,
      borderColor: colorWithOpacity(appearance.foreground, 18),
      flexDirection: 'row',
      overflow: 'hidden',
    },
    swatchOffline: {
      opacity: 0.45,
    },
    swatchSide: {
      width: '34%',
      height: '100%',
    },
    swatchMain: {
      flex: 1,
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 4,
    },
    swatchAccent: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    previewCard: {
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      borderRadius: 10,
      padding: 10,
      gap: 7,
    },
    previewHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    previewTitle: {
      color: appearance.foreground,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    previewReady: {
      color: appearance.muted,
      fontSize: 12,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      backgroundColor: appearance.background,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    chipText: {
      color: appearance.muted,
      fontSize: 11,
      fontFamily: 'monospace',
    },
    retryButton: {
      alignSelf: 'flex-start',
      borderRadius: GhostexRadii.row,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    retryText: {
      color: appearance.foreground,
      fontSize: 13,
      fontWeight: '500',
    },
    primaryBtn: {
      backgroundColor: appearance.foreground,
      borderRadius: 10,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryBtnDisabled: {
      opacity: 0.4,
    },
    primaryBtnText: {
      color: appearance.background,
      fontSize: 14,
      fontWeight: '600',
    },
    statusText: {
      color: appearance.accent,
      fontSize: 12,
      textAlign: 'center',
    },
  });
