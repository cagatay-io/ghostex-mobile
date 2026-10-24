/// <reference types="node" />
/** Run with `bun test src/voice/lines.test.ts` from apps/mobile/app. The desktop's rows.rs has the same tests. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { captionParagraphs, toolLineFrame } from './lines';

describe('caption paragraphs', () => {
  test('a long caption brings its paragraphs and a short one none', () => {
    assert.deepEqual(
      captionParagraphs({
        type: 'caption',
        role: 'agent',
        itemId: 'i1',
        text: 'One. Two.',
        final: true,
        paragraphs: ['One.', 'Two.'],
      }),
      ['One.', 'Two.'],
    );
    assert.deepEqual(
      captionParagraphs({ type: 'caption', role: 'agent', itemId: 'i2', text: 'Done.', final: true }),
      [],
    );
  });
});

describe('tool lines', () => {
  test('a single call is its own line', () => {
    assert.deepEqual(
      toolLineFrame({
        type: 'tool',
        phase: 'started',
        callId: 'c1',
        name: 'read_session',
        label: 'Reading the session',
      }),
      { key: 'tool-c1', label: 'Reading the session', finished: false, ok: true },
    );
    const finished = toolLineFrame({
      type: 'tool',
      phase: 'finished',
      callId: 'c1',
      name: 'read_session',
      label: 'Reading the session',
      ok: false,
    });
    assert.equal(finished.finished, true);
    assert.equal(finished.ok, false);
  });

  test("a call of a run lands on the run's line", () => {
    assert.deepEqual(
      toolLineFrame({
        type: 'tool',
        phase: 'started',
        callId: 'c2',
        name: 'read_session',
        label: 'Reading the session',
        run: { id: 'c1', count: 2, label: 'Reading 2 sessions', finished: false, ok: true },
      }),
      { key: 'tool-c1', label: 'Reading 2 sessions', finished: false, ok: true },
    );
    assert.deepEqual(
      toolLineFrame({
        type: 'tool',
        phase: 'finished',
        callId: 'c21',
        name: 'read_session',
        label: 'Reading the session',
        ok: true,
        run: { id: 'c1', count: 21, label: 'Read 21 sessions', finished: true, ok: true },
      }),
      { key: 'tool-c1', label: 'Read 21 sessions', finished: true, ok: true },
    );
  });
});
