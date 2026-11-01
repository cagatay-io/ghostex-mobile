/**
 * Run with `bun test src/screens/wall/previews.test.ts`. The session wall's live thumbnails refresh only while the
 * tiles view is visible, for battery and bandwidth. The scheduler is the real one; the computer's read, the published
 * previews and the interval timers are fakes, so the test advances a fake clock instead of waiting. A session's output
 * changing is the world moving on: nothing on the phone knows about it until a read is made, so while hidden there is
 * none, however much time passes and however the session's status changes.
 *
 * Also the reader of the computer's answer (`readSessionTerminalTail`: the screen's last lines, colour codes already
 * removed) and the tiles a list shows.
 */

import { describe, expect, test } from 'bun:test';

import type { DrawerBlock, ProjectCardBlock } from '../../components/sessions/drawerModel';
import type { DrawerItem, GroupHeaderItem, ProjectHeaderItem, SessionItem } from '../../contract/grouping';
import type { GhostexSession } from '../../contract/mobileSummary';
import {
  createPreviewScheduler,
  previewFromTail,
  THUMB_LINES,
  WALL_MAX_READS,
  WALL_REFRESH_MS,
  wallTargets,
  type Preview,
  type PreviewTarget,
} from './previews';

/** A fake clock with interval timers only, which is all the scheduler uses. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const intervals = new Map<number, { run: () => void; ms: number; due: number }>();
  return {
    timers: {
      setInterval: (run: () => void, ms: number): number => {
        const id = nextId++;
        intervals.set(id, { run, ms, due: now + ms });
        return id;
      },
      clearInterval: (id: number): void => {
        intervals.delete(id);
      },
    },
    running: () => intervals.size,
    async advance(ms: number): Promise<void> {
      const end = now + ms;
      for (;;) {
        let next: { id: number; due: number } | null = null;
        for (const [id, interval] of intervals) {
          if (interval.due <= end && (next === null || interval.due < next.due)) next = { id, due: interval.due };
        }
        if (next === null) break;
        const interval = intervals.get(next.id);
        if (interval === undefined) break;
        now = interval.due;
        interval.due += interval.ms;
        interval.run();
        await settle();
      }
      now = end;
    },
  };
}

/** Lets resolved reads hand their previews on. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

/** A read of the computer that answers at once (or when released) and records each request. */
function fakeComputer({ hold = false }: { hold?: boolean } = {}) {
  const requests: string[] = [];
  const pending: (() => void)[] = [];
  const published: [string, Preview][] = [];
  return {
    requests,
    published,
    release: async (count = 1) => {
      for (let index = 0; index < count; index += 1) pending.shift()?.();
      await settle();
    },
    read: (target: PreviewTarget): Promise<Preview> => {
      requests.push(target.key);
      const preview: Preview = { kind: 'lines', lines: [`${target.key} screen`] };
      if (!hold) return Promise.resolve(preview);
      const answer = Promise.withResolvers<Preview>();
      pending.push(() => answer.resolve(preview));
      return answer.promise;
    },
    publish: (key: string, preview: Preview) => {
      published.push([key, preview]);
    },
  };
}

function target(sessionId: string, overrides: Partial<PreviewTarget> = {}): PreviewTarget {
  return {
    key: `m1:${sessionId}`,
    machineId: 'm1',
    projectId: 'p1',
    sessionId,
    live: false,
    signature: 'idle',
    ...overrides,
  };
}

function setup(options: { hold?: boolean } = {}) {
  const clock = fakeClock();
  const computer = fakeComputer(options);
  const scheduler = createPreviewScheduler({ read: computer.read, publish: computer.publish, timers: clock.timers });
  return { clock, computer, scheduler };
}

