/**
 * The bell on the Sessions screen (D-037 (9), mockup state list-entry): opens the attention list and
 * carries the number of unread rows as a figure, not as a colour alone, like the desktop titlebar's
 * bell. The number counts the rows the list shows, across every enabled computer.
 */

import { StyleSheet, Text, View } from 'react-native';

import { NotificationsCopy } from '../copy';
import { SidebarPalette } from '../theme/palette';
import { useAttentionFeedStore } from './feedStore';
import { BellGlyph } from './icons';

/** Unread rows of every computer's feed. */
export function useAttentionUnreadCount(): number {
  return useAttentionFeedStore((state) => {
    let count = 0;
    for (const feed of Object.values(state.feeds)) for (const row of feed.rows) if (!row.read) count += 1;
    return count;
  });
}

export function bellLabel(unread: number): string {
  return unread > 0 ? NotificationsCopy.bellUnread(unread) : NotificationsCopy.bell;
}

/** The bell glyph with its count badge; the label is the caller's (`bellLabel`). */
export function BellWithCount({ size, color, unread }: { size: number; color: string; unread: number }) {
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BellGlyph size={size} color={color} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {unread > 99 ? '99+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: SidebarPalette.ROW_FAILED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
