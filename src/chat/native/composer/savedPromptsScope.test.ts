/// <reference types="node" />
/** Run with `bun test src/chat/native/composer/savedPromptsScope.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sheetPrompts } from './savedPromptsScope';

const row = (promptId: string, sessionId: string, projectId = 'P1') => ({ promptId, sessionId, projectId });

describe('sheetPrompts', () => {
  const library = [row('a', 'G1'), row('b', 'G2'), row('c', 'G1'), row('d', 'G1', 'P2')];

  test('lists only this chat’s prompts once it has any', () => {
    assert.deepEqual(
      sheetPrompts(library, 'P1', 'G1').map((prompt) => prompt.promptId),
      ['a', 'c'],
    );
  });

  test('lists the project’s prompts when the chat has none', () => {
    assert.equal(sheetPrompts(library, 'P1', 'G9').length, 4);
  });
});
