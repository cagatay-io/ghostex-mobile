/**
 * Approvals (GitHub #495): the requests waiting on a computer for its owner (an agent asking to
 * turn on Easy Connect, connect a computer, answer another session's prompt…). Approve signs the
 * request with this phone's approver key after Face ID / the fingerprint / the screen lock; Deny
 * needs no prompt. The list refreshes while the screen is open.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SetupButton } from '../components/onboarding/SetupPrimitives';
import { ApprovalsCopy } from '../copy';
import { machineDisplayLabel, useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import type { ApprovalRequest } from '../security/approvalPayload';
import { approveRequest, denyRequest, listApprovals } from '../security/approvals';
import { hasApproverKey } from '../security/approverKey';
import { plainAsk } from '../security/plainAsk';
import { useAppearance, type Appearance } from '../theme/useAppearance';

type Props = NativeStackScreenProps<RootStackParamList, 'Approvals'>;

const REFRESH_MS = 3_000;

/*
CDXC:RemotePairing 2026-11-16 DECISION:
User, on the Connect a Computer gaps page ("Fix all"): the desktop's approval card shows a pairing's three words as three big boxes, but this list showed them only inside gxserver's long sentence ("…the same three words: a · b · c. Approving lets…"). A pairing request's words are read out of that sentence and drawn as three boxes above it; any other request, or a sentence worded otherwise, shows as before.
*/
function pairingWords(detail: string | undefined): string[] | null {
  const match = detail?.match(/three words: ([^.]+)\./);
  if (!match) return null;
  const words = match[1]
    .split('·')
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  return words.length === 3 ? words : null;
}

export default function ApprovalsScreen({ navigation, route }: Props) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const { machineId } = route.params;
  const machine = useMachinesStore((state) => state.machines.find((record) => record.id === machineId) ?? null);
  const computer = machine === null ? machineId : machineDisplayLabel(machine);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: ApprovalsCopy.title(computer) });
  }, [navigation, computer]);

  const refresh = useCallback(async () => {
    if (machine === null) return;
    try {
      setRequests(await listApprovals(machine));
      setError(null);
    } catch (failure) {
      setError(`${ApprovalsCopy.loadFailed}: ${(failure as Error).message}`);
    }
  }, [machine]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const decide = async (request: ApprovalRequest, approve: boolean) => {
    if (machine === null) return;
    setBusy(request.id);
    setNotice(null);
    try {
      if (approve) {
        await approveRequest(machine, request, () => setNotice(ApprovalsCopy.waitingForComputer(computer)));
      } else {
        await denyRequest(machine, request.id);
      }
      setNotice(null);
    } catch (failure) {
      setNotice(`${approve ? ApprovalsCopy.notApproved : ApprovalsCopy.couldNotDeny}: ${(failure as Error).message}`);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!hasApproverKey() ? <Text style={styles.notice}>{ApprovalsCopy.updateApp}</Text> : null}
        {notice !== null ? <Text style={styles.notice}>{notice}</Text> : null}
        {error !== null ? <Text style={styles.notice}>{error}</Text> : null}
        {requests.length === 0 && error === null ? <Text style={styles.empty}>{ApprovalsCopy.empty}</Text> : null}
        {requests.map((request) => {
          // The question the computer's own card asks (`security/plainAsk.ts`); a request it
          // doesn't know keeps gxserver's sentence, who asked and its words.
          const ask = plainAsk(request, computer);
          const words = ask !== null ? (ask.words.length > 0 ? ask.words : null) : pairingWords(request.detail);
          return (
          <View key={request.id} style={styles.card}>
            <Text style={styles.summary}>{ask?.question ?? request.summary}</Text>
            {ask === null ? (
              <Text style={styles.meta}>{ApprovalsCopy.askedBy(request.requestedBy.label || request.requestedBy.kind)}</Text>
            ) : ask.body !== null ? (
              <Text style={styles.meta}>{ask.body}</Text>
            ) : null}
            {words !== null ? (
              <View style={styles.words}>
                {words.map((word) => (
                  <View key={word} style={styles.word}>
                    <Text style={styles.wordText}>{word}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {ask === null && request.detail ? <Text style={styles.meta}>{request.detail}</Text> : null}
            {ask?.check ? <Text style={styles.meta}>{ask.check}</Text> : null}
            {/* Deny, then Approve, as on the computer (the approval cards page). */}
            <View style={styles.buttons}>
              <SetupButton
                small
                label={ApprovalsCopy.deny}
                disabled={busy !== null}
                onPress={() => void decide(request, false)}
              />
              <SetupButton
                small
                variant="primary"
                label={ApprovalsCopy.approve}
                busy={busy === request.id}
                disabled={busy !== null || !hasApproverKey()}
                onPress={() => void decide(request, true)}
              />
            </View>
          </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: appearance.background },
    content: { padding: 16, gap: 12 },
    card: { borderRadius: 12, padding: 14, gap: 6, backgroundColor: appearance.card },
    summary: { fontSize: 16, fontWeight: '600', color: appearance.foreground },
    meta: { fontSize: 13, color: appearance.muted },
    words: { flexDirection: 'row', gap: 8, marginVertical: 6 },
    word: {
      flex: 1,
      minWidth: 0,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: appearance.muted,
    },
    wordText: { fontSize: 18, fontWeight: '600', color: appearance.foreground },
    buttons: { flexDirection: 'row', gap: 8, marginTop: 6 },
    empty: { fontSize: 15, color: appearance.muted, textAlign: 'center', marginTop: 32 },
    notice: { fontSize: 14, color: appearance.foreground },
  });
