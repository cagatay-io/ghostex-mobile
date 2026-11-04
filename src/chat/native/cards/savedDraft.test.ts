/// <reference types="node" />
/** Run with `bun test src/chat/native/cards/savedDraft.test.ts` from apps/mobile/app. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { savedDraftLabel } from './savedDraft';

describe('savedDraftLabel', () => {
  test('shortens in place on a narrow box, as the desktop does', () => {
    assert.equal(savedDraftLabel(0), 'full');
    assert.equal(savedDraftLabel(720), 'full');
    assert.equal(savedDraftLabel(480), 'full');
    assert.equal(savedDraftLabel(479), 'short');
    assert.equal(savedDraftLabel(374), 'short');
    assert.equal(savedDraftLabel(300), 'short');
    assert.equal(savedDraftLabel(299), 'icon');
  });
});
