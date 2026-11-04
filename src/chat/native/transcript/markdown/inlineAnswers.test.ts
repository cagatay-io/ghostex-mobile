/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/markdown/inlineAnswers.test.ts` from apps/mobile/app. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMarkdown } from './parse';

const MARK = '\u{e000}';

describe('one-click answers (gx-chat-core transcript/inline_answers.rs)', () => {
  test('the marked line under a list item becomes its answers block', () => {
    const mark = JSON.stringify({
      form: 'f1',
      tag: 'Q9',
      question: 'Merge it?',
      choices: [{ label: 'Yes', value: 'Yes', recommended: false }],
    });
    const blocks = parseMarkdown(`- Merge it?\n  ${MARK}answers:${mark}\n- Next item`);
    assert.equal(blocks.length, 1);
    const list = blocks[0]!;
    if (list.t !== 'list') throw new Error(`expected a list, got ${list.t}`);
    assert.equal(list.items.length, 2);
    const first = list.items[0]!.c;
    assert.deepEqual(
      first.map((block) => block.t),
      ['p', 'answers'],
    );
    const answers = first[1]!;
    if (answers.t !== 'answers') throw new Error('expected answers');
    assert.equal(answers.mark.form, 'f1');
  });

  test('a marked line ends the paragraph above it', () => {
    const blocks = parseMarkdown(`Merge it?\n${MARK}answers:{"form":"f2","choices":[]}`);
    assert.deepEqual(
      blocks.map((block) => block.t),
      ['p', 'answers'],
    );
  });
});
