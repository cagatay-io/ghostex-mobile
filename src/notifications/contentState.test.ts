/**
 * REQ-LIVEACT-001 AC1-AC11 and AC14, REQ-LIVEACT-002 AC1 and AC3, REQ-LIVEACT-003 AC1-AC6, REQ-LIVEACT-004's
 * condition from D-063, REQ-LIVEACT-009 AC1 (content side) and REQ-LIVEACT-011 AC1-AC3: the real
 * `buildContentState` and `computersNeedingUpdate` on summary fixtures in the CLI's wire form, read by the real
 * summary parser, with an injected clock. The schema checks of REQ-LIVEACT-001 AC15 and REQ-LIVEACT-002 AC1
 * run `python3 -m jsonschema` on these outputs (PR text).
 *
 * The fixtures come from a computer with host changes H1a (`workingStartedAt`) and H1b (`attention.kind`),
 * except `summary-older-host.json`, which has neither (research/spike-host-data.md §1).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary, type GhostexMobileSummary } from '../contract/mobileSummary';
import { parseSessionLink } from '../app/deepLinkHandler';
import { buildContentState, computersNeedingUpdate, workingStints, type ActivitySource } from './contentState';
import oneFinished from './fixtures/summary-1fin.json';
import oneWaiting from './fixtures/summary-1wait.json';
import oneWaitingQuestion from './fixtures/summary-1wait-question.json';
import twoWorkingOneWaiting from './fixtures/summary-2w-1wait.json';
import twoWaitingOneWorkingTwoFinished from './fixtures/summary-2wait-1w-2fin.json';
import fourWorkingOneFinished from './fixtures/summary-4w-1fin.json';
import fourWorkingTwoWaiting from './fixtures/summary-4w-2wait.json';
import longNames from './fixtures/summary-long-names.json';
import olderHost from './fixtures/summary-older-host.json';
import sameAgentProject from './fixtures/summary-same-agent-project.json';

const MACHINE = 'f3b2c1d0-1111-4222-8333-944445555666';
const NOW = Date.parse('2026-10-24T10:42:00Z');

function summary(fixture: unknown): GhostexMobileSummary {
  const parsed = parseMobileSummary(JSON.stringify(fixture));
  assert.ok(parsed !== null, 'the fixture parses as a mobile summary');
  return parsed;
}

function sources(fixture: unknown, loadedAt = NOW): ActivitySource[] {
  return [{ machineId: MACHINE, summary: summary(fixture), loadedAt }];
}

const sessionIds = (fixture: unknown, now = NOW) =>
  buildContentState(sources(fixture), now).agents.map((row) => row.target.sessionId);

describe('rows, order and counts', () => {
  test('REQ-LIVEACT-001 AC1: two working and one waiting: the waiting agent first, then the working ones', () => {
    assert.deepEqual(sessionIds(twoWorkingOneWaiting), ['s-omp', 's-claude', 's-codex']);
    const states = buildContentState(sources(twoWorkingOneWaiting), NOW).agents.map((row) => row.state);
    assert.deepEqual(states, ['waiting', 'working', 'working']);
  });

  test('REQ-LIVEACT-001 AC2, AC3: counts are working 2 and waiting 1, moreCount 0', () => {
    const state = buildContentState(sources(twoWorkingOneWaiting), NOW);
    assert.deepEqual(state.counts, { working: 2, waiting: 1 });
    assert.equal(state.moreCount, 0);
  });

  test('REQ-LIVEACT-001 AC4: four working and two waiting: four rows, the two waiting first (oldest first)', () => {
    assert.deepEqual(sessionIds(fourWorkingTwoWaiting), ['q2', 'q1', 'w1', 'w2']);
  });

  test('REQ-LIVEACT-001 AC5, AC6: moreCount 2, counts working 4 and waiting 2', () => {
    const state = buildContentState(sources(fourWorkingTwoWaiting), NOW);
    assert.equal(state.moreCount, 2);
    assert.deepEqual(state.counts, { working: 4, waiting: 2 });
  });

  test('REQ-LIVEACT-001 AC7: two waiting, one working, two finished: the newest finished takes the free row', () => {
    assert.deepEqual(sessionIds(twoWaitingOneWorkingTwoFinished), ['a-wait', 'b-wait', 'c-work', 'd-fin30']);
  });

  test('REQ-LIVEACT-001 AC8, AC9: moreCount 1, counts exclude the finished agents', () => {
    const state = buildContentState(sources(twoWaitingOneWorkingTwoFinished), NOW);
    assert.equal(state.moreCount, 1);
    assert.deepEqual(state.counts, { working: 1, waiting: 2 });
  });

  test('REQ-LIVEACT-001 AC10, AC11: four working and one finished 30 s ago: four working rows, moreCount 1', () => {
    const state = buildContentState(sources(fourWorkingOneFinished), NOW);
    assert.deepEqual(
      state.agents.map((row) => [row.target.sessionId, row.state]),
      [
        ['w1', 'working'],
        ['w2', 'working'],
        ['w3', 'working'],
        ['w4', 'working'],
      ],
    );
    assert.equal(state.moreCount, 1);
  });

  test('REQ-LIVEACT-001 AC14: names over 64 characters are cut to 64 characters, four-byte characters whole', () => {
    const [row] = buildContentState(sources(longNames), NOW).agents;
    assert.ok(row !== undefined);
    assert.equal(Array.from(row.agentName).length, 64);
    assert.equal(row.agentName, 'x'.repeat(64));
    assert.equal(Array.from(row.project).length, 64);
    assert.equal(row.project, '\u{1F916}'.repeat(64));
  });
});

describe('row content', () => {
  test('REQ-LIVEACT-002 AC1: a row carries name, project, state, start and target, and no title or message text', () => {
    const [row] = buildContentState(sources(twoWorkingOneWaiting), NOW).agents;
    assert.deepEqual(row, {
      target: { machineId: MACHINE, sessionId: 's-omp' },
      agentName: 'omp',
      project: 'Ghostex',
      state: 'waiting',
      startedAt: '2026-10-24T10:40:00.000Z',
    });
    const text = JSON.stringify(buildContentState(sources(twoWorkingOneWaiting), NOW));
    assert.ok(!text.includes('must not leak'), 'the session titles of the fixture never reach the state');
  });

  test('REQ-LIVEACT-002 AC3: two sessions of the same agent and project keep their own session ids', () => {
    const rows = buildContentState(sources(sameAgentProject), NOW).agents;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.agentName, rows[1]?.agentName);
    assert.equal(rows[0]?.project, rows[1]?.project);
    assert.deepEqual(
      rows.map((row) => row.target.sessionId),
      ['sess&1', 'sess&2'],
    );
  });

  test('REQ-LIVEACT-009 AC1: the deep link of one same-named row opens exactly that session', () => {
    const rows = buildContentState(sources(sameAgentProject), NOW).agents;
    const second = rows[1];
    assert.ok(second !== undefined);
    // The link the extension builds (`GhostexActivityTarget.deepLink`, checked against the same literal by
    // the Swift test): ids percent-encoded, so `&` inside an id cannot cut the query.
    const url = 'ghostex://session?machineId=f3b2c1d0-1111-4222-8333-944445555666&sessionId=sess%262';
    assert.deepEqual(parseSessionLink(url), {
      machineId: second.target.machineId,
      sessionId: second.target.sessionId,
      title: '',
      view: null,
    });
    assert.notEqual(parseSessionLink(url)?.sessionId, rows[0]?.target.sessionId);
  });

  test('REQ-LIVEACT-002 AC1: the data time is the oldest read of the summaries used', () => {
    const fresh = sources(twoWorkingOneWaiting, NOW - 5_000);
    const older = [{ machineId: 'second-machine', summary: summary(oneWaiting), loadedAt: NOW - 90_000 }];
    const state = buildContentState([...fresh, ...older], NOW);
    assert.equal(state.updatedAt, new Date(NOW - 90_000).toISOString());
    assert.deepEqual(state.counts, { working: 2, waiting: 2 });
  });
});

describe('finished agents', () => {
  const t0 = Date.parse('2026-10-24T10:40:00Z');

  test('REQ-LIVEACT-003 AC1, AC2: 119 s after finishing it is a finished row that expires at t0 + 120 s', () => {
    const state = buildContentState(sources(oneFinished), t0 + 119_000);
    assert.equal(state.agents.length, 1);
    assert.equal(state.agents[0]?.state, 'finished');
    assert.equal(state.agents[0]?.finishedAt, new Date(t0).toISOString());
    assert.equal(state.agents[0]?.expiresAt, new Date(t0 + 120_000).toISOString());
  });

  test('REQ-LIVEACT-003 AC3, AC4: 121 s after finishing it is neither a row nor counted in moreCount', () => {
    const state = buildContentState(sources(oneFinished), t0 + 121_000);
    assert.deepEqual(state.agents, []);
    assert.equal(state.moreCount, 0);
    assert.deepEqual(state.counts, { working: 0, waiting: 0 });
  });

  test('REQ-LIVEACT-003 AC5, AC6: with four working agents the agent finished 30 s ago gets no row, moreCount counts it', () => {
    const state = buildContentState(sources(fourWorkingOneFinished), NOW);
    assert.ok(state.agents.every((row) => row.target.sessionId !== 'f1'));
    assert.equal(state.moreCount, 1);
  });

  test('REQ-LIVEACT-002 AC1 (H1a addendum): a finished row runs from its last workingStartedAt to attention.enteredAt, also on a cold start', () => {
    const [row] = buildContentState(sources(oneFinished), t0 + 30_000).agents;
    assert.equal(row?.startedAt, '2026-10-24T10:22:00.000Z');
    assert.equal(row?.finishedAt, '2026-10-24T10:40:00.000Z');
  });
});

describe('pending question', () => {
  test('REQ-LIVEACT-011 AC1, AC3: a waiting agent with a pending question has hasQuestion, state waiting, counted as waiting', () => {
    const state = buildContentState(sources(oneWaitingQuestion), NOW);
    assert.equal(state.agents[0]?.hasQuestion, true);
    assert.equal(state.agents[0]?.state, 'waiting');
    assert.equal(state.counts.waiting, 1);
  });

  test('REQ-LIVEACT-011 AC2: without a pending question the row has no hasQuestion', () => {
    const [row] = buildContentState(sources(oneWaiting), NOW).agents;
    assert.ok(row !== undefined);
    assert.equal('hasQuestion' in row, false);
  });
});

describe('every row has its time (REQ-LIVEACT-002, schema startedAt)', () => {
  test('REQ-LIVEACT-002 AC1: working rows start at workingStartedAt, waiting rows at attention.enteredAt', () => {
    const state = buildContentState(sources(twoWorkingOneWaiting), NOW);
    assert.deepEqual(
      state.agents.map((row) => [row.target.sessionId, row.state, row.startedAt]),
      [
        ['s-omp', 'waiting', '2026-10-24T10:40:00.000Z'],
        ['s-claude', 'working', '2026-10-24T10:30:00.000Z'],
        ['s-codex', 'working', '2026-10-24T10:35:00.000Z'],
      ],
    );
  });

  test("Main's derivation 2026-10-29: a wait without attention.enteredAt is counted, in moreCount, without a row", () => {
    const state = buildContentState(
      sources({
        sessions: [
          {
            sessionId: 'appr',
            provider: 'zmx',
            agent: 'codex',
            projectName: 'p',
            activity: 'working',
            awaitingApproval: true,
            workingStartedAt: '2026-10-24T10:30:00Z',
          },
        ],
      }),
      NOW,
    );
    assert.deepEqual(state.agents, []);
    assert.deepEqual(state.counts, { working: 0, waiting: 1 });
    assert.equal(state.moreCount, 1);
  });
});

describe('computers without host changes H1a and H1b (D-063, REQ-LIVEACT-004)', () => {
  test('a summary with a working agent without workingStartedAt and an agent in attention without kind needs an update', () => {
    assert.deepEqual(computersNeedingUpdate(sources(olderHost)), [MACHINE]);
  });

  test('a working agent without workingStartedAt alone is enough', () => {
    const workingOnly = {
      sessions: [{ sessionId: 'w', provider: 'zmx', agent: 'claude', projectName: 'p', activity: 'working' }],
    };
    assert.deepEqual(computersNeedingUpdate(sources(workingOnly)), [MACHINE]);
  });

  test('an agent in attention without attention.kind alone is enough', () => {
    const attentionOnly = {
      sessions: [
        {
          sessionId: 'a',
          provider: 'zmx',
          agent: 'claude',
          projectName: 'p',
          activity: 'attention',
          attention: { enteredAt: '2026-10-24T10:41:00Z' },
        },
      ],
    };
    assert.deepEqual(computersNeedingUpdate(sources(attentionOnly)), [MACHINE]);
  });

  test('a finished agent without the workingStartedAt of its last stint is enough (H1a addendum)', () => {
    const finishedWithoutStart = {
      sessions: [
        {
          sessionId: 'f',
          provider: 'zmx',
          agent: 'claude',
          projectName: 'p',
          activity: 'attention',
          attention: { enteredAt: '2026-10-24T10:41:00Z', kind: 'finished' },
        },
      ],
    };
    assert.deepEqual(computersNeedingUpdate(sources(finishedWithoutStart)), [MACHINE]);
  });

  test('the fixtures of a current host need no update', () => {
    const fixtures = [
      oneFinished,
      oneWaiting,
      oneWaitingQuestion,
      twoWorkingOneWaiting,
      twoWaitingOneWorkingTwoFinished,
      fourWorkingOneFinished,
      fourWorkingTwoWaiting,
      longNames,
      sameAgentProject,
    ];
    for (const fixture of fixtures) assert.deepEqual(computersNeedingUpdate(sources(fixture)), []);
  });

  test('a summary without working or attention agents proves nothing and is not listed', () => {
    const idleOnly = {
      sessions: [{ sessionId: 'i', provider: 'zmx', agent: 'claude', projectName: 'p', activity: 'idle' }],
    };
    assert.deepEqual(computersNeedingUpdate(sources(idleOnly)), []);
  });

  test('with several computers only the one without the fields is listed', () => {
    const current = sources(twoWorkingOneWaiting);
    const older: ActivitySource[] = [{ machineId: 'older-mac', summary: summary(olderHost), loadedAt: NOW }];
    assert.deepEqual(computersNeedingUpdate([...current, ...older]), ['older-mac']);
  });
});

describe('working stints, which start the activity again (REQ-LIVEACT-004 AC1)', () => {
  test('REQ-LIVEACT-004 AC1: every working agent with its session and stint start, also those without a row', () => {
    const state = buildContentState(sources(fourWorkingTwoWaiting), NOW);
    assert.deepEqual(
      state.agents.filter((row) => row.state === 'working').map((row) => row.target.sessionId),
      ['w1', 'w2'],
      'w3 and w4 have no row',
    );
    assert.deepEqual(workingStints(sources(fourWorkingTwoWaiting), NOW), [
      `${MACHINE}\nw1\n2026-10-24T10:20:00Z`,
      `${MACHINE}\nw2\n2026-10-24T10:25:00Z`,
      `${MACHINE}\nw3\n2026-10-24T10:30:00Z`,
      `${MACHINE}\nw4\n2026-10-24T10:35:00Z`,
    ]);
  });

  test('REQ-LIVEACT-004 AC1: waiting and finished agents have no working stint', () => {
    assert.deepEqual(workingStints(sources(oneWaiting), NOW), []);
    assert.deepEqual(workingStints(sources(oneFinished), NOW), []);
  });
});
