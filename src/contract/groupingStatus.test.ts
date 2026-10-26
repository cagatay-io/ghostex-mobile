/// <reference types="node" />
/** Run with `bun test src/contract/groupingStatus.test.ts` from apps/mobile/app. gx-core's groups.rs has the same test. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { countSectionSessions, countSessions, headerStatusCounts, tabStatusCounts } from './grouping';
import type { GhostexSession } from './mobileSummary';

function session(sessionId: string, overrides: Partial<GhostexSession>): GhostexSession {
  return {
    sessionId,
    activity: 'attention',
    pendingQuestionCount: 0,
    awaitingApproval: false,
    backgroundWorkDetectedAt: '',
    isLive: true,
    isSleeping: false,
    status: 'running',
    ...overrides,
  } as unknown as GhostexSession;
}

// One row of each: waiting for approval (with a question too), a question, a finished turn, a background shell.
const rows = [
  session('approval', { awaitingApproval: true, pendingQuestionCount: 1, backgroundWorkDetectedAt: 'now' }),
  session('question', { pendingQuestionCount: 1 }),
  session('done', {}),
  session('shell', { activity: 'idle', backgroundWorkDetectedAt: 'now' }),
];

describe('header approval counts', () => {
  test('a session waiting for approval counts in red only, on every header kind (gx-core SessionRow::needs_you)', () => {
    const header = headerStatusCounts(countSessions(rows));
    assert.deepEqual(
      [header.approvalCount, header.questionCount, header.attentionCount, header.backgroundWorkCount],
      [1, 1, 1, 1],
    );
    const tab = tabStatusCounts(countSessions(rows));
    assert.deepEqual([tab.approvalCount, tab.questionCount, tab.attentionCount], [1, 1, 1]);
    const section = countSectionSessions(rows);
    assert.deepEqual(
      [section.approvalCount, section.questionCount, section.attentionCount, section.backgroundWorkCount],
      [1, 1, 1, 1],
    );
  });
});
