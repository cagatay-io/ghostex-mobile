/**
 * Full-screen progress overlay for creation flows (sessions-drawer.md §6):
 * dimmed backdrop + centered card with spinner + message; half folded like a laptop the card stands off the fold,
 * held to its band, where a longer message scrolls (`useFoldCardPlacement`).
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GhostexStrokeWidth } from '../../theme/palette';
import { useFoldCardPlacement } from './foldAvoidance';
import { barPadding } from './verticalBar/layout';
import { useVerticalBarSpace } from './verticalBar/VerticalBarArea';

export type ProgressOverlayProps = {
  visible: boolean;
  message: string;
};

export default function ProgressOverlay({ visible, message }: ProgressOverlayProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const bar = useVerticalBarSpace();
  const placement = useFoldCardPlacement({ avoidsKeyboard: false });
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.backdrop, barPadding(bar, 24), placement.style]}>
        <View
          style={[styles.card, placement.maxHeight !== null && { maxHeight: placement.maxHeight }]}
          onLayout={placement.onCardLayout}
        >
          <ActivityIndicator size="small" color={appearance.accent} />
          <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent} bounces={false}>
            <Text style={styles.message}>{message}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: appearance.background,
    borderRadius: 12,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    padding: 16,
  },
  // Stretched to the card's height (the message's own, at most the band's): a longer message scrolls.
  messageScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  // A message shorter than the spinner stands centred beside it, as before.
  messageContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  message: {
    color: appearance.foreground,
    fontSize: 13,
  },
});
