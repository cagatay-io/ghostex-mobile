/**
 * The usage of a computer's Claude and Codex accounts, in a usage pane and full screen: the chat
 * Accounts panel's head ("Accounts & limits" and Refresh) and, per saved account, its logo, name and email over its
 * meters, three to a line as the panel draws them (`usageLines`): the window's name and percent over a thin bar and
 * "↻" with the time to its reset. A login without usage says "Usage is unavailable for this login." instead of bars
 * (no bar at 0 %); what the computer says about reading it stands above (the panel's `usageError`).
 *
 * The usage is read when the view opens, again every 30 seconds while it stays open (the chat's accounts poll; the
 * computer answers from its last reading while that is under two minutes old) and on Refresh, which asks for a fresh
 * reading. One read at a time: while an answer is out (a computer may take up to a minute), the next poll waits for it
 * rather than replacing it, so a slow answer and a failure show when they come. A read that fails keeps what was shown
 * and says why above it. Open means mounted: in a pane while the terminal screen shows the panes (also under a screen
 * opened over it), full screen while the Usage screen is open.
 *
 * In a pane its rows keep off a book fold (`controlInset`) and it reaches no side bar; full screen it reaches under
 * the side bar and, half folded like a laptop, ends above the fold (`FoldListFrame`, `foldGap.tsx`), as the app's
 * other lists do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { COMMAND_ICONS } from '../assets/tablerIcons.generated';
import { usageLines, type UsageColumn } from '../chat/native/composer/accountUsage';
import { UNREACHABLE_MESSAGE } from '../chat/rust/machine-link';
import { FoldListFrame } from '../components/common/foldGap';
import { useLaptopFold } from '../components/common/verticalBar/laptopFold';
import { NO_BAR_INSETS } from '../components/common/verticalBar/layout';
import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { agentIconTint } from '../contract/mobileSummary';
import { UsageCopy } from '../copy';
import { machineDisplayLabel, useMachinesStore } from '../machines/store';
import type { PaneBarInset } from '../panes/geometry';
import { machineTargetFor } from '../screens/terminal-screen/session-lookups';
import { colorWithOpacity, GhostexPalette, GhostexRadii } from '../theme/palette';
import { readAccountUsage } from './client';
import type { UsageAccount } from './usageMeters';

/** How often the usage is read again while the view is open: the chat Accounts panel's poll. */
const READ_EVERY_MS = 30_000;
const PADDING = 12;

export type UsagePlacement = { kind: 'pane'; controlInset: PaneBarInset } | { kind: 'screen' };

type Reading = {
  /** Null until the first answer. */
  readonly accounts: readonly UsageAccount[] | null;
  /** The last read's failure, in the computer's or the route's words. */
  readonly error: string | null;
  readonly busy: boolean;
};

export default function UsageView({ machineId, placement }: { machineId: string; placement: UsagePlacement }) {
  const record = useMachinesStore((state) => state.machines.find((machine) => machine.id === machineId) ?? null);
  const computer = record === null ? machineId : machineDisplayLabel(record);
  const known = record !== null;
  const [reading, setReading] = useState<Reading>({ accounts: null, error: null, busy: known });
  // Only a read of this view's current computer may change what is shown; none after the view is gone.
  const latest = useRef(0);
  // An answer is out: a poll meanwhile starts no other read.
  const answerOut = useRef(false);

  const read = useCallback(
    (refresh: boolean) => {
      const machine = machineTargetFor(machineId);
      if (machine === null || answerOut.current) return;
      latest.current += 1;
      const ticket = latest.current;
      answerOut.current = true;
      setReading((current) => ({ ...current, busy: true }));
      readAccountUsage(machine, refresh).then(
        (accounts) => {
          if (ticket !== latest.current) return;
          answerOut.current = false;
          setReading({ accounts, error: null, busy: false });
        },
        (error: unknown) => {
          if (ticket !== latest.current) return;
          answerOut.current = false;
          const message = error instanceof Error ? error.message : String(error);
          setReading((current) => ({ accounts: current.accounts, error: message, busy: false }));
        },
      );
    },
    [machineId],
  );

  useEffect(() => {
    read(false);
    const timer = setInterval(() => read(false), READ_EVERY_MS);
    return () => {
      clearInterval(timer);
      // The computer changed or the view is gone: the answer out is not this view's any more.
      latest.current += 1;
      answerOut.current = false;
    };
  }, [read]);

  const inPane = placement.kind === 'pane';
  const laptopFold = useLaptopFold();
  const edges = useScrollToBarEdges(styles.content, inPane ? NO_BAR_INSETS : null);
  const inset = inPane ? placement.controlInset : NO_BAR_INSETS;
  const error = known ? reading.error : UNREACHABLE_MESSAGE;
  const { accounts, busy } = reading;

  return (
    <FoldListFrame fold={inPane ? null : laptopFold}>
      <ScrollView
        style={[styles.scroll, edges.scroll]}
        contentContainerStyle={[
          styles.content,
          edges.content,
          inPane && { paddingLeft: PADDING + inset.left, paddingRight: PADDING + inset.right },
        ]}
      >
        <View style={styles.head}>
          <Text style={styles.headTitle} accessibilityRole="header">
            {UsageCopy.head}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={UsageCopy.refresh}
            accessibilityState={{ busy, disabled: busy || !known }}
            disabled={busy || !known}
            hitSlop={4}
            onPress={() => read(true)}
            style={({ pressed }) => [styles.refresh, pressed && styles.pressed, (busy || !known) && styles.dim]}
          >
            <COMMAND_ICONS.refresh size={17} color={GhostexPalette.FOREGROUND} />
          </Pressable>
        </View>
        {error !== null ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.paragraph}>{error}</Text>
          </View>
        ) : null}
        {accounts === null && error === null ? (
          <View style={styles.pending}>
            <ActivityIndicator size="small" color={GhostexPalette.MUTED} accessibilityLabel={UsageCopy.loading} />
          </View>
        ) : null}
        {accounts !== null && accounts.length === 0 ? (
          <Text style={styles.paragraph}>{UsageCopy.noAccounts(computer)}</Text>
        ) : null}
        {accounts?.map((account) => (
          <AccountSection key={`${account.provider}:${account.id}`} account={account} />
        ))}
      </ScrollView>
    </FoldListFrame>
  );
}

