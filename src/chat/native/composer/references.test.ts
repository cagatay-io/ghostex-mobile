/// <reference types="node" />
/** Run with `bun test src/chat/native/composer/references.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDraftReferenceParser, rebaseReferences, type ComposerReference } from './references';

/** The reference the core reports for `[label](path)` at `start` in a draft. */
function pill(draft: string, markdown: string, kind = 'image'): ComposerReference {
  const start = draft.indexOf(markdown);
  assert.ok(start >= 0, `${markdown} is in the draft`);
  const label = markdown.slice(1, markdown.indexOf(']('));
  const path = markdown.slice(markdown.indexOf('](') + 2, -1);
  return {
    start,
    end: start + markdown.length,
    kind,
    label,
    path,
    labelStart: start + 1,
    labelEnd: start + 1 + label.length,
  };
}

/** The text each carried reference covers, which must still be its markdown. */
function covered(draft: string, references: readonly ComposerReference[]): string[] {
  return references.map((reference) => draft.slice(reference.start, reference.end));
}

const IMAGE = '[Image #1](/tmp/ghostex/shot.png)';
const FILE = '[notes.md](/Users/me/notes.md)';

describe('rebaseReferences', () => {
  test('typing after a pill keeps it where it is', () => {
    const before = `${IMAGE} look`;
    const after = `${IMAGE} look at`;
    const references = [pill(before, IMAGE)];
    assert.deepEqual(rebaseReferences(before, references, after), references);
  });

  test('typing before a pill moves it by what was typed', () => {
    const before = `see ${IMAGE}`;
    const after = `please see ${IMAGE}`;
    const carried = rebaseReferences(before, [pill(before, IMAGE)], after);
    assert.deepEqual(carried, [pill(after, IMAGE)]);
    assert.deepEqual(covered(after, carried), [IMAGE]);
  });

  test('a keystroke right at the pill start moves it, one right at its end does not', () => {
    const before = `${IMAGE}`;
    assert.deepEqual(rebaseReferences(before, [pill(before, IMAGE)], `x${IMAGE}`), [pill(`x${IMAGE}`, IMAGE)]);
    assert.deepEqual(rebaseReferences(before, [pill(before, IMAGE)], `${IMAGE}x`), [pill(before, IMAGE)]);
  });

  test('deleting text between two pills moves only the second', () => {
    const before = `${IMAGE} and then ${FILE}`;
    const after = `${IMAGE} and ${FILE}`;
    const carried = rebaseReferences(before, [pill(before, IMAGE), pill(before, FILE, 'file')], after);
    assert.deepEqual(carried, [pill(after, IMAGE), pill(after, FILE, 'file')]);
    assert.deepEqual(covered(after, carried), [IMAGE, FILE]);
  });

  test('a pill the edit cut into is dropped until the core answers', () => {
    const before = `${IMAGE} hi`;
    const after = `${IMAGE.slice(0, -3)} hi`;
    assert.deepEqual(rebaseReferences(before, [pill(before, IMAGE)], after), []);
  });

  test('a pill deleted whole goes and the others stay', () => {
    const before = `${IMAGE} ${FILE}`;
    const after = ` ${FILE}`;
    const carried = rebaseReferences(before, [pill(before, IMAGE), pill(before, FILE, 'file')], after);
    assert.deepEqual(covered(after, carried), [FILE]);
  });

  test('a string of keystrokes, each carried from the last, keeps every pill on its markdown', () => {
    let draft = `${IMAGE}`;
    let references = [pill(draft, IMAGE)];
    for (const next of [
      ` ${IMAGE}`,
      `a ${IMAGE}`,
      `a ${IMAGE} b`,
      `ab ${IMAGE} b`,
      `ab ${IMAGE} bc`,
      `ab ${IMAGE} b`,
      `b ${IMAGE} b`,
    ]) {
      references = rebaseReferences(draft, references, next);
      draft = next;
      assert.deepEqual(covered(draft, references), [IMAGE]);
    }
  });

  test('an unchanged draft hands back the same pills', () => {
    const draft = `${IMAGE}`;
    const references = [pill(draft, IMAGE)];
    assert.deepEqual(rebaseReferences(draft, references, draft), references);
  });
});

/** The core's `composerReferences` answer for one pill. */
function answer(draft: string, markdown: string, kind = 'image'): unknown[] {
  const reference = pill(draft, markdown, kind);
  return [{ start: reference.start, end: reference.end, kind, label: reference.label, path: reference.path }];
}

describe('createDraftReferenceParser', () => {
  test('uses the core answer when there is one', () => {
    const parse = createDraftReferenceParser();
    const draft = `${IMAGE} hi`;
    assert.deepEqual(parse(draft, answer(draft, IMAGE)), [pill(draft, IMAGE)]);
  });

  test('keeps the pill drawn while the core has not answered the new draft', () => {
    const parse = createDraftReferenceParser();
    let draft = `${IMAGE} `;
    parse(draft, answer(draft, IMAGE));
    for (const char of 'hello') {
      draft += char;
      assert.deepEqual(covered(draft, parse(draft, null)), [IMAGE], draft);
    }
    // The answer arrives and agrees.
    assert.deepEqual(parse(draft, answer(draft, IMAGE)), [pill(draft, IMAGE)]);
  });

  test('the core answer wins over the carried pills', () => {
    const parse = createDraftReferenceParser();
    const draft = `${IMAGE} `;
    parse(draft, answer(draft, IMAGE));
    const next = `!${draft}`;
    assert.deepEqual(covered(next, parse(next, null)), [IMAGE]);
    // `![...](...)` is markdown image syntax, which the core does not draw as a pill.
    assert.deepEqual(parse(next, []), []);
  });
});
