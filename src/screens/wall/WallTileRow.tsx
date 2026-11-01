/**
 * One grid row of the session wall, in the classic list (`DrawerBlockView`) and in the Unified list
 * (`use-unified-list.tsx`): its tiles, then empty places so every tile keeps the column's width.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { WALL_TILE_GAP } from './layout';

export type WallTileRowProps = {
  /** The list key of the row's first tile, which names the row (`wall-row-<key>`). */
  firstKey: string;
  columns: number;
  style?: StyleProp<ViewStyle>;
  /** The row's tiles, at most `columns`. */
  children: ReactElement[];
};

export default function WallTileRow({ firstKey, columns, style, children }: WallTileRowProps) {
  return (
    <View testID={`wall-row-${firstKey}`} style={[styles.tileRow, style]}>
      {children}
      {Array.from({ length: columns - children.length }, (_, index) => (
        <View key={`place:${index}`} style={styles.tilePlace} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The mockup's gap between tiles and below the row. */
  tileRow: {
    flexDirection: 'row',
    gap: WALL_TILE_GAP,
    marginBottom: WALL_TILE_GAP,
  },
  tilePlace: {
    flex: 1,
  },
});
