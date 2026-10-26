/// <reference types="node" />
/** Run with `bun test src/contract/coordinatorTree.test.ts` from apps/mobile/app. gx-core's threads.rs has the same test. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { coordinatorBadges, coordinatorRowKey, nestCoordinatorThreads } from './coordinatorTree';
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

describe('approval waits', () => {
  const thread = (sessionId: string, parent: string, state: string, approval = false) =>
    ({
      ...row(sessionId, parent, false),
      coordinatorThreadState: state,
      activity: state === 'working' ? 'working' : 'attention',
      awaitingApproval: approval,
    }) as GhostexSession;
  const badgeOf = (sessions: GhostexSession[], id: string) =>
    coordinatorBadges(sessions, 0).get(coordinatorRowKey({ projectId: 'p1', sessionId: id }));

  test('the badge is red > light blue > orange, its number following the tone (gx-core coordinator_badge)', () => {
    const lead = row('lead', null, true);
    assert.deepEqual(
      badgeOf([lead, thread('a', 'lead', 'working'), thread('b', 'lead', 'working'), thread('c', 'lead', 'waiting')], 'lead'),
      { count: 1, tone: 'waiting' },
    );
    assert.deepEqual(badgeOf([lead, thread('a', 'lead', 'working'), thread('b', 'lead', 'working')], 'lead'), {
      count: 2,
      tone: 'working',
    });
    assert.deepEqual(
      badgeOf([lead, thread('a', 'lead', 'working'), thread('c', 'lead', 'waiting', true)], 'lead'),
      { count: 1, tone: 'approval' },
    );
  });

  test('an approval counts on every orchestrator above it', () => {
    const sessions = [
      row('lead', null, true),
      { ...thread('sub', 'lead', 'working'), isCoordinator: true } as GhostexSession,
      thread('stuck', 'sub', 'waiting', true),
    ];
    assert.deepEqual(badgeOf(sessions, 'sub'), { count: 1, tone: 'approval' });
    assert.deepEqual(badgeOf(sessions, 'lead'), { count: 1, tone: 'approval' });
  });

  test('a folded orchestrator shows a stuck thread as the red dot, not the pink one', () => {
    const sessions = [{ ...row('lead', null, true), activity: 'idle' } as GhostexSession, thread('stuck', 'lead', 'waiting', true)];
    const lead = nestCoordinatorThreads(
      sessions,
      new Set([coordinatorRowKey({ projectId: 'p1', sessionId: 'lead' })]),
      () => 'main',
    ).nesting.get(coordinatorRowKey({ projectId: 'p1', sessionId: 'lead' }))!;
    assert.equal(lead.foldedStatus?.approval, true);
    assert.equal(lead.foldedStatus?.question, false);
  });
});
