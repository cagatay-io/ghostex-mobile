/**
 * The next-launch offer after a crash: a card under the screens (never over them, never a blocking
 * dialog) saying the app closed unexpectedly, with Dismiss and Send Report. Send Report opens Send
 * Bug / Feedback with the report attached. Shown once per crash (src/app/crashReports.ts).
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissCrashReports, takePendingCrashReport, useCrashPromptStore } from '../../app/crashReports';
import { navigationRef } from '../../app/deepLinks';
import { CrashReportCopy } from '../../copy';
import { crashTimeLabel } from '../../feedback/crashReports';
import { useMachinesStore } from '../../machines/store';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { SetupButton } from '../onboarding/SetupPrimitives';

export default function CrashReportPrompt() {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const pending = useCrashPromptStore((state) => state.pending);
  const insets = useSafeAreaInsets();
  if (pending === null) return null;

  const send = () => {
    const report = takePendingCrashReport();
    if (report === null || !navigationRef.isReady()) return;
    const machineId = useMachinesStore.getState().selectedMachineId ?? undefined;
    navigationRef.navigate('Feedback', { machineId, crashReportId: report.id });
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.card} accessibilityRole="summary">
        <Text style={styles.title}>{CrashReportCopy.title}</Text>
        <Text style={styles.body}>{CrashReportCopy.body(crashTimeLabel(pending.at))}</Text>
        <View style={styles.buttons}>
          <SetupButton
            label={CrashReportCopy.dismiss}
            small
            onPress={() => void dismissCrashReports()}
            style={styles.button}
          />
          <SetupButton label={CrashReportCopy.send} small variant="primary" onPress={send} style={styles.button} />
        </View>
      </View>
    </View>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: appearance.background,
  },
  card: {
    padding: 12,
    borderRadius: GhostexRadii.card,
    backgroundColor: appearance.cardActive,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
  },
  title: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: 'bold',
  },
  body: {
    color: appearance.muted,
    fontSize: 13,
    marginTop: 6,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  button: {
    flex: 1,
  },
});
