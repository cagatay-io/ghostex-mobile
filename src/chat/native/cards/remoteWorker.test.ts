/// <reference types="node" />
/** Run with `bun test src/chat/native/cards/remoteWorker.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { remoteWorkerComputer, remoteWorkerNotice, remoteWorkerOfAction } from './remoteWorker';

const here = { projectId: 'P1', sessionId: 'G1', title: 'Fix the tray' };
const windows = { serverId: 'S8g', computer: 'Windows', projectId: 'P5', sessionId: 'G9', title: 'CPU churn' };

describe('remoteWorkerComputer', () => {
  test('a worker on the coordinator’s computer has none', () => {
    assert.equal(remoteWorkerComputer(here), null);
  });
  test('a worker on another computer is named by it', () => {
    assert.equal(remoteWorkerComputer(windows), 'Windows');
  });
  test('a computer gxserver could not name still reads as another one', () => {
    assert.equal(remoteWorkerComputer({ ...windows, computer: ' ' }), 'another computer');
  });
});

describe('remoteWorkerNotice', () => {
  test('says where it runs and where to open it', () => {
    assert.deepEqual(remoteWorkerNotice('Windows'), {
      title: 'Runs on Windows',
      message: 'This worker runs on Windows. Open it in Ghostex on that computer.',
    });
  });
});

describe('remoteWorkerOfAction', () => {
  const rows = [here, windows];
  test('an open with no server id is the coordinator’s computer', () => {
    assert.equal(remoteWorkerOfAction({ projectId: 'P1', sessionId: 'G1' }, rows), null);
  });
  test('an open naming another computer takes the row’s name', () => {
    assert.equal(remoteWorkerOfAction({ serverId: 'S8g', projectId: 'P5', sessionId: 'G9' }, rows), 'Windows');
  });
  test('a row the sheet no longer lists still reads as another computer', () => {
    assert.equal(remoteWorkerOfAction({ serverId: 'S8g', projectId: 'P5', sessionId: 'G0' }, null), 'another computer');
  });
});
