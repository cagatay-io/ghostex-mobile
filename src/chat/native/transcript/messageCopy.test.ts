/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/messageCopy.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { messageMenuSelection } from './messageCopy';

describe('messageMenuSelection', () => {
  test('a long reply is handed to the menu in full', () => {
    const text = Array.from({ length: 200 }, (_, n) => `Paragraph ${n + 1}: ${'word '.repeat(40).trim()}`).join('\n\n');
    assert.equal(messageMenuSelection({ copyText: text }), text);
  });

  test('code blocks stay in the copied Markdown', () => {
    const text = 'Run this:\n\n```bash\ncargo test --all\n```\n\nThen:\n\n```rust\nfn main() {}\n```';
    assert.equal(messageMenuSelection({ copyText: text }), text);
  });

  test('a question block is copied with its questions and choices', () => {
    const text =
      'Before I start:\n\n```questions\n[{"question":"Which database?","options":[{"label":"Postgres"},{"label":"SQLite"}]}]\n```\n\nTell me.';
    const selection = messageMenuSelection({ copyText: text });
    assert.equal(selection, text);
    for (const part of ['Which database?', 'Postgres', 'SQLite']) assert.ok(selection?.includes(part));
  });

  test('a message with nothing to copy has no menu', () => {
    assert.equal(messageMenuSelection({}), null);
    assert.equal(messageMenuSelection({ copyText: '  \n ' }), null);
  });
});