function AccountSection({ account }: { account: UsageAccount }) {
  const Icon = AGENT_ICONS[account.provider];
  return (
    <View style={styles.account}>
      <View style={styles.nameLine}>
        {Icon !== undefined ? <Icon size={16} color={agentIconTint(account.provider)} /> : null}
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {account.email}
        </Text>
      </View>
      {account.usageError.length > 0 ? <Text style={styles.paragraph}>{account.usageError}</Text> : null}
      {account.unavailable ? (
        <Text style={styles.paragraph}>{UsageCopy.unavailable}</Text>
      ) : (
        <View style={styles.meters}>
          {usageLines([...account.meters]).map((line, lineIndex) => (
            <View key={lineIndex} style={styles.meterLine}>
              {line.map((meter, index) =>
                meter === null ? <View key={index} style={styles.meter} /> : <Meter key={index} meter={meter} />,
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Meter({ meter }: { meter: UsageColumn }) {
  return (
    <View style={styles.meter} accessible accessibilityLabel={UsageCopy.meter(meter.name, meter.value, meter.resetIn)}>
      <View style={styles.meterHead}>
        <Text style={styles.meterName} numberOfLines={1}>
          {meter.name}
        </Text>
        <Text style={styles.meterValue}>{meter.value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${meter.percent}%` }]} />
      </View>
      {meter.resetIn.length > 0 ? (
        <Text style={styles.meterReset} numberOfLines={1}>
          {UsageCopy.resetIn(meter.resetIn)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
  content: { padding: PADDING, gap: 12, paddingBottom: 28 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 4 },
  headTitle: { color: GhostexPalette.FOREGROUND, fontSize: 16, fontWeight: '600' },
  refresh: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: GhostexPalette.CARD_ACTIVE },
  dim: { opacity: 0.45 },
  alert: {
    padding: 12,
    borderRadius: GhostexRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GhostexPalette.BORDER,
  },
  pending: { alignItems: 'center', paddingVertical: 16 },
  paragraph: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 18 },
  account: { gap: 10, padding: 12, borderRadius: GhostexRadii.section, backgroundColor: GhostexPalette.CARD },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  name: { color: GhostexPalette.FOREGROUND, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  email: { flex: 1, minWidth: 0, color: GhostexPalette.MUTED, fontSize: 12 },
  meters: { gap: 8 },
  meterLine: { flexDirection: 'row', gap: 14 },
  meter: { flex: 1, minWidth: 0, gap: 4 },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  meterName: { flexShrink: 1, color: GhostexPalette.MUTED, fontSize: 12, lineHeight: 15, fontWeight: '500' },
  meterValue: { color: GhostexPalette.FOREGROUND, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  meterReset: { color: GhostexPalette.MUTED, fontSize: 11, lineHeight: 13 },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colorWithOpacity(GhostexPalette.MUTED, 24),
  },
  fill: { height: '100%', borderRadius: 2, backgroundColor: GhostexPalette.FOREGROUND },
});
