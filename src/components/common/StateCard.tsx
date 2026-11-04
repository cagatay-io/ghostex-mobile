/**
 * STATE_CARD renderer (sessions-drawer.md §2): padding 12, minHeight 104,
 * radius 8, bg CARD_ACTIVE + BORDER stroke. Title 15sp bold, body 12sp muted
 * (marginTop 6), action hint 12sp bold accent (marginTop 10).
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';

export type StateCardProps = {
  title: string;
  body: string;
  actionHint: string;
  onPress?: () => void;
};

export default function StateCard({ title, body, actionHint, onPress }: StateCardProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <Pressable accessibilityRole="button" style={styles.card} onPress={onPress}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionHint.length > 0 ? <Text style={styles.hint}>{actionHint}</Text> : null}
    </Pressable>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  card: {
    padding: 12,
    minHeight: 104,
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
    fontSize: 12,
    marginTop: 6,
  },
  hint: {
    color: appearance.accent,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
  },
});
