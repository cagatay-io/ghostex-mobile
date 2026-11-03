/**
 * Run with `bun test src/screens/wall/layout.test.ts`. The tile grid of the session wall design: columns at
 * least 250 pt wide (`minmax(250px, 1fr)`), so two upright and three across on the iPhone Duo's inner display, and a
 * project's session rows turned into grid rows of that many tiles while its other rows (a kind label, a session
 * group's tree rows) stay rows in their place.
 */

import { describe, expect, test } from 'bun:test';

import type { DrawerItem, SessionItem, SessionKindLabelItem } from '../../contract/grouping';
import { tileRuns, wallColumns } from './layout';

describe('columns', () => {
  test('two tiles side by side upright, three across, one on a narrow window', () => {
    // The inner display's width less the list's own margins: upright about 640 pt, across about 860 pt.
    expect(wallColumns(640)).toBe(2);
    expect(wallColumns(860)).toBe(3);
    expect(wallColumns(400)).toBe(1);
    expect(wallColumns(0)).toBe(1);
  });
});

describe('grid rows', () => {
  const session = (id: string): SessionItem => ({ type: 'SESSION', key: `session:${id}` }) as SessionItem;
  const label: SessionKindLabelItem = { type: 'SESSION_KIND_LABEL', key: 'kind:parked' } as SessionKindLabelItem;

  test('consecutive sessions fill rows of the column count; another row breaks the run', () => {
    const items: DrawerItem[] = [session('a'), session('b'), session('c'), label, session('d')];
    expect(tileRuns(items, 2)).toEqual([
      { kind: 'tiles', key: 'tiles:session:a', items: [session('a'), session('b')] },
      { kind: 'tiles', key: 'tiles:session:c', items: [session('c')] },
      { kind: 'row', item: label },
      { kind: 'tiles', key: 'tiles:session:d', items: [session('d')] },
    ]);
  });

  test('with three columns three tiles share a row', () => {
    const items = ['a', 'b', 'c', 'd'].map(session);
    expect(tileRuns(items, 3).map((run) => (run.kind === 'tiles' ? run.items.length : 0))).toEqual([3, 1]);
  });
});
