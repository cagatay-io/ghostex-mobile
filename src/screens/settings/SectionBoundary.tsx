/**
 * An error boundary for one Settings section or page: a throw inside it shows a small error card in
 * the Settings style (themed like every Settings card) and the rest of the page keeps working.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ErrorBoundary, { errorBoundaryMessage } from '../../components/common/ErrorBoundary';
import { GhostexRadii } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { useSettingsStyles } from './SettingsControls';

export const SectionErrorCopy = {
  title: "This section couldn't load",
  tryAgain: 'Try Again',
} as const;

const buttonStyles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: GhostexRadii.row,
  },
});

function SectionErrorCard({ error, retry }: { error: unknown; retry: () => void }) {
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{SectionErrorCopy.title}</Text>
      <Text style={styles.caption} numberOfLines={4}>
        {errorBoundaryMessage(error)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SectionErrorCopy.tryAgain}
        style={({ pressed }) => [
          buttonStyles.button,
          { backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill },
        ]}
        onPress={retry}
      >
        <Text style={styles.cardLabel}>{SectionErrorCopy.tryAgain}</Text>
      </Pressable>
    </View>
  );
}

/** `name` is for the log line only, like `settings:advanced:cursor`. */
export function SettingsSection({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} renderFallback={(props) => <SectionErrorCard {...props} />}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * A whole page's boundary: catches what the page's own hooks and layout throw. The card sits on the
 * Settings page color without `SettingsScreenLayout` (whose header hook could be what threw).
 */
export function SettingsPageBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} renderFallback={(props) => <PageErrorScreen {...props} />}>
      {children}
    </ErrorBoundary>
  );
}

function PageErrorScreen(props: { error: unknown; retry: () => void }) {
  const styles = useSettingsStyles();
  return (
    <View style={[styles.container, styles.list]}>
      <SectionErrorCard {...props} />
    </View>
  );
}
