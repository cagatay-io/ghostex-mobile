/// <reference types="node" />
/** Run with `bun test src/chat/native/composer/trayLayout.test.ts` from apps/mobile/app. The same cases as desktop's `tray_layout.rs`. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { NARROW_WIDTH, trayLayout, type PartSize } from './trayLayout';

const part = (natural: number): PartSize => ({ natural, min: 40 });
/** Ghostex › Local › This folder › main */
const breadcrumb = (): [PartSize[], PartSize[]] => [
  [part(80), part(60)],
  [part(100), part(50)],
];
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≈ ${expected}`);

describe('trayLayout', () => {
  test('a wide bar keeps one row at the start', () => {
    const layout = trayLayout(breadcrumb(), 16, 700, NARROW_WIDTH);
    assert.equal(layout.twoRows, false);
    assert.equal(layout.centered, false);
    assert.deepEqual(layout.widths, [
      [80, 60],
      [100, 50],
    ]);
  });

  test('a narrow bar that still fits centres its one row', () => {
    const layout = trayLayout(breadcrumb(), 16, 360, NARROW_WIDTH);
    assert.equal(layout.twoRows, false);
    assert.equal(layout.centered, true);
  });

  test('what does not fit goes on two rows with lined up columns', () => {
    const layout = trayLayout(breadcrumb(), 16, 300, NARROW_WIDTH);
    assert.equal(layout.twoRows, true);
    assert.equal(layout.centered, true);
    assert.deepEqual(layout.columns, [100, 60]);
    assert.deepEqual(layout.widths, [
      [80, 60],
      [100, 50],
    ]);
  });

  test('a long worktree name is cut first and the short parts stay whole', () => {
    const layout = trayLayout(
      [
        [part(80), part(60)],
        [part(90), part(260)],
      ],
      16,
      250,
      NARROW_WIDTH,
    );
    assert.equal(layout.twoRows, true);
    assert.equal(layout.columns[0], 90);
    near(layout.columns[1]!, 144);
    assert.deepEqual(layout.widths[0], [80, 60]);
    near(layout.widths[1][1]!, 144);
  });

  test('no part is cut below its least width', () => {
    const layout = trayLayout(breadcrumb(), 16, 60, NARROW_WIDTH);
    assert.ok(layout.columns.every((column) => column >= 40));
  });

  test('without a computer the where row still lines up under the project', () => {
    const layout = trayLayout([[part(80)], [part(100), part(50)]], 16, 200, NARROW_WIDTH);
    assert.equal(layout.twoRows, true);
    assert.deepEqual(layout.columns, [100, 50]);
    assert.deepEqual(layout.widths, [[80], [100, 50]]);
  });

  test('a folder with nothing to choose cuts its one row', () => {
    const layout = trayLayout([[part(300), part(60)], []], 16, 200, NARROW_WIDTH);
    assert.equal(layout.twoRows, false);
    assert.ok(layout.widths[0][0]! < 300);
    assert.equal(layout.widths[0][1], 60);
    near(layout.widths[0][0]! + layout.widths[0][1]!, 184);
  });

  test('a bar not measured yet draws one whole row', () => {
    const layout = trayLayout(breadcrumb(), 16, 0, NARROW_WIDTH);
    assert.equal(layout.twoRows, false);
    assert.equal(layout.centered, false);
  });
});
