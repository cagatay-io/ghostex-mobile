/**
 * The hint the Sessions screen shows when the computer does not start an action: "Couldn't start <action>" and the
 * computer's message, in a card at the bottom of the list for 6 seconds (the time the status line keeps a
 * message). Only for actions; every other start keeps reporting in the status line. It never takes a tap.
 *
 * The card is an accessible alert. On iOS, where React Native's live region does not apply, it also asks VoiceOver
 * to announce its text once when it appears; Android keeps the polite live region alone, as before.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';

import type { ActionStartFailure } from '../../actions/runAction';
import { ActionCopy } from '../../copy';
import { GhostexPalette, GhostexStrokeWidth } from '../../theme/palette';

export const ACTION_FAILURE_VISIBLE_MS = 6000;

/** A failure to show; a new `id` shows it again even when the text is the same. */
export type ShownActionFailure = ActionStartFailure & { id: number };

export function ActionFailureCard({ failure }: { failure: ShownActionFailure | null }) {
  const [shown, setShown] = useState<ShownActionFailure | null>(failure);
  useEffect(() => {
    setShown(failure);
    if (failure === null) return undefined;
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(`${ActionCopy.startFailedTitle(failure.name)}. ${failure.message}`);
    }
    const timer = setTimeout(() => setShown(null), ACTION_FAILURE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [failure]);
  if (shown === null) return null;
  return (
    <View pointerEvents="none" style={styles.row} testID="action-failure-card-row">
      <View style={styles.card} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.title}>{ActionCopy.startFailedTitle(shown.name)}</Text>
        <Text style={styles.message}>{shown.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center' },
  card: {
    maxWidth: 420,
    backgroundColor: '#1F1F1F',
    borderWidth: GhostexStrokeWidth,
    borderColor: GhostexPalette.BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: { color: GhostexPalette.FOREGROUND, fontSize: 13, fontWeight: '600' },
  message: { color: GhostexPalette.MUTED, fontSize: 12 },
});
