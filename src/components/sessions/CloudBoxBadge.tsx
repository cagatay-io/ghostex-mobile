/**
 * A Cloud Box session's ☁ badge on its row: the cloud glyph with a dot in the box's state colour,
 * then the box's name. The phone's twin of the desktop's `native_sidebar/cloud_box.rs`
 * (CDXC:CloudBoxes 2026-11-02, Q1015 "in project with badge").
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { StyleSheet, Text, View } from 'react-native';

import type { GhostexSessionCloudBox } from '../../contract/mobileSummary';
import { cloudBoxDotColor, cloudBoxStateLabel } from '../../cloudBoxes/types';
import { CloudGlyph } from './icons';
import { ds } from './rows';

export default function CloudBoxBadge({ cloudBox }: { cloudBox: GhostexSessionCloudBox }) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const name = cloudBox.boxName.trim().length > 0 ? cloudBox.boxName : 'Cloud';
  const dot = cloudBoxDotColor(cloudBox.state);
  return (
    <View
      accessible
      accessibilityLabel={`Runs on cloud box ${name}: ${cloudBoxStateLabel(cloudBox.state)}`}
      style={styles.badge}
    >
      <View>
        <CloudGlyph size={ds(12)} color={appearance.muted} />
        <View style={[styles.dot, dot === null ? styles.dotMuted : { backgroundColor: dot }]} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds(3),
    maxWidth: ds(96),
    flexShrink: 1,
  },
  dot: {
    position: 'absolute',
    right: -ds(1.5),
    bottom: -ds(0.5),
    width: ds(5),
    height: ds(5),
    borderRadius: ds(2.5),
  },
  dotMuted: {
    backgroundColor: appearance.muted,
    opacity: 0.7,
  },
  label: {
    color: appearance.muted,
    fontSize: ds(11.5),
    fontWeight: '300',
    flexShrink: 1,
  },
});
