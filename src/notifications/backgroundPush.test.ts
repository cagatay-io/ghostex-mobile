/// <reference types="node" />
/**
 * Run with `bun test src/notifications/backgroundPush.test.ts`. The real handler of a push that iOS hands to
 * the app in the background (`handleBackgroundPush`); faked are the boundaries only: the stores a launch in the
 * background loads, the session list's refresh over the warm link, the app state, the record of announced
 * events and the timer. The payloads are what expo-notifications passes to the background task on iOS.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BACKGROUND_PUSH_BUDGET_MS, handleBackgroundPush, type BackgroundPushDeps } from './backgroundPush';
import type { PushEvent } from './pushMessage';

const DATA = { kind: 'finished', machineId: 'm1', sessionId: 's1', notificationId: 'n1' };

/** A push as the background task receives it: Expo's data under `body`, also as a JSON string. */
function payload(
  options: { contentAvailable?: boolean; alert?: boolean; sound?: boolean; data?: Record<string, unknown> } = {},
) {
  const data = options.data ?? DATA;
  return {
    data: { body: data, dataString: JSON.stringify(data), scopeKey: '@owner/ghostex-mobile' },
    aps: {
      ...(options.contentAvailable === false ? {} : { 'content-available': 1 }),
      ...(options.alert === false ? {} : { alert: { title: 'Claude Code · ghostex-mobile', body: 'Finished' } }),
      ...(options.sound === true ? { sound: 'default' } : {}),
    },
    notification: options.alert === false ? null : { title: 'Claude Code · ghostex-mobile', body: 'Finished' },
  };
}

function harness(options: { inBackground?: () => boolean; refresh?: () => Promise<void> } = {}) {
  const steps: string[] = [];
  const shown: PushEvent[] = [];
  /** Whether each push the record took sounded, in order. */
  const sounds: boolean[] = [];
  /** Whether each record was the same presentation recorded once more, in order. */
  const agains: boolean[] = [];
  const logs: string[] = [];
  const waits: number[] = [];
  let cancelled = 0;
  /** Resolves the budget's timer; pending until a test lets it run out. */
  let expire: () => void = () => undefined;
  /** Settles once the handler waits on its budget. */
  const waiting = Promise.withResolvers<void>();
  const deps: BackgroundPushDeps = {
    prepare: async () => void steps.push('prepare'),
    refreshSessions: options.refresh ?? (async () => void steps.push('refresh')),
    inBackground: options.inBackground ?? (() => true),
    shownByIos: (event, sound, again) => {
      steps.push('recorded');
      shown.push(event);
      sounds.push(sound);
      agains.push(again);
    },
    startTimer: (ms) => {
      waits.push(ms);
      const timer = Promise.withResolvers<void>();
      expire = timer.resolve;
      waiting.resolve();
      return { expired: timer.promise, cancel: () => void (cancelled += 1) };
    },
    log: (line) => void logs.push(line),
  };
  return {
    deps,
    steps,
    shown,
    sounds,
    agains,
    logs,
    waits,
    cancelled: () => cancelled,
    waiting: waiting.promise,
    expire: () => expire(),
  };
}

describe('a push with content-available', () => {
  test('refreshes the session list once and completes with new data', async () => {
    const app = harness();
    assert.equal(await handleBackgroundPush(payload(), app.deps), 'newData');
    assert.deepEqual(
      app.steps.filter((step) => step === 'refresh'),
      ['refresh'],
    );
    assert.equal(app.steps.indexOf('prepare') < app.steps.indexOf('refresh'), true);
    assert.deepEqual(app.waits, [BACKGROUND_PUSH_BUDGET_MS]);
    // The budget's timer does not outlive the run.
    assert.equal(app.cancelled(), 1);
  });

  test('completes within its budget when the session list does not answer', async () => {
    const app = harness({ refresh: () => Promise.withResolvers<void>().promise });
    const result = handleBackgroundPush(payload(), app.deps);
    await app.waiting;
    app.expire();
    assert.equal(await result, 'failed');
    assert.deepEqual(app.logs, ['Push: the session list was not refreshed in the background in time']);
  });

  test('completes when the refresh fails, with a fixed log line', async () => {
    const app = harness({ refresh: () => Promise.reject(new Error('secret agent text')) });
    assert.equal(await handleBackgroundPush(payload(), app.deps), 'failed');
    assert.deepEqual(app.logs, ['Push: the session list was not refreshed in the background (unexpected)']);
  });

  test('also refreshes for a push without an alert (an agent started)', async () => {
    const app = harness();
    const started = payload({ alert: false, data: { kind: 'agentStarted', machineId: 'm1', sessionId: 's1' } });
    assert.equal(await handleBackgroundPush(started, app.deps), 'newData');
    assert.deepEqual(app.steps, ['prepare', 'refresh']);
    assert.deepEqual(app.shown, []);
  });
});

