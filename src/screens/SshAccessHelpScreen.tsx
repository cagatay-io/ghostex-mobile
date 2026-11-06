/**
 * The `SshAccessHelp` route: the same per-OS "turn on SSH access" content the
 * bottom sheet shows, as a full screen with the OS buttons on top, for deep
 * links and for surfaces that have no sheet host of their own.
 */

import { useMemo, useState } from 'react';
import { useAppearance, type Appearance } from '../theme/useAppearance';

import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { SshAccessHelpContent, SshOsButtons, type SshOs } from '../components/onboarding/SshAccessHelpSheet';
import type { RootStackParamList } from '../navigation/types';


type Props = NativeStackScreenProps<RootStackParamList, 'SshAccessHelp'>;

export default function SshAccessHelpScreen({ route }: Props) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const [os, setOs] = useState<SshOs>(route.params?.platform ?? 'macos');
  // The page reaches under the iPhone Duo's side bar, its content keeps clear of it.
  const edges = useScrollToBarEdges(styles.content);
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScrollView style={edges.scroll} contentContainerStyle={[styles.content, edges.content]}>
        <SshOsButtons current={os} onSelect={setOs} />
        <View style={styles.body}>
          <SshAccessHelpContent os={os} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: appearance.background,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  body: {
    paddingHorizontal: 2,
  },
});
