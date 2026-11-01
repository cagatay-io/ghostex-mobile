/**
 * The session wall's grid (approved session wall mockup): columns at least `WALL_MIN_TILE_WIDTH` wide, so two upright
 * and three across on the iPhone Duo's inner display, and a project's session rows drawn as grid rows of that many
 * tiles while its other rows (a kind label, a coordinator's older threads) keep their place as rows. Free of React
 * Native, so it loads in a plain `bun test`.
 */

import type { DrawerItem, SessionItem } from '../../contract/grouping';

/** The mockup's `minmax(250px, 1fr)`: a tile never gets narrower than this while another column fits. */
export const WALL_MIN_TILE_WIDTH = 250;
/** The space between tiles, across and down. */
export const WALL_TILE_GAP = 12;

/** How many tiles stand side by side in a list `width` points wide. */
export function wallColumns(width: number): number {
  return Math.max(1, Math.floor((width + WALL_TILE_GAP) / (WALL_MIN_TILE_WIDTH + WALL_TILE_GAP)));
}

export type TileRun = { kind: 'row'; item: DrawerItem } | { kind: 'tiles'; key: string; items: SessionItem[] };

/** `items` in order, each run of sessions cut into grid rows of `columns` tiles; every other item stays a row. */
export function tileRuns(items: readonly DrawerItem[], columns: number): TileRun[] {
  const runs: TileRun[] = [];
  let row: SessionItem[] = [];
  const closeRow = (): void => {
    if (row.length > 0) runs.push({ kind: 'tiles', key: `tiles:${row[0].key}`, items: row });
    row = [];
  };
  for (const item of items) {
    if (item.type !== 'SESSION') {
      closeRow();
      runs.push({ kind: 'row', item });
      continue;
    }
    row.push(item);
    if (row.length === columns) closeRow();
  }
  closeRow();
  return runs;
}
