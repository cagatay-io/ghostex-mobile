/**
 * Compact muted-amber clock + countdown badge (`45s`, `13m`, `1h 20m`) for a session on a quota
 * limit (Antigravity CLI or Autopilot pool wait), matching desktop
 * `apps/desktop/src/app/native_sidebar/status.rs` `quota_countdown_badge`.
 * Drawn beside the red dot while `blocked` (when a future reset time is known), and alone while `waiting`.
 */

import { StyleSheet, Text, View } from 'react-native';

import { ClockGlyph } from './icons';
import { ds, useSidebarInk } from './rows';
import { quotaBadgeAccessibilityLabel, type QuotaBadge } from './sessionStatus';

/** Desktop `chrome_color(0xfbbf24, 0xb45309)` in `apps/desktop/src/app/native_sidebar/status.rs`. */
const QUOTA_AMBER_DARK = '#FBBF24';
const QUOTA_AMBER_LIGHT = '#B45309';

export function QuotaCountdownBadge({ badge }: { badge: QuotaBadge }) {
  const ink = useSidebarInk();
  const color = ink.light ? QUOTA_AMBER_LIGHT : QUOTA_AMBER_DARK;
  return (
    <View accessible accessibilityLabel={quotaBadgeAccessibilityLabel(badge)} style={styles.badge}>
      <ClockGlyph size={ds(11.5)} color={color} />
      {badge.label !== null ? (
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {badge.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: ds(3),
  },
  label: {
    fontSize: ds(11.5),
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
});
