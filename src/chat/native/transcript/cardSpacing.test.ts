/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/cardSpacing.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ROW_GAP, cardStackMargin, gapAbove } from './cardSpacing';

describe('card spacing', () => {
  test('two one-line cards in a row are a row gap apart', () => {
    assert.equal(gapAbove(true, true, 10), ROW_GAP);
    assert.equal(gapAbove(true, true, 8), ROW_GAP);
  });

  test('anything next to other content keeps the column gap', () => {
    assert.equal(gapAbove(false, true, 10), 10);
    assert.equal(gapAbove(true, false, 10), 10);
    assert.equal(gapAbove(false, false, 8), 8);
  });

  test('a card stack under a card makes up the difference to the row gap', () => {
    // The finished turn's column (10) under its "Worked for" fold, and a message row (8).
    assert.equal(10 + cardStackMargin(true, 10), ROW_GAP);
    assert.equal(8 + cardStackMargin(true, 8), ROW_GAP);
    assert.equal(cardStackMargin(false, 10), 0);
  });
});
