/**
 * CLIProxyAPI status screen (JS-only, ships over the air): shows the picked computer's CLIProxyAPI hubs,
 * their connection health, session affinity (prompt caching) state, and each pooled Claude and Codex account's
 * status, cooldown countdown, and usage meters.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { COMMAND_ICONS } from '../assets/tablerIcons.generated';
import { UsageRow } from '../chat/native/composer/AccountsPanel';
import ActionSheet from '../components/common/ActionSheet';
import { CliProxyCopy } from '../copy';
import { isMachineEnabled, machineDisplayLabel, useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { machineTargetFor } from '../screens/terminal-screen/session-lookups';
import { GhostexRadii } from '../theme/palette';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import { usageProviderIconColor, usageProviderIconId, usageProviderLabel } from '../usage/usageMeters';

import {
  formatCooldownReset,
  readCliProxyStatus,
  resetHubAccountCooldown,
  type CliProxyHub,
  type CliProxyHubAccount,
  type CliProxyStatusData,
} from './cliproxyClient';

const POLL_EVERY_MS = 30_000;
const STATUS_AMBER = { dark: '#fcd34d', light: '#b45309' } as const;
const STATUS_GOOD = { dark: '#4ade80', light: '#15803d' } as const;

export type CliProxyReading =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'failed'; message: string }
  | { kind: 'loaded'; data: CliProxyStatusData };

type Props = NativeStackScreenProps<RootStackParamList, 'CliProxyStatus'>;

export default function CliProxyStatusScreen({ navigation, route }: Props) {
  const appearance = useAppearance();
  const all = useMachinesStore((state) => state.machines);
  const machines = useMemo(() => all.filter(isMachineEnabled), [all]);
  const initialMachine = route.params?.machineId ?? machines[0]?.id ?? '';
  const [machineId, setMachineId] = useState(initialMachine);
  const record = machines.find((machine) => machine.id === machineId) ?? null;
  const computer = record === null ? machineId || CliProxyCopy.unknownComputer : machineDisplayLabel(record);
  const [reading, setReading] = useState<CliProxyReading>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [resettingAccountId, setResettingAccountId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [probes, setProbes] = useState<Record<string, string>>({});
  const ticket = useRef(0);

  useLayoutEffect(() => {
    navigation.setOptions({ title: CliProxyCopy.title });
  }, [navigation]);

  const read = useCallback(
    (forceRefresh: boolean) => {
      const machine = machineTargetFor(machineId);
      ticket.current += 1;
      const mine = ticket.current;
      if (machine === null) {
        setRefreshing(false);
        setReading({ kind: 'unreachable' });
        return;
      }
      if (forceRefresh) setRefreshing(true);
      void readCliProxyStatus(machine, forceRefresh).then((answer) => {
        if (mine !== ticket.current) return;
        setRefreshing(false);
        if (answer.ok) {
          setActionError(null);
          setReading({ kind: 'loaded', data: answer.value });
        } else {
          setReading(answer.unreachable ? { kind: 'unreachable' } : { kind: 'failed', message: answer.message });
        }
      });
    },
    [machineId],
  );

  useEffect(() => {
    setReading({ kind: 'loading' });
    setActionError(null);
    read(false);
    const timer = setInterval(() => read(false), POLL_EVERY_MS);
    return () => {
      clearInterval(timer);
      ticket.current += 1;
    };
  }, [machineId, read]);

  const onResetCooldown = useCallback(
    (accountId: string) => {
      const machine = machineTargetFor(machineId);
      if (machine === null || resettingAccountId !== null) return;
      setResettingAccountId(accountId);
      setActionError(null);
      void resetHubAccountCooldown(machine, accountId).then((answer) => {
        setResettingAccountId(null);
        if (!answer.ok) {
          setActionError(answer.message);
          return;
        }
        read(true);
      });
    },
    [machineId, read, resettingAccountId],
  );

  useEffect(() => {
    if (!picking) return undefined;
    let live = true;
    for (const machine of machines) {
      const target = machineTargetFor(machine.id);
      if (target === null) continue;
      void readCliProxyStatus(target, false).then((answer) => {
        if (!live) return;
        let detail: string;
        if (!answer.ok) detail = CliProxyCopy.cantReachShort;
        else if (!answer.value.enabled) detail = CliProxyCopy.extensionOffShort;
        else detail = CliProxyCopy.hubCount(answer.value.hubs.length);
        setProbes((known) => ({ ...known, [machine.id]: detail }));
      });
    }
    return () => {
      live = false;
    };
  }, [picking, machines]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: appearance.background }} edges={['bottom']}>
      <CliProxyStatusBody
        computer={computer}
        canPick={machines.length > 1}
        onPick={() => setPicking(true)}
        reading={reading}
        refreshing={refreshing}
        resettingAccountId={resettingAccountId}
        actionError={actionError}
        onRefresh={() => read(true)}
        onResetCooldown={onResetCooldown}
      />
      <ActionSheet
        visible={picking}
        title={CliProxyCopy.pickComputer}
        subtitle={CliProxyCopy.pickSubtitle}
        items={machines.map((machine) => ({
          key: machine.id,
          label: `${machine.id === machineId ? '✓ ' : ''}${machineDisplayLabel(machine)}`,
          detail: probes[machine.id] ?? CliProxyCopy.asking,
          onPress: () => {
            setPicking(false);
            setMachineId(machine.id);
          },
        }))}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

/** Pure presentational body for the CLIProxyAPI status screen. */
export function CliProxyStatusBody({
  computer,
  canPick,
  onPick,
  reading,
  refreshing,
  resettingAccountId,
  actionError,
  onRefresh,
  onResetCooldown,
}: {
  computer: string;
  canPick: boolean;
  onPick: () => void;
  reading: CliProxyReading;
  refreshing: boolean;
  resettingAccountId: string | null;
  actionError: string | null;
  onRefresh: () => void;
  onResetCooldown: (accountId: string) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const amber = appearance.light ? STATUS_AMBER.light : STATUS_AMBER.dark;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CliProxyCopy.computerLabel(computer)}
          disabled={!canPick}
          onPress={onPick}
          style={({ pressed }) => [styles.computer, pressed && styles.pressed]}
        >
          <COMMAND_ICONS.server size={18} color={appearance.foreground} />
          <View style={styles.computerText}>
            <Text style={styles.computerTitle} numberOfLines={1}>
              {CliProxyCopy.computerLabel(computer)}
            </Text>
            <Text style={styles.paragraph}>{CliProxyCopy.computerDescription}</Text>
          </View>
          {canPick ? <Text style={styles.chevron}>⌄</Text> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CliProxyCopy.refresh}
          disabled={refreshing || reading.kind === 'loading'}
          onPress={onRefresh}
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && styles.pressed,
            (refreshing || reading.kind === 'loading') && styles.dim,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={appearance.foreground} />
          ) : (
            <COMMAND_ICONS.refresh size={18} color={appearance.foreground} />
          )}
        </Pressable>
      </View>

      {actionError !== null ? (
        <View style={styles.alertCard} accessibilityRole="alert">
          <Text style={styles.body}>{actionError}</Text>
        </View>
      ) : null}

      {reading.kind === 'loading' ? (
        <View style={styles.pending}>
          <ActivityIndicator size="small" color={appearance.muted} />
          <Text style={styles.paragraph}>{CliProxyCopy.loading(computer)}</Text>
        </View>
      ) : null}

      {reading.kind === 'unreachable' ? (
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.body}>{CliProxyCopy.unreachable(computer)}</Text>
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onRefresh} style={styles.quietButton}>
            <Text style={styles.quietLabel}>{CliProxyCopy.tryAgain}</Text>
          </Pressable>
        </View>
      ) : null}

      {reading.kind === 'failed' ? (
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.body}>{reading.message}</Text>
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onRefresh} style={styles.quietButton}>
            <Text style={styles.quietLabel}>{CliProxyCopy.tryAgain}</Text>
          </Pressable>
        </View>
      ) : null}

      {reading.kind === 'loaded' && !reading.data.enabled ? (
        <View style={styles.card}>
          <Text style={styles.strong}>{CliProxyCopy.extensionOffTitle(computer)}</Text>
          <Text style={styles.paragraph}>{CliProxyCopy.extensionOffBody}</Text>
          <Text style={styles.paragraph}>{CliProxyCopy.multiMachineNote}</Text>
          <View style={[styles.warningBox, { borderColor: amber }]}>
            <Text style={[styles.warningTitle, { color: amber }]}>{CliProxyCopy.warningTitle}</Text>
            <Text style={styles.paragraph}>{CliProxyCopy.warningBody}</Text>
          </View>
        </View>
      ) : null}

      {reading.kind === 'loaded' && reading.data.enabled && reading.data.hubs.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.strong}>{CliProxyCopy.noHubsTitle}</Text>
          <Text style={styles.paragraph}>{CliProxyCopy.noHubsBody(computer)}</Text>
        </View>
      ) : null}

      {reading.kind === 'loaded' && reading.data.enabled
        ? reading.data.hubs.map((hub) => (
            <HubStatusCard
              key={hub.id}
              hub={hub}
              resettingAccountId={resettingAccountId}
              onResetCooldown={onResetCooldown}
            />
          ))
        : null}
    </ScrollView>
  );
}

