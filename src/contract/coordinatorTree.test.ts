/// <reference types="node" />
/** Run with `bun test src/contract/coordinatorTree.test.ts` from apps/mobile/app. gx-core's threads.rs has the same test. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { coordinatorRowKey, nestCoordinatorThreads } from './coordinatorTree';
import type { GhostexSession } from './mobileSummary';

function row(sessionId: string, parent: string | null, isCoordinator: boolean): GhostexSession {
  return {
    projectId: 'p1',
    sessionId,
    kind: 'agent',
    surface: 'agents',
    isCoordinator,
    isParked: false,
    coordinatorProjectId: parent === null ? '' : 'p1',
    coordinatorSessionId: parent ?? '',
    coordinatorThreadState: '',
    activity: 'working',
    lastActiveAt: '',
    pendingQuestionCount: 0,
    backgroundWorkDetectedAt: '',
  } as unknown as GhostexSession;
}

describe('coordinator tree lines', () => {
  const sessions = [
    row('lead', null, true),
    row('l1', 'lead', true),
    row('l1x', 'l1', true),
    row('t3', 'l1x', false),
    row('l1xx', 'l1x', true),
    row('t4', 'l1xx', false),
  ];
  const nestingOf = (collapsed: string[], id: string) =>
    nestCoordinatorThreads(
      sessions,
      new Set(collapsed.map((sessionId) => coordinatorRowKey({ projectId: 'p1', sessionId }))),
      () => 'main',
    ).nesting.get(coordinatorRowKey({ projectId: 'p1', sessionId: id }))!;

  test('a last thread at the depth limit runs its line on to its flat threads; its last thread ends it', () => {
    const l1xx = nestingOf([], 'l1xx');
    const t4 = nestingOf([], 't4');
    assert.equal(l1xx.depth, 3);
    assert.equal(t4.depth, 3);
    assert.equal(l1xx.lastChild, false);
    assert.equal(t4.lastChild, true);
    // Nothing follows l1x's tree, so no line of its level runs past t4 or l1xx's older row.
    assert.equal(t4.passingLines & (1 << 3), 0);
    assert.equal(l1xx.passingLinesBelow & (1 << 3), 0);
  });

  test('folded, it ends the line itself', () => {
    assert.equal(nestingOf(['l1xx'], 'l1xx').lastChild, true);
  });
});
