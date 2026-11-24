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
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import BottomSheet from '../common/BottomSheet';

const SEEN_STORAGE_KEY = 'ghostex.nativeModeAnnounceSeen.v1';
const NATIVE_FAMILIES = ['antigravity', 'claude', 'codex'] as const;

function formatBulkSwitchSummary(switched: number, deferred: number, computerName: string): string {
  const plural = (count: number) => (count === 1 ? 'chat' : 'chats');
  if (switched > 0 && deferred > 0) {
    return `Switched ${switched} ${plural(switched)}; ${deferred} will switch when they finish or reload.`;
  }
  if (switched > 0) {
    return `Switched ${switched} ${plural(switched)} to Native mode. New chats will use Native.`;
  }
  if (deferred > 0) {
    return `Native mode is on for new chats. ${deferred} active ${plural(deferred)} will switch when they finish or reload.`;
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
        const settings = (read.result as { settings?: { agentSessionMode?: Record<string, unknown> } })?.settings;
        const modes = settings?.agentSessionMode;
        const alreadyOn =
          modes !== null &&
          modes !== undefined &&
          typeof modes === 'object' &&
          NATIVE_FAMILIES.some((family) => modes[family] === 'non-cli');
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
          const rawModes =
            read.error === null
              ? (read.result as { settings?: { agentSessionMode?: Record<string, unknown> } })?.settings
                  ?.agentSessionMode
              : null;
          if (rawModes !== null && typeof rawModes === 'object' && !Array.isArray(rawModes)) {
            for (const [k, v] of Object.entries(rawModes)) {
              if (v === 'non-cli' || v === 'agent-cli') modes[k] = v;
            }
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
          const switched = await link.rpc('switchEligibleSessionsToAcp', {}, 60_000);
          if (switched.error === null) {
            const payload = (switched.result ?? {}) as { switched?: unknown; deferred?: unknown };
            const switchedCount = typeof payload.switched === 'number' ? payload.switched : 0;
            const deferredCount = typeof payload.deferred === 'number' ? payload.deferred : 0;
            summary = formatBulkSwitchSummary(switchedCount, deferredCount, computerLabel);
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
          Claude Code, Codex and Antigravity now run natively for faster mobile chat and live approvals.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={dismiss}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Later"
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed ? styles.btnPressed : null]}
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
              pressed ? styles.btnPressed : null,
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
      borderWidth: 1,
      borderColor: appearance.border,
    },
    btnPrimary: {
      backgroundColor: appearance.foreground,
    },
    btnNeutralLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.foreground,
    },
    btnPrimaryLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.background,
    },
    btnPressed: {
      opacity: 0.8,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  });