describe('the alert iOS showed while the app was in the background', () => {
  test('goes to the record before the refresh (a running app may read the feed meanwhile) and again after it', async () => {
    const app = harness();
    await handleBackgroundPush(payload(), app.deps);
    assert.deepEqual(app.steps, ['prepare', 'recorded', 'refresh', 'recorded']);
    assert.deepEqual(app.shown, [DATA, DATA]);
  });

  test('the second record is the same presentation once more, so the record counts it once', async () => {
    const app = harness();
    await handleBackgroundPush(payload(), app.deps);
    assert.deepEqual(app.agains, [false, true]);
  });

  test('when the stores did not load in time, the one record after the budget is the first', async () => {
    const app = harness();
    app.deps.prepare = () => Promise.withResolvers<void>().promise;
    const result = handleBackgroundPush(payload(), app.deps);
    await app.waiting;
    app.expire();
    await result;
    assert.deepEqual(app.agains, [false]);
  });

  test('goes to the record when the app was in the background as the push came, also if it is in front by then', async () => {
    let background = true;
    const app = harness({
      inBackground: () => background,
      refresh: async () => {
        background = false;
      },
    });
    await handleBackgroundPush(payload(), app.deps);
    assert.deepEqual(app.shown, [DATA, DATA]);
  });

  test('goes to the record also when the session list could not be refreshed', async () => {
    const app = harness({ refresh: () => Promise.reject(new Error('down')) });
    await handleBackgroundPush(payload(), app.deps);
    assert.deepEqual(app.shown, [DATA, DATA]);
  });

  test('is left to the app in front, which takes the push itself', async () => {
    const app = harness({ inBackground: () => false });
    assert.equal(await handleBackgroundPush(payload(), app.deps), 'newData');
    assert.deepEqual(app.steps, ['prepare', 'refresh']);
  });

  test('reads the data from its JSON string when the dictionary is missing', async () => {
    const app = harness();
    const push = payload();
    const { body: _body, ...rest } = push.data;
    await handleBackgroundPush({ ...push, data: rest }, app.deps);
    assert.deepEqual(app.shown, [DATA, DATA]);
  });

  test('goes to the record with the sound only when the push carried one: a push without one was silent', async () => {
    const silent = harness();
    await handleBackgroundPush(payload(), silent.deps);
    assert.deepEqual(silent.sounds, [false, false]);

    const sounding = harness();
    await handleBackgroundPush(payload({ sound: true }), sounding.deps);
    assert.deepEqual(sounding.sounds, [true, true]);
  });
});

describe('what the background handler leaves alone', () => {
  test('a push without content-available: nothing is refreshed or recorded', async () => {
    const app = harness();
    assert.equal(await handleBackgroundPush(payload({ contentAvailable: false }), app.deps), 'noData');
    assert.deepEqual(app.steps, []);
  });

  test('a tap handed to the task (not on iOS) is no push', async () => {
    const app = harness();
    const response = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: {} };
    assert.equal(await handleBackgroundPush(response, app.deps), 'noData');
    assert.deepEqual(app.steps, []);
  });

  test('a payload that is not one: nothing happens and nothing throws', async () => {
    for (const odd of [null, undefined, 'text', 42, { data: null }, { aps: 'x' }]) {
      const app = harness();
      assert.equal(await handleBackgroundPush(odd, app.deps), 'noData');
      assert.deepEqual(app.steps, []);
    }
  });
});
