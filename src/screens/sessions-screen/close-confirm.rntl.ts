/// <reference types="jest" />
import assert from 'node:assert/strict';

import { NO_SUMMARY_CAPABILITIES, parseSession } from '../../contract/mobileSummary';
import { closeConfirmCopy } from './close-confirm';

jest.mock('../../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

test('closing an agent warns about an announced open question without changing its count', () => {
  const session = parseSession({
    sessionId: 'asking', projectId: 'project', kind: 'agent', lifecycleState: 'running',
    activity: 'working', title: 'Review changes', pendingQuestionCount: 0, awaitingAnswer: true,
  });
  assert.ok(session);
  const capabilities = { ...NO_SUMMARY_CAPABILITIES, awaitingAnswer: true };
  assert.match(closeConfirmCopy(session, [session], capabilities)?.body ?? '', /waiting for your answer/);
  assert.equal(session.pendingQuestionCount, 0);
  assert.match(closeConfirmCopy(session, [session], NO_SUMMARY_CAPABILITIES)?.body ?? '', /middle of a turn/);

  session.pendingQuestionCount = 2;
  assert.match(closeConfirmCopy(session, [session], NO_SUMMARY_CAPABILITIES)?.body ?? '', /waiting for your answer/);
  assert.equal(session.pendingQuestionCount, 2);
  session.pendingQuestionCount = 0;
  session.awaitingApproval = true;
  assert.match(closeConfirmCopy(session, [session], NO_SUMMARY_CAPABILITIES)?.body ?? '', /waiting for your answer/);
});
