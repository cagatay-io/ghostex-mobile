/// <reference types="node" />
/** Run with `bun test src/contract/groupingStatus.test.ts` from apps/mobile/app. gx-core's groups.rs has the same test. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { coordinatorRowKey } from './coordinatorTree';
import {
  buildDrawerItems,
  countSectionSessions,
  countSessions,
  headerStatusCounts,
  machineSessionCounts,
  tabStatusCounts,
  type DrawerItem,
  type SessionItem,
} from './grouping';
import {
  NO_SUMMARY_CAPABILITIES,
  parseMobileSummary,
  type GhostexMobileSummary,
  type GhostexSession,
} from './mobileSummary';
import { OTHER_SIDEBAR_SPACE_ID } from '../spaces/otherSpace';
import { spaceSessionCounts } from '../spaces/spaceFilter';

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
    const header = headerStatusCounts(countSessions(rows, NO_SUMMARY_CAPABILITIES));
    assert.deepEqual(
      [header.approvalCount, header.questionCount, header.attentionCount, header.backgroundWorkCount],
      [1, 1, 1, 1],
    );
    const tab = tabStatusCounts(countSessions(rows, NO_SUMMARY_CAPABILITIES));
    assert.deepEqual([tab.approvalCount, tab.questionCount, tab.attentionCount], [1, 1, 1]);
    const section = countSectionSessions(rows, NO_SUMMARY_CAPABILITIES);
    assert.deepEqual(
      [section.approvalCount, section.questionCount, section.attentionCount, section.backgroundWorkCount],
      [1, 1, 1, 1],
    );
  });
});

/**
 * OMP's stored question card: the computer publishes `awaitingAnswer` (announced in `capabilities`) and counts no
 * `pendingQuestionCount`. The headers, the tabs, the sections and a folded coordinator's stack count it pink, as the
 * triage, the notifications and the Live Activity read it; from a computer that does not announce the field it
 * stays a finished turn (blue).
 */
describe('an open question card counts as a question', () => {
  const card = { activity: 'attention', awaitingAnswer: true, status: 'running', isLive: true, provider: 'zmx' };
  const parsed = (capabilities: object | undefined): GhostexMobileSummary => {
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        projects: [{ projectId: 'p1', name: 'Project', path: '/work/project' }],
        sessions: [
          {
            sessionId: 'lead',
            projectId: 'p1',
            title: 'Lead',
            provider: 'zmx',
            status: 'running',
            isLive: true,
            coordinatorRole: 'coordinator',
            activity: 'idle',
          },
          {
            sessionId: 'thread',
            projectId: 'p1',
            title: 'Thread',
            coordinatorProjectId: 'p1',
            coordinatorSessionId: 'lead',
            ...card,
          },
          { sessionId: 'solo', projectId: 'p1', title: 'Solo', ...card },
        ],
        ...(capabilities === undefined ? {} : { capabilities }),
      }),
    );
    assert.ok(summary !== null);
    return summary;
  };
  const drawer = (summary: GhostexMobileSummary): DrawerItem[] =>
    buildDrawerItems({
      machineId: 'm1',
      summary,
      expandedProjectKeys: new Set(['id:p1']),
      expandedCollectionIds: new Set(),
      expandedGroupKeys: new Set(),
      collapsedSessionKindKeys: new Set(),
      collapsedCoordinatorKeys: new Set([coordinatorRowKey({ projectId: 'p1', sessionId: 'lead' })]),
    });
  const pinkAndBlue = (summary: GhostexMobileSummary) => {
    const items = drawer(summary);
    const project = items.find((item) => item.type === 'PROJECT_HEADER');
    const projects = items.find((item) => item.type === 'SECTION_LABEL');
    const lead = items.find(
      (item): item is SessionItem => item.type === 'SESSION' && item.session.sessionId === 'lead',
    );
    const tab = tabStatusCounts(machineSessionCounts(summary));
    const otherSpace = spaceSessionCounts(summary, [])[OTHER_SIDEBAR_SPACE_ID];
    assert.ok(otherSpace !== undefined);
    const space = tabStatusCounts(otherSpace);
    const section = countSectionSessions(summary.sessions, summary.capabilities);
    assert.ok(project?.type === 'PROJECT_HEADER' && projects?.type === 'SECTION_LABEL');
    return {
      project: [project.questionCount, project.attentionCount],
      projects: [projects.questionCount, projects.attentionCount],
      tab: [tab.questionCount, tab.attentionCount],
      space: [space.questionCount, space.attentionCount],
      section: [section.questionCount, section.attentionCount],
      folded: [lead?.nesting?.foldedStatus?.question, lead?.nesting?.foldedStatus?.attention],
    };
  };

  test('from a computer that announces the field: pink on every count and on the folded stack', () => {
    assert.deepEqual(pinkAndBlue(parsed({ awaitingAnswer: true })), {
      project: [2, 0],
      projects: [2, 0],
      tab: [2, 0],
      space: [2, 0],
      section: [2, 0],
      folded: [true, false],
    });
  });

  test('from a computer that does not announce it: blue, as before', () => {
    for (const summary of [parsed(undefined), parsed({ awaitingAnswer: false })]) {
      assert.deepEqual(pinkAndBlue(summary), {
        project: [0, 2],
        projects: [0, 2],
        tab: [0, 2],
        space: [0, 2],
        section: [0, 2],
        folded: [false, true],
      });
    }
  });
});
