/**
 * The session wall's grid (the session wall design): columns at least `WALL_MIN_TILE_WIDTH` wide, so two upright
 * and three across on the iPhone Duo's inner display, and a project's session rows drawn as grid rows of that many
 * tiles while its other rows (a kind label, a coordinator's older threads) keep their place as rows. The Unified list
 * cuts its cards and shelf rows the same way (`tileRunsOf`), its group and shelf headers keeping their place. Free of
 * React Native, so it loads in a plain `bun test`.
 */

import type { DrawerItem, SessionItem } from '../../contract/grouping';

/** The design's `minmax(250px, 1fr)`: a tile never gets narrower than this while another column fits. */
export const WALL_MIN_TILE_WIDTH = 250;
/** The space between tiles, across and down. */
export const WALL_TILE_GAP = 12;

/** How many tiles stand side by side in a list `width` points wide. */
export function wallColumns(width: number): number {
  return Math.max(1, Math.floor((width + WALL_TILE_GAP) / (WALL_MIN_TILE_WIDTH + WALL_TILE_GAP)));
}

export type TileRun<Item = DrawerItem, Tile = SessionItem> =
  { kind: 'row'; item: Item } | { kind: 'tiles'; key: string; items: Tile[] };

/** `items` in order, each run of tiles (`isTile`) cut into grid rows of `columns`; every other item stays a row. */
export function tileRunsOf<Item extends { key: string }, Tile extends Item>(
  items: readonly Item[],
  columns: number,
  isTile: (item: Item) => item is Tile,
): TileRun<Item, Tile>[] {
  const runs: TileRun<Item, Tile>[] = [];
  let row: Tile[] = [];
  const closeRow = (): void => {
    if (row.length > 0) runs.push({ kind: 'tiles', key: `tiles:${row[0].key}`, items: row });
    row = [];
  };
  for (const item of items) {
    if (!isTile(item)) {
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

/** The classic list's runs: each run of sessions cut into grid rows of `columns` tiles; every other item stays a row. */
export function tileRuns(items: readonly DrawerItem[], columns: number): TileRun[] {
  return tileRunsOf(items, columns, (item): item is SessionItem => item.type === 'SESSION');
}
