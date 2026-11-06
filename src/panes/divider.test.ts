/// <reference types="node" />
/**
 * Run with `bun test src/panes/divider.test.ts`. A manual divider drag without the keyboard keeps each pane between
 * 25 and 75 percent of the pane container: the same bound for the drag, the stored `dividerRatio` and the frames.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { clampDividerRatio, MAX_DIVIDER_RATIO, MIN_DIVIDER_RATIO } from './divider';

describe('the divider clamp', () => {
  test('a requested ratio of 0.10 or 0.90 is clamped to exactly 0.25 and 0.75', () => {
    assert.equal(clampDividerRatio(0.1), 0.25);
    assert.equal(clampDividerRatio(0.9), 0.75);
  });

  test('the bounds are a quarter and three quarters', () => {
    assert.equal(MIN_DIVIDER_RATIO, 0.25);
    assert.equal(MAX_DIVIDER_RATIO, 0.75);
  });

  test('a ratio inside the bounds stays as it is, the bounds included', () => {
    assert.equal(clampDividerRatio(0.25), 0.25);
    assert.equal(clampDividerRatio(0.5), 0.5);
    assert.equal(clampDividerRatio(0.62), 0.62);
    assert.equal(clampDividerRatio(0.75), 0.75);
  });
});
