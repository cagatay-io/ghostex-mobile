/**
 * One-time phone announcement bottom sheet introducing Native mode (`Q4767`, `phone-sheet`).
 *
 * CDXC:AgentProviders 2026-11-24 DECISION:
 * User (Q4767): show a one-time bottom sheet on first open after OTA, per computer, only when that
 * computer's gxserver supports Native mode (`nativeModeSwitch` capability) and Native is not
 * already enabled for any of Antigravity, Claude Code, or Codex on that computer. Older 11.2.1+
 * phones and older servers are unaffected; this sheet is JS-only and ships over the air.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph as ComposerGlyph } from '../../chat/native/composer/icons';
import { chatMachineLink, onChatLinkHandshake } from '../../chat/rust/machine-link';
import { isDemoMachine } from '../../demo/identity';
import type { MachineConnectionTarget } from '../../machines/credentials';
import { extractAgentSessionModes } from '../../settings/agentSessionMode';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import BottomSheet from '../common/BottomSheet';

const SEEN_STORAGE_KEY = 'ghostex.nativeModeAnnounceSeen.v1';
const NATIVE_FAMILIES = [
  'antigravity',
  'claude',
  'codex',
  'opencode',
  'grok',
  'hermes',
  'cursor',
  'pi',
  'omp',
] as const;

type BulkSwitchSummary = {
  completed: boolean;
  totalEligible: number;
  switched: number;
  skippedBusy: number;
  skippedThreads: number;
  failed: number;
};

function formatBulkSwitchSummary(summary: BulkSwitchSummary, computerName: string): string {
  const plural = (count: number) => (count === 1 ? 'chat' : 'chats');
  if (!summary.completed) {
    return `Switching ${summary.totalEligible} eligible ${plural(summary.totalEligible)} in the background. New chats will use Native.`;
  }
  const notes: string[] = [];
  if (summary.skippedBusy > 0) {
    notes.push(
      summary.skippedBusy === 1
        ? '1 is busy and stays in Terminal-based until you switch it'
        : `${summary.skippedBusy} are busy and stay in Terminal-based until you switch them`,
    );
  }
  if (summary.skippedThreads > 0) {
    notes.push(
      summary.skippedThreads === 1
        ? '1 worker thread will use Native on reload'
        : `${summary.skippedThreads} worker threads will use Native on reload`,
    );
  }
  if (summary.failed > 0) {
    notes.push(`${summary.failed} could not switch and stayed in Terminal-based`);
  }
  if (summary.switched > 0 && notes.length > 0) {
    return `Switched ${summary.switched} ${plural(summary.switched)}; ${notes.join('; ')}.`;
  }
  if (summary.switched > 0) {
    return `Switched ${summary.switched} ${plural(summary.switched)} to Native mode. New chats will use Native.`;
  }
  if (notes.length > 0) {
    return `Native mode is on for new chats. ${notes.join('; ')}.`;
  }
  return `Native mode is on for new chats on ${computerName}.`;
}

async function readSeenMachines(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // Ignore storage corruption and treat as unseen.
  }
  return {};
}

async function markMachineSeen(machineId: string): Promise<void> {
  try {
    const seen = await readSeenMachines();
    seen[machineId] = true;
    await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Best-effort persistence.
  }
}

export function NativeModeAnnounceSheet({
  machine,
  machineName,
  canPresent,
  onEnabled,
  onError,
}: {
  machine: MachineConnectionTarget | null;
  machineName: string;
  /** True when SessionsScreen is focused and no other modal/sheet is open. */
  canPresent: boolean;
  onEnabled: (summary: string) => void;
  onError: (message: string) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const [target, setTarget] = useState<MachineConnectionTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [handshakeTick, setHandshakeTick] = useState(0);
  const checkedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return onChatLinkHandshake((connectedMachine, capabilities) => {
      if (machine !== null && connectedMachine.id === machine.id && capabilities.includes('nativeModeSwitch')) {
        setHandshakeTick((n) => n + 1);
      }
    });
  }, [machine]);

  useEffect(() => {
    if (!canPresent || machine === null || isDemoMachine(machine)) return;
    if (checkedRef.current.has(machine.id)) return;

    const link = chatMachineLink(machine);
    const caps = link.capabilities();
    if (caps === null || !caps.includes('nativeModeSwitch')) {
      return;
    }

    let cancelled = false;
    checkedRef.current.add(machine.id);

    void (async () => {
      const seen = await readSeenMachines();
      if (cancelled || seen[machine.id] === true) return;

      // Skip automatically if Native mode is already enabled on desktop for this computer.
      try {
        const read = await link.rpc('readSharedSettings', {}, 8_000);
        if (cancelled) return;
        if (read.error !== null) {
          checkedRef.current.delete(machine.id);
          return;
        }
        const settings = (read.result as { settings?: unknown })?.settings;
        const modes = extractAgentSessionModes(settings);
        const alreadyOn = NATIVE_FAMILIES.some((family) => modes[family] === 'non-cli');
        if (alreadyOn) {
          await markMachineSeen(machine.id);
          return;
        }
        if (!cancelled) {
          setTarget(machine);
        }
      } catch {
        checkedRef.current.delete(machine.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canPresent, handshakeTick, machine]);

  const dismiss = useCallback(() => {
    if (target === null || busy) return;
    const machineId = target.id;
    setTarget(null);
    void markMachineSeen(machineId);
  }, [busy, target]);

  const turnOn = useCallback(() => {
    if (target === null || busy) return;
    const current = target;
    setBusy(true);
    void (async () => {
      try {
        const link = chatMachineLink(current);
        let modes: Record<string, string> = {};
        try {
          const read = await link.rpc('readSharedSettings', {}, 8_000);
          if (read.error === null) {
            modes = { ...extractAgentSessionModes((read.result as { settings?: unknown })?.settings) };
          }
        } catch {
          modes = {};
        }
        for (const family of NATIVE_FAMILIES) {
          modes[family] = 'non-cli';
        }
        const answer = await link.rpc(
          'dispatchRendererCommand',
          {
            action: 'updateSettingsPatch',
            payload: {
              patch: { agentSessionMode: modes },
              source: 'mobile:nativeModeAnnounce',
            },
          },
          10_000,
        );
        if (answer.error !== null) {
          onError(answer.error.message || 'Could not reach this computer to turn on Native mode.');
          return;
        }
        const computerLabel = machineName || current.host;
        let summary = `Native mode is on for new chats on ${computerLabel}.`;
        try {
          const switched = await link.rpc(
            'switchEligibleSessionsToAcp',
            { source: 'bulk_modal', client: 'mobile' },
            45_000,
          );
          if (switched.error === null) {
            const payload = (switched.result ?? {}) as {
              completed?: unknown;
              totalEligible?: unknown;
              switched?: unknown;
              skippedBusy?: unknown;
              skippedWorking?: unknown;
              skippedThreads?: unknown;
              skippedCannotResume?: unknown;
              failed?: unknown;
            };
            const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
            const busyCount =
              typeof payload.skippedBusy === 'number' ? num(payload.skippedBusy) : num(payload.skippedWorking);
            summary = formatBulkSwitchSummary(
              {
                completed: payload.completed !== false,
                totalEligible: num(payload.totalEligible),
                switched: num(payload.switched),
                skippedBusy: busyCount,
                skippedThreads: num(payload.skippedThreads),
                failed: num(payload.failed) + num(payload.skippedCannotResume),
              },
              computerLabel,
            );
          }
        } catch {
          // Older servers without bulk switch still keep Native mode enabled for new chats.
        }
        await markMachineSeen(current.id);
        setTarget(null);
        onEnabled(summary);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, machineName, onEnabled, onError, target]);

  return (
    <BottomSheet visible={target !== null} onClose={dismiss}>
      <View style={styles.wrap}>
        <View style={styles.headRow}>
          <View style={styles.iconTile}>
            <ComposerGlyph name="bolt" size={16} color={appearance.foreground} />
          </View>
          <Text style={styles.title}>Meet Native mode</Text>
        </View>
        <Text style={styles.body}>
          Claude Code, Codex, Antigravity, OpenCode, Pi, OMP, Hermes Agent, Cursor CLI and Grok Build now run natively for faster mobile chat and live approvals.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={dismiss}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Later"
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed ? styles.btnNeutralPressed : null]}
          >
            <Text style={styles.btnNeutralLabel}>Later</Text>
          </Pressable>
          <Pressable
            onPress={turnOn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Turn on"
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              busy ? styles.btnDisabled : null,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            <Text style={styles.btnPrimaryLabel}>{busy ? 'Turning on…' : 'Turn on'}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    wrap: {
      gap: 12,
      paddingTop: 2,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconTile: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: appearance.border,
      backgroundColor: appearance.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 16.5,
      fontWeight: '600',
      color: appearance.foreground,
    },
    body: {
      fontSize: 13.5,
      lineHeight: 19.5,
      color: appearance.muted,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 4,
    },
    btn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    btnNeutral: {
      backgroundColor: appearance.neutralFill,
    },
    btnNeutralPressed: {
      backgroundColor: appearance.neutralFillPressed,
    },
    btnPrimary: {
      backgroundColor: appearance.primaryFill,
    },
    btnPrimaryPressed: {
      backgroundColor: appearance.primaryFillPressed,
    },
    btnNeutralLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.foreground,
    },
    btnPrimaryLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.foreground,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  });