describe('while the tiles view is not visible', () => {
  test('a session whose output and status change gets no preview refresh request', async () => {
    const { clock, computer, scheduler } = setup();
    const working = target('a', { live: true, signature: 'working' });
    scheduler.update(false, [working]);
    await clock.advance(WALL_REFRESH_MS * 6);
    scheduler.update(false, [{ ...working, signature: 'attention' }]);
    await clock.advance(WALL_REFRESH_MS * 6);
    expect(computer.requests).toEqual([]);
    expect(clock.running()).toBe(0);
  });

  test('leaving the tiles view stops the refresh; nothing is read until it is shown again', async () => {
    const { clock, computer, scheduler } = setup();
    const working = target('a', { live: true, signature: 'working' });
    scheduler.update(true, [working]);
    await settle();
    expect(computer.requests).toEqual(['m1:a']);
    scheduler.update(false, [working]);
    await clock.advance(WALL_REFRESH_MS * 4);
    expect(computer.requests).toEqual(['m1:a']);
    expect(clock.running()).toBe(0);
    // Shown again, every tile is read once at once (its last preview may be old by now).
    scheduler.update(true, [working]);
    await settle();
    expect(computer.requests).toEqual(['m1:a', 'm1:a']);
  });

  test('after stop nothing is read or published, also for a read that was still on its way', async () => {
    const { clock, computer, scheduler } = setup({ hold: true });
    scheduler.update(true, [target('a', { live: true })]);
    scheduler.stop();
    await computer.release();
    await clock.advance(WALL_REFRESH_MS * 3);
    expect(computer.requests).toEqual(['m1:a']);
    expect(computer.published).toEqual([]);
  });
});

describe('while the tiles view is visible', () => {
  test('every tile is read once; a working session again every interval, an idle one not', async () => {
    const { clock, computer, scheduler } = setup();
    scheduler.update(true, [target('a', { live: true, signature: 'working' }), target('b')]);
    await settle();
    expect(computer.requests).toEqual(['m1:a', 'm1:b']);
    await clock.advance(WALL_REFRESH_MS);
    expect(computer.requests).toEqual(['m1:a', 'm1:b', 'm1:a']);
    await clock.advance(WALL_REFRESH_MS * 2);
    expect(computer.requests).toEqual(['m1:a', 'm1:b', 'm1:a', 'm1:a', 'm1:a']);
    expect(computer.published.at(-1)).toEqual(['m1:a', { kind: 'lines', lines: ['m1:a screen'] }]);
  });

  test('a status change reads the tile at once, an unchanged list does not read again', async () => {
    const { computer, scheduler } = setup();
    const idle = target('b');
    scheduler.update(true, [idle]);
    await settle();
    scheduler.update(true, [idle]);
    await settle();
    expect(computer.requests).toEqual(['m1:b']);
    scheduler.update(true, [{ ...idle, signature: 'attention' }]);
    await settle();
    expect(computer.requests).toEqual(['m1:b', 'm1:b']);
  });

  test('a session is never read twice at once; a change while its read is on its way reads it once more after', async () => {
    const { clock, computer, scheduler } = setup({ hold: true });
    const working = target('a', { live: true, signature: 'working' });
    scheduler.update(true, [working]);
    await clock.advance(WALL_REFRESH_MS * 2);
    scheduler.update(true, [{ ...working, signature: 'attention' }]);
    expect(computer.requests).toEqual(['m1:a']);
    await computer.release();
    expect(computer.requests).toEqual(['m1:a', 'm1:a']);
  });

  test(`at most ${WALL_MAX_READS} reads are on their way at a time; the next starts when one ends`, async () => {
    const { computer, scheduler } = setup({ hold: true });
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => target(id));
    scheduler.update(true, many);
    await settle();
    expect(computer.requests).toEqual(['m1:a', 'm1:b', 'm1:c', 'm1:d']);
    await computer.release();
    expect(computer.requests).toEqual(['m1:a', 'm1:b', 'm1:c', 'm1:d', 'm1:e']);
  });

  test('a tile that left the view is not read any more', async () => {
    const { clock, computer, scheduler } = setup();
    const working = target('a', { live: true, signature: 'working' });
    scheduler.update(true, [working, target('b')]);
    await settle();
    scheduler.update(true, [target('b')]);
    await clock.advance(WALL_REFRESH_MS * 3);
    expect(computer.requests).toEqual(['m1:a', 'm1:b']);
  });

  test('a failed read shows the tile as unavailable', async () => {
    const clock = fakeClock();
    const published: [string, Preview][] = [];
    const scheduler = createPreviewScheduler({
      read: () => Promise.reject(new Error('lost')),
      publish: (key, preview) => published.push([key, preview]),
      timers: clock.timers,
    });
    scheduler.update(true, [target('a')]);
    await settle();
    expect(published).toEqual([['m1:a', { kind: 'unavailable' }]]);
  });
});

