/// <reference types="node" />
/**
 * Run with `bun test src/notifications/firstAsk.test.ts`. The one-time ask: the real `runFirstAsk`
 * with a fake permission adapter and an in-memory settings store.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { runFirstAsk, type PermissionAdapter, type PermissionState } from './firstAsk';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from './settings';

function fakes(answer: PermissionState, stored: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS }) {
  let settings = stored;
  let requests = 0;
  const permission: PermissionAdapter = {
    current: async () => answer,
    request: async () => {
      requests += 1;
      return answer;
    },
  };
  const access = { get: () => settings, set: (next: NotificationSettings) => void (settings = next) };
  return { permission, access, settings: () => settings, requests: () => requests };
}

const NOW = () => new Date('2026-10-29T10:00:00Z');

describe('the one-time ask', () => {
  test('granted turns all four on and stores askedAt', async () => {
    const f = fakes('granted');
    await runFirstAsk(f.permission, f.access, NOW);
    assert.deepEqual(f.settings(), {
      enabled: true,
      finished: true,
      waiting: true,
      error: true,
      askedAt: '2026-10-29T10:00:00.000Z',
    });
  });

  test('denied leaves all four off and stores askedAt', async () => {
    const f = fakes('denied');
    await runFirstAsk(f.permission, f.access, NOW);
    assert.deepEqual(f.settings(), {
      enabled: false,
      finished: false,
      waiting: false,
      error: false,
      askedAt: '2026-10-29T10:00:00.000Z',
    });
  });

  test('a later start with askedAt set does not request the prompt again', async () => {
    const f = fakes('granted', { ...DEFAULT_NOTIFICATION_SETTINGS, askedAt: '2026-10-28T10:00:00Z' });
    assert.equal(await runFirstAsk(f.permission, f.access, NOW), 'alreadyAsked');
    assert.equal(f.requests(), 0);
  });

  test('an unanswered prompt stores nothing, so the ask happens at the next launch', async () => {
    const f = fakes('undetermined');
    assert.equal(await runFirstAsk(f.permission, f.access, NOW), 'unanswered');
    assert.equal(f.settings().askedAt, undefined);
  });
});
