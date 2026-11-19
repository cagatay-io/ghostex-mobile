/**
 * Settings › Connection › Crash reports (iOS): the switch that keeps crash reports on the phone, then the reports kept,
 * newest first, each with its time and kind; a report opens on its own screen (CrashReportScreen.tsx). Delete All and
 * turning the switch off while reports are kept ask first, in the app's confirm dialog; both delete every report.
 * While keeping is off the page shows no list. Where the installed app cannot stop keeping reports
 * (`crashReportsKept === null`), the switch is not shown, so nothing promises an off that would not hold.
 */

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logAppEvent } from '../../app/appLog';
import { describeError, refreshCrashReportList, useCrashReportListStore } from '../../app/crashReports';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { CrashReportsSettingsCopy as Copy } from '../../copy/crashReports';
import { crashKindLabel, crashWhenLabel } from '../../feedback/crashReports';
import type { RootStackParamList } from '../../navigation/types';
import { useSettingsStore } from '../../settings/store';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import {
  answerStep,
  DELETE_ALL_STEP,
  keepSwitchStep,
  runCrashReportsChange,
  type CrashReportsChange,
  type CrashReportsDialog,
  type CrashReportsStep,
} from './crashReportsFlow';
import { Caption, LinkRow, NoticeCard, SectionHeader, SettingsScreenLayout, ToggleRow } from './SettingsControls';

/** How long a failure note stays under the switch, as long as the Share button's "Couldn't share". */
const FAILURE_NOTE_MS = 3000;

export default function CrashReportsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const kept = useSettingsStore((state) => state.crashReportsKept);
  const status = useCrashReportListStore((state) => state.status);
  const reports = useCrashReportListStore((state) => state.reports);
  const [dialog, setDialog] = useState<CrashReportsDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const failedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read again each time the page shows: Send Bug / Feedback deletes a report it sent, and a report opened from
  // here may have been deleted. A failed read shows as such (`status`) and is logged by the store.
  useFocusEffect(
    useCallback(() => {
      void refreshCrashReportList();
    }, []),
  );
  useEffect(
    () => () => {
      if (failedTimer.current !== null) clearTimeout(failedTimer.current);
    },
    [],
  );

  /**
   * Runs one change at a time (no second tap while it runs), then reads the list again. A failure is logged; one that
   * should have deleted reports also says so under the switch for a moment, and the reports still kept stay listed.
   * The switch itself always shows what the phone holds (`setCrashReportsKept` reads it back).
   */
  const run = (change: CrashReportsChange): void => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    runCrashReportsChange(change)
      .catch((error: unknown) => {
        logAppEvent(`Crash reports: ${change} failed (${describeError(error)})`);
        if (change === 'keepOn') return;
        setFailed(true);
        if (failedTimer.current !== null) clearTimeout(failedTimer.current);
        failedTimer.current = setTimeout(() => setFailed(false), FAILURE_NOTE_MS);
      })
      .finally(() => {
        setBusy(false);
        void refreshCrashReportList();
      });
  };

  /** Asks in the confirm dialog, runs a change, or does nothing (crashReportsFlow.ts decides which). */
  const take = (step: CrashReportsStep): void => {
    if (step === null) return;
    if ('ask' in step) setDialog(step.ask);
    else run(step.run);
  };

  const answer = (confirmed: boolean): void => {
    const asked = dialog;
    setDialog(null);
    if (asked !== null) take(answerStep(asked, confirmed));
  };

  // Off with nothing left: the page says so instead of a list. A report that turning off could not delete stays listed.
  const keptOff = kept === false && reports.length === 0;
  const askedDialog = dialog === 'deleteAll' ? Copy.confirmDeleteAll : Copy.confirmKeepOff;

  return (
    <SettingsScreenLayout>
      {kept === null ? null : (
        <>
          <ToggleRow
            label={Copy.keep}
            value={kept}
            onValueChange={(next) => take(keepSwitchStep(next, reports.length))}
          />
          <Caption>{Copy.keepCaption}</Caption>
        </>
      )}
      {failed ? <NoticeCard title="Couldn't delete every report" detail="The ones listed are still on this phone." /> : null}
      {status === 'failed' ? (
        <NoticeCard title={Copy.readFailed} />
      ) : keptOff ? (
        <Text style={styles.note}>{Copy.keptOff}</Text>
      ) : status === 'ready' && reports.length === 0 ? (
        <Text style={styles.note}>{Copy.empty}</Text>
      ) : reports.length > 0 ? (
        <>
          <SectionHeader title={Copy.savedHeader} />
          {reports.map((report) => {
            const kind = crashKindLabel(report.kind);
            const when = crashWhenLabel(report);
            const range = report.period !== undefined;
            return (
              <LinkRow
                key={report.id}
                title={when}
                description={Copy.rowKind(kind, range)}
                accessibilityLabel={Copy.rowLabel(kind, when, range)}
                onPress={() => navigation.navigate('CrashReport', { id: report.id })}
              />
            );
          })}
          <Caption>{Copy.limitCaption}</Caption>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [styles.deleteAll, pressed && styles.deleteAllPressed]}
            onPress={() => take(DELETE_ALL_STEP)}
          >
            <Text style={styles.deleteAllLabel}>{Copy.deleteAll}</Text>
          </Pressable>
        </>
      ) : null}
      <ConfirmDialog
        visible={dialog !== null}
        title={askedDialog.title}
        body={askedDialog.body(reports.length)}
        confirmLabel={askedDialog.confirm}
        destructive
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    </SettingsScreenLayout>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    // The empty, kept-off and unreadable list: one muted card where the list would stand.
    note: {
      padding: 12,
      borderRadius: GhostexRadii.row,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.card,
      color: appearance.muted,
      fontSize: 14,
      overflow: 'hidden',
    },
    deleteAll: {
      minHeight: 44,
      marginTop: 14,
      borderRadius: GhostexRadii.row,
      backgroundColor: appearance.dangerFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteAllPressed: {
      backgroundColor: appearance.dangerFillPressed,
    },
    deleteAllLabel: {
      color: appearance.danger,
      fontSize: 14,
      fontWeight: '600',
    },
  });