describe("the computer's answer", () => {
  test(`a captured screen gives its newest ${THUMB_LINES} lines, in order`, () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
    expect(previewFromTail({ captured: true, lines })).toEqual({ kind: 'lines', lines: lines.slice(-THUMB_LINES) });
    expect(previewFromTail({ captured: true, lines: ['only'] })).toEqual({ kind: 'lines', lines: ['only'] });
  });

  test('a screen that could not be read, or an answer of another shape, is unavailable', () => {
    expect(previewFromTail({ captured: false, lines: [] })).toEqual({ kind: 'unavailable' });
    expect(previewFromTail({ captured: true })).toEqual({ kind: 'unavailable' });
    expect(previewFromTail({ captured: true, lines: 'text' })).toEqual({ kind: 'unavailable' });
    expect(previewFromTail(null)).toEqual({ kind: 'unavailable' });
  });

  test('entries that are not text are left out', () => {
    expect(previewFromTail({ captured: true, lines: ['a', 7, null, 'b'] })).toEqual({
      kind: 'lines',
      lines: ['a', 'b'],
    });
  });
});

describe('the tiles a list shows', () => {
  function session(sessionId: string, overrides: Partial<GhostexSession> = {}): GhostexSession {
    return {
      sessionId,
      projectId: 'p1',
      activity: 'idle',
      pendingQuestionCount: 0,
      awaitingApproval: false,
      backgroundWorkDetectedAt: '',
      programStatusFailed: false,
      lastInteractionAt: '',
      ...overrides,
    } as GhostexSession;
  }
  const item = (sessionId: string, overrides: Partial<SessionItem> = {}, sessionOverrides = {}): SessionItem =>
    ({
      type: 'SESSION',
      key: `session:${sessionId}`,
      groupId: '',
      session: session(sessionId, sessionOverrides),
      ...overrides,
    }) as SessionItem;
  const header = (collapsed: boolean): ProjectHeaderItem =>
    ({ type: 'PROJECT_HEADER', key: 'project:p1', collapsed }) as ProjectHeaderItem;
  const group = (groupId: string, collapsed: boolean): GroupHeaderItem =>
    ({ type: 'GROUP_HEADER', key: `group:${groupId}`, groupId, collapsed }) as GroupHeaderItem;
  const project = (card: ProjectCardBlock): DrawerBlock => ({
    kind: 'project',
    listKey: `m1:${card.header.key}`,
    machineId: 'm1',
    card,
  });

  test('the sessions of an open project, a working or background-work one live', () => {
    const children: DrawerItem[] = [
      item('a', {}, { activity: 'working' }),
      item('b', {}, { backgroundWorkDetectedAt: 'set' }),
      item('c'),
    ];
    const targets = wallTargets([project({ header: header(false), children })]);
    expect(
      targets.map(({ key, machineId, projectId, sessionId, live }) => ({ key, machineId, projectId, sessionId, live })),
    ).toEqual([
      { key: 'm1:a', machineId: 'm1', projectId: 'p1', sessionId: 'a', live: true },
      { key: 'm1:b', machineId: 'm1', projectId: 'p1', sessionId: 'b', live: true },
      { key: 'm1:c', machineId: 'm1', projectId: 'p1', sessionId: 'c', live: false },
    ]);
  });

  test('a collapsed project, collection or session group shows no tiles', () => {
    expect(wallTargets([project({ header: header(true), children: [item('a')] })])).toEqual([]);
    const grouped: DrawerItem[] = [
      item('a'),
      group('g1', true),
      item('b', { groupId: 'g1', inSessionGroup: true }),
      group('g2', false),
      item('c', { groupId: 'g2', inSessionGroup: true }),
    ];
    expect(wallTargets([project({ header: header(false), children: grouped })]).map((entry) => entry.key)).toEqual([
      'm1:a',
      'm1:c',
    ]);
    const collection = (collapsed: boolean): DrawerBlock =>
      ({
        kind: 'collection',
        listKey: 'm1:collection:c1',
        machineId: 'm1',
        header: { type: 'COLLECTION_HEADER', key: 'collection:c1', collapsed },
        projects: [{ header: header(false), children: [item('d')] }],
      }) as DrawerBlock;
    expect(wallTargets([collection(true)])).toEqual([]);
    expect(wallTargets([collection(false)]).map((entry) => entry.key)).toEqual(['m1:d']);
  });

  test('a status change changes the signature, so the tile is read again', () => {
    const before = wallTargets([
      project({ header: header(false), children: [item('a', {}, { activity: 'working' })] }),
    ]);
    const after = wallTargets([
      project({ header: header(false), children: [item('a', {}, { activity: 'attention' })] }),
    ]);
    expect(before[0]?.signature).not.toBe(after[0]?.signature);
  });
});
