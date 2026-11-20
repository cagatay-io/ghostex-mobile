/**
 * The live card for a connected computer's approval request (CDXC:Security 2026-11-20 in
 * `security/approvalAlerts.ts`): it floats at the bottom of whatever screen is open, names the
 * computer and the plain question, and opens that computer's Approvals.
 */
import { useEffect, useMemo } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { navigationRef } from '../../app/deepLinks';
import { ApprovalAlertCopy } from '../../copy';
import { machineDisplayLabel, useMachinesStore } from '../../machines/store';
import { dismissApprovalAlert, pruneLapsedApprovalAlerts, useApprovalAlerts } from '../../security/approvalAlerts';
import { plainAsk } from '../../security/plainAsk';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

export default function ApprovalAlerts() {
  const alerts = useApprovalAlerts((state) => state.alerts);
  const machines = useMachinesStore((state) => state.machines);
  const insets = useSafeAreaInsets();
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  // A request that lapsed while its expiry event was missed (the socket dropped) leaves the store
  // on its own; Hide and Open drop the card at once (`dismissApprovalAlert`).
  useEffect(() => {
    if (alerts.length === 0) return;
    pruneLapsedApprovalAlerts();
    const timer = setInterval(() => pruneLapsedApprovalAlerts(), 15_000);
    return () => clearInterval(timer);
  }, [alerts.length]);
  const live = alerts;
  const alert = live[live.length - 1];
  if (alert === undefined) return null;
  const record = machines.find((machine) => machine.id === alert.machineId);
  const computer = record !== undefined ? machineDisplayLabel(record) : ApprovalAlertCopy.aComputer;
  const ask = plainAsk(alert.request, computer);
  const open = () => {
    dismissApprovalAlert(alert.machineId, alert.request.id);
    if (navigationRef.isReady()) navigationRef.navigate('Approvals', { machineId: alert.machineId });
  };
  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: insets.bottom + 12 }]}>
      <View style={styles.card} accessibilityRole="alert" testID="approval-alert">
        <Text style={styles.title}>{ApprovalAlertCopy.title(computer)}</Text>
        <Text style={styles.body}>{ask?.question ?? alert.request.summary}</Text>
        {ask !== null && ask.words.length > 0 && <Text style={styles.words}>{ask.words.join(' · ')}</Text>}
        {live.length > 1 && <Text style={styles.more}>{ApprovalAlertCopy.more(live.length - 1)}</Text>}
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => dismissApprovalAlert(alert.machineId, alert.request.id)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            testID="approval-alert-hide"
          >
            <Text style={styles.buttonLabel}>{ApprovalAlertCopy.hide}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={open}
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.primaryPressed]}
            testID="approval-alert-open"
          >
            <Text style={[styles.buttonLabel, styles.primaryLabel]}>{ApprovalAlertCopy.open}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(appearance: Appearance) {
  return StyleSheet.create({
    layer: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 12 },
    card: {
      borderRadius: 14,
      padding: 14,
      gap: 6,
      backgroundColor: appearance.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: appearance.border,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    title: { fontSize: 15, fontWeight: '600', color: appearance.foreground },
    body: { fontSize: 14, lineHeight: 19, color: appearance.foreground },
    words: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: appearance.foreground, textAlign: 'center' },
    more: { fontSize: 12, lineHeight: 16, color: appearance.muted },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
    button: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: appearance.neutralFill },
    buttonPressed: { backgroundColor: appearance.neutralFillPressed },
    buttonLabel: { fontSize: 14, fontWeight: '600', color: appearance.foreground },
    primary: { backgroundColor: appearance.foreground },
    primaryPressed: { opacity: 0.8 },
    primaryLabel: { color: appearance.card },
  });
}
