/// <reference types="node" />
/**
 * Run with `bun test src/notifications/pushMessage.test.ts`. What the app reads from a push message's data (the
 * computer's push message: `kind`, `machineId`, `sessionId`, optional `notificationId`; identifiers only) and
 * which of the phone's computers a push names.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { pushEventFromData, pushMachineId } from './pushMessage';

describe('pushEventFromData', () => {
  test('reads kind, computer, session and the feed row id', () => {
    assert.deepEqual(
      pushEventFromData({ kind: 'needsInput', machineId: 'm1', sessionId: 's1', notificationId: 'n1' }),
      {
        kind: 'needsInput',
        machineId: 'm1',
        sessionId: 's1',
        notificationId: 'n1',
      },
    );
  });

  test('a push without a feed row id has none', () => {
    assert.equal(pushEventFromData({ kind: 'finished', machineId: 'm1', sessionId: 's1' })?.notificationId, '');
  });

  test('keeps a kind it does not know, so the mapping decides (it never notifies)', () => {
    assert.equal(pushEventFromData({ kind: 'agentStarted', machineId: 'm1', sessionId: 's1' })?.kind, 'agentStarted');
  });

  test('data without a usable computer, session or kind is no push event', () => {
    for (const data of [
      null,
      undefined,
      'text',
      {},
      { kind: 'finished', sessionId: 's1' },
      { kind: 'finished', machineId: 'm1' },
      { machineId: 'm1', sessionId: 's1' },
      { kind: 'finished', machineId: '', sessionId: 's1' },
      { kind: 'finished', machineId: 'm 1', sessionId: 's1' },
      { kind: 'finished', machineId: 'm1', sessionId: 'x'.repeat(65) },
      { kind: 'finished', machineId: 'm1', sessionId: 's1', notificationId: 42 },
      { kind: 'finished', machineId: 'm1', sessionId: 's1', notificationId: 'n'.repeat(129) },
    ]) {
      assert.equal(pushEventFromData(data), null, JSON.stringify(data));
    }
  });
});

describe('pushMachineId', () => {
  const machines = [{ id: 'm1' }, { id: 'm2' }];

  test('names the enabled computer with that id', () => {
    assert.equal(pushMachineId('m2', machines), 'm2');
  });

  test('names none for an id no enabled computer has', () => {
    assert.equal(pushMachineId('m3', machines), null);
  });
});
