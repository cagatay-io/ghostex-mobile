/**
 * Usage full screen: a usage pane's content when the Duo folds while it is the active pane
 * (`src/panes/openFullScreen.ts`). The same body as the pane (`UsageView`), titled with the computer whose
 * usage it shows; Back returns to the session.
 */

import { useLayoutEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UsageCopy } from '../copy';
import { machineDisplayLabel, useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { GhostexPalette } from '../theme/palette';
import UsageView from '../usage/UsageView';

type Props = NativeStackScreenProps<RootStackParamList, 'Usage'>;

export default function UsageScreen({ navigation, route }: Props) {
  const { machineId } = route.params;
  const record = useMachinesStore((state) => state.machines.find((machine) => machine.id === machineId) ?? null);
  const computer = record === null ? machineId : machineDisplayLabel(record);

  useLayoutEffect(() => {
    navigation.setOptions({ title: UsageCopy.title(computer) });
  }, [navigation, computer]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <UsageView key={machineId} machineId={machineId} placement={{ kind: 'screen' }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
});