function HubStatusCard({
  hub,
  resettingAccountId,
  onResetCooldown,
}: {
  hub: CliProxyHub;
  resettingAccountId: string | null;
  onResetCooldown: (accountId: string) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const goodColor = appearance.light ? STATUS_GOOD.light : STATUS_GOOD.dark;
  const amberColor = appearance.light ? STATUS_AMBER.light : STATUS_AMBER.dark;

  const readyCount = hub.accounts.filter((a) => a.status === 'ready').length;
  const coolingCount = hub.accounts.filter((a) => a.status === 'coolingDown').length;

  const statusMeta =
    hub.status === 'ready'
      ? { label: CliProxyCopy.statusReady, color: goodColor }
      : hub.status === 'unavailable'
        ? { label: CliProxyCopy.statusUnavailable, color: amberColor }
        : hub.status === 'noManagementKey'
          ? { label: CliProxyCopy.statusNoManagementKey, color: appearance.muted }
          : { label: CliProxyCopy.statusLoading, color: appearance.muted };

  const summaryParts: string[] = [];
  if (hub.hasManagementKey) {
    summaryParts.push(CliProxyCopy.readyCount(readyCount));
    if (coolingCount > 0) summaryParts.push(CliProxyCopy.coolingCount(coolingCount));
  }
  if (hub.sessionAffinity !== null) {
    summaryParts.push(
      hub.sessionAffinity ? CliProxyCopy.sessionAffinityOn : CliProxyCopy.sessionAffinityOff,
    );
  }
  if (hub.routingStrategy.length > 0) {
    summaryParts.push(hub.routingStrategy);
  }

  return (
    <View style={styles.card}>
      <View style={styles.hubHead}>
        <COMMAND_ICONS.server size={18} color={appearance.foreground} />
        <View style={styles.hubHeadText}>
          <Text style={styles.strong} numberOfLines={1}>
            {hub.label}
          </Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {hub.host || hub.url}
          </Text>
        </View>
        <View style={[styles.pill, { borderColor: statusMeta.color }]}>
          <View style={[styles.dot, { backgroundColor: statusMeta.color }]} />
          <Text style={[styles.pillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>
      </View>

      {summaryParts.length > 0 ? (
        <Text style={styles.metaText}>{summaryParts.join(' · ')}</Text>
      ) : null}

      {hub.error.length > 0 ? (
        <View style={[styles.warningBox, { borderColor: amberColor }]}>
          <Text style={styles.paragraph}>{hub.error}</Text>
        </View>
      ) : null}

      {!hub.hasManagementKey ? (
        <Text style={styles.paragraph}>{CliProxyCopy.noManagementKeyNote}</Text>
      ) : hub.accounts.length === 0 ? (
        <Text style={styles.paragraph}>{CliProxyCopy.noAccountsOnHub}</Text>
      ) : (
        <View style={styles.accountList}>
          {hub.accounts.map((account) => (
            <HubAccountRow
              key={account.id}
              account={account}
              resetting={resettingAccountId === account.id}
              onResetCooldown={
                account.status === 'coolingDown' && account.canManage
                  ? () => onResetCooldown(account.id)
                  : null
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

function HubAccountRow({
  account,
  resetting,
  onResetCooldown,
}: {
  account: CliProxyHubAccount;
  resetting: boolean;
  onResetCooldown: (() => void) | null;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const amberColor = appearance.light ? STATUS_AMBER.light : STATUS_AMBER.dark;
  const goodColor = appearance.light ? STATUS_GOOD.light : STATUS_GOOD.dark;

  const meterAppearance = useMemo(
    () => ({
      foreground: appearance.foreground,
      muted: appearance.muted,
      meterTrack: appearance.control,
      meterFill: appearance.accent,
    }),
    [appearance],
  );

  const iconId = usageProviderIconId(account.provider);
  const Icon = AGENT_ICONS[iconId];
  const iconColor = usageProviderIconColor(iconId, appearance.light, appearance.foreground);
  const retryText = formatCooldownReset(account.nextRetryAfter);

  const badge =
    account.status === 'coolingDown'
      ? {
          label: retryText !== null ? `${CliProxyCopy.coolingDown} · ${retryText}` : CliProxyCopy.coolingDown,
          color: amberColor,
        }
      : account.status === 'disabled'
        ? { label: CliProxyCopy.disabled, color: appearance.muted }
        : account.status === 'error'
          ? {
              label: account.requiresSignIn ? CliProxyCopy.needsSignIn : CliProxyCopy.error,
              color: amberColor,
            }
          : { label: CliProxyCopy.accountReady, color: goodColor };

  return (
    <View style={[styles.accountRow, account.status === 'disabled' && styles.dim]}>
      <View style={styles.accountLine}>
        {Icon !== undefined ? <Icon size={16} color={iconColor} /> : null}
        <View style={styles.accountNameCol}>
          <Text style={styles.accountName} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {[usageProviderLabel(account.provider), account.plan].filter((p) => p.length > 0).join(' · ')}
          </Text>
        </View>
        <Text style={[styles.statusLabel, { color: badge.color }]} numberOfLines={1}>
          {badge.label}
        </Text>
      </View>

      {account.meters.length > 0 ? (
        <UsageRow columns={account.meters} resets appearance={meterAppearance} />
      ) : null}

      {account.usageError.length > 0 ? <Text style={styles.paragraph}>{account.usageError}</Text> : null}
      {account.status !== 'ready' && account.statusMessage.length > 0 ? (
        <Text style={styles.paragraph}>{account.statusMessage}</Text>
      ) : null}

      {onResetCooldown !== null ? (
        <Pressable
          accessibilityRole="button"
          disabled={resetting}
          onPress={onResetCooldown}
          style={({ pressed }) => [styles.neutralButton, pressed && styles.neutralPressed, resetting && styles.dim]}
        >
          <Text style={styles.neutralLabel}>
            {resetting ? CliProxyCopy.clearingCooldown : CliProxyCopy.clearCooldown}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: appearance.background },
    content: { padding: 12, gap: 12, paddingBottom: 28 },
    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    computer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
    },
    computerText: { flex: 1, minWidth: 0, gap: 2 },
    computerTitle: { color: appearance.foreground, fontSize: 15, fontWeight: '600' },
    chevron: { color: appearance.muted, fontSize: 18 },
    refreshBtn: {
      width: 48,
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { backgroundColor: appearance.cardActive },
    dim: { opacity: 0.45 },
    pending: { alignItems: 'center', gap: 8, paddingVertical: 20 },
    card: { gap: 10, padding: 12, borderRadius: GhostexRadii.section, backgroundColor: appearance.card },
    alertCard: {
      padding: 12,
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: appearance.border,
    },
    strong: { color: appearance.foreground, fontSize: 14, fontWeight: '600' },
    body: { color: appearance.foreground, fontSize: 13, lineHeight: 18 },
    paragraph: { color: appearance.muted, fontSize: 13, lineHeight: 18 },
    metaText: { color: appearance.muted, fontSize: 12, lineHeight: 16 },
    hubHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hubHeadText: { flex: 1, minWidth: 0, gap: 2 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
      borderWidth: StyleSheet.hairlineWidth,
    },
    dot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '600' },
    warningBox: {
      gap: 4,
      padding: 10,
      borderRadius: GhostexRadii.control,
      borderWidth: StyleSheet.hairlineWidth,
    },
    warningTitle: { fontSize: 12, fontWeight: '600' },
    accountList: { gap: 8 },
    accountRow: {
      gap: 8,
      padding: 10,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.background,
    },
    accountLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    accountNameCol: { flex: 1, minWidth: 0, gap: 1 },
    accountName: { color: appearance.foreground, fontSize: 13, fontWeight: '600' },
    statusLabel: { fontSize: 11, fontWeight: '600', maxWidth: 160 },
    neutralButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.neutralFill,
    },
    neutralPressed: { backgroundColor: appearance.neutralFillPressed },
    neutralLabel: { color: appearance.foreground, fontSize: 12, fontWeight: '600' },
    quietButton: { alignSelf: 'flex-start', paddingVertical: 4 },
    quietLabel: { color: appearance.muted, fontSize: 13, fontWeight: '600' },
  });
