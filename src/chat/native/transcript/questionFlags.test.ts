/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/questionFlags.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ChatDocument } from '../../rust/document';
import { transcriptFlags } from './context';

describe('question flags', () => {
  test('cards learn which questions wait and which are put off for later', () => {
    const document = {
      finalIds: [],
      laterQuestions: ['page-later'],
      openQuestions: {
        count: 1,
        text: '',
        accessibilityLabel: '',
        jump: null,
        total: 3,
        summary: '1 unanswered · 1 for later',
        sections: [
          { id: 'unanswered', title: 'Unanswered', count: 1, rows: [{ id: 'form-open', kind: 'form', title: 'Q', tags: [], time: '', timeTitle: '' }] },
          { id: 'later', title: 'For later', count: 1, rows: [{ id: 'page-later', kind: 'page', title: 'P', tags: [], time: '', timeTitle: '' }] },
          { id: 'answered', title: 'Answered', count: 1, rows: [{ id: 'page-done', kind: 'page', title: 'D', tags: [], time: '', timeTitle: '' }] },
        ],
      },
    } as unknown as ChatDocument;
    const flags = transcriptFlags(document);
    assert.deepEqual([...flags.unansweredQuestions], ['form-open']);
    assert.deepEqual([...flags.laterQuestions], ['page-later']);
    assert.equal(flags.unansweredQuestions.has('page-done'), false);
  });
});
