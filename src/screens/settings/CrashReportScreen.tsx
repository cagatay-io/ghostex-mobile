/**
 * One crash report from Settings › Connection › Crash reports: when it happened (for a report from iOS, the time range
 * iOS gives), Copy, Share and Delete, and the report's cleaned text, the same text Copy, Share and Send Bug / Feedback
 * hand on. Each button says what happened on itself for a moment ("Copied", "Couldn't share", "Couldn't delete"), as
 * the Logs sheet does; Delete asks nothing and goes back to the list.
 */

import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logAppEvent } from '../../app/appLog';
import {
  deleteListedCrashReport,
  describeError,
  refreshCrashReportList,
  useCrashReportListStore,
} from '../../app/crashReports';
import { MONO_FONT } from '../../chat/native/transcript/theme';
import { CrashReportsSettingsCopy as Copy } from '../../copy/crashReports';
import {
  copyCrashReport,
  crashKindLabel,
  crashReportText,
  crashWhenLabel,
  shareCrashReport,
} from '../../feedback/crashReports';
import { appShareSheet } from '../../files/shareSheet';
import type { RootStackParamList } from '../../navigation/types';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { SettingsColumnsFrame } from './SettingsColumns';
import { Caption, NoticeCard, SettingsScreenLayout } from './SettingsControls';

/** As long as the Logs sheet shows "Copied" and "Couldn't export". */
const COPIED_MS = 2000;
const FAILED_MS = 3000;

type Feedback = 'idle' | 'done' | 'failed';

/** A button's word for a moment after it acted, then its own word again; its timer ends with the screen. */
function useButtonFeedback(ms: number): [Feedback, (next: Feedback) => void] {
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback(
    (next: Feedback) => {
      setFeedback(next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFeedback('idle'), ms);
    },
    [ms],
  );
  return [feedback, show];
}

/** The screen's header title: the report's kind ("Native crash"), as listed when the report was opened. */
export function crashReportScreenTitle(id: string): string {
  const report = useCrashReportListStore.getState().reports.find((entry) => entry.id === id);
  return report === undefined ? Copy.title : crashKindLabel(report.kind);
}

export default function CrashReportScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CrashReport'>) {
  const { id } = route.params;
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const report = useCrashReportListStore((state) => state.reports.find((entry) => entry.id === id));
  const status = useCrashReportListStore((state) => state.status);
  const [copied, showCopied] = useButtonFeedback(COPIED_MS);
  const [shared, showShared] = useButtonFeedback(FAILED_MS);
  const [deleted, showDeleted] = useButtonFeedback(FAILED_MS);
  const [deleting, setDeleting] = useState(false);
  // Cleaning walks every saved computer's names over the whole report; once per report, not per render.
  const text = useMemo(() => (report === undefined ? '' : crashReportText(report)), [report]);

  useFocusEffect(
    useCallback(() => {
      void refreshCrashReportList();
    }, []),
  );
  // A report that is gone (deleted here, sent from Send Bug / Feedback, or keeping turned off meanwhile) leaves nothing
  // to show: the screen goes back to the list, once.
  const gone = status === 'ready' && report === undefined;
  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack();
  }, [gone, navigation]);

  if (report === undefined) {
    return (
      <SettingsColumnsFrame title={Copy.title}>
        <SettingsScreenLayout>{status === 'failed' ? <NoticeCard title={Copy.readFailed} /> : null}</SettingsScreenLayout>
      </SettingsColumnsFrame>
    );
  }

  const copy = (): void => {
    copyCrashReport(report).then(
      () => showCopied('done'),
      (error: unknown) => logAppEvent(`Crash reports: copying a report failed (${describeError(error)})`),
    );
  };

  const share = (): void => {
    void shareCrashReport(report, appShareSheet).then((outcome) => {
      if (outcome.shared || 'busy' in outcome) return;
      logAppEvent(`Crash reports: sharing a report failed (${outcome.message})`);
      showShared('failed');
    });
  };

  const remove = (): void => {
    if (deleting) return;
    setDeleting(true);
    // Once deleted, the report is gone from the list and the screen goes back (`gone` above).
    deleteListedCrashReport(report.id).catch((error: unknown) => {
      setDeleting(false);
      logAppEvent(`Crash reports: deleting a report failed (${describeError(error)})`);
      showDeleted('failed');
    });
  };

  const range = report.period !== undefined;
  return (
    <SettingsColumnsFrame title={crashKindLabel(report.kind)}>
      <SettingsScreenLayout>
        <View style={styles.head}>
          <Text style={styles.when}>{crashWhenLabel(report)}</Text>
          {range ? <Text style={styles.rangeNote}>{Copy.rangeOnly}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={copy}
          >
            <Text style={[styles.actionLabel, copied === 'done' && styles.actionDone]}>
              {copied === 'done' ? Copy.copied : Copy.copy}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={share}
          >
            <Text style={[styles.actionLabel, shared === 'failed' && styles.actionFailed]}>
              {shared === 'failed' ? Copy.shareFailed : Copy.share}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            style={({ pressed }) => [styles.action, styles.actionDanger, pressed && styles.actionDangerPressed]}
            onPress={remove}
          >
            <Text style={[styles.actionLabel, styles.actionFailed]}>
              {deleted === 'failed' ? Copy.deleteFailed : Copy.delete}
            </Text>
          </Pressable>
        </View>
        <Caption>{Copy.privacy}</Caption>
        <View style={styles.textBox}>
          <Text selectable style={styles.text}>
            {text}
          </Text>
        </View>
      </SettingsScreenLayout>
    </SettingsColumnsFrame>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    head: {
      gap: 2,
      paddingHorizontal: 4,
    },
    when: {
      color: appearance.foreground,
      fontSize: 15,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    rangeNote: {
      color: appearance.muted,
      fontSize: 12,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    action: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 8,
      borderRadius: GhostexRadii.row,
      backgroundColor: appearance.neutralFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPressed: {
      backgroundColor: appearance.neutralFillPressed,
    },
    actionDanger: {
      backgroundColor: appearance.dangerFill,
    },
    actionDangerPressed: {
      backgroundColor: appearance.dangerFillPressed,
    },
    actionLabel: {
      color: appearance.foreground,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    actionDone: {
      color: appearance.accent,
    },
    actionFailed: {
      color: appearance.danger,
    },
    textBox: {
      padding: 10,
      borderRadius: GhostexRadii.row,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.input,
    },
    text: {
      color: appearance.muted,
      fontFamily: MONO_FONT,
      fontSize: 11,
      lineHeight: 15,
    },
  });
