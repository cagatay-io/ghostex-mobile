/// <reference types="node" />
/** Run with `bun test src/voice/focus.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  focusBannerDetail,
  focusChangeNotice,
  focusRef,
  outdatedFocusMessage,
  parseFocus,
  readyFocus,
  readyFromOlderServer,
  voiceCallAboutAction,
  type VoiceFocus,
} from './focus';

const voiceMode: VoiceFocus = {
  projectId: 'P3lv0',
  sessionId: 'G1z2p',
  title: 'Voice mode',
  project: 'Ghostex',
  orchestrator: 'Main Coordinator',
  closed: false,
};

describe('focus frames', () => {
  test('a focus object parses, with no orchestrator for a plain session', () => {
    assert.deepEqual(
      parseFocus({ projectId: 'P1', sessionId: 'S1', title: 'Sidebar fix', project: 'Ghostex', orchestrator: null, closed: false }),
      { projectId: 'P1', sessionId: 'S1', title: 'Sidebar fix', project: 'Ghostex', orchestrator: null, closed: false },
    );
  });

  test('a thread names its orchestrator, and a closed session says so', () => {
    const focus = parseFocus({ ...voiceMode, closed: true });
    assert.equal(focus?.orchestrator, 'Main Coordinator');
    assert.equal(focus?.closed, true);
  });

  test('null, a missing id or a non-object is all sessions', () => {
    assert.equal(parseFocus(null), null);
    assert.equal(parseFocus({ projectId: 'P1' }), null);
    assert.equal(parseFocus('P1:S1'), null);
  });

  test('the focus query and frame value is projectId:sessionId', () => {
    assert.equal(focusRef(voiceMode), 'P3lv0:G1z2p');
  });
});

describe('the ready frame', () => {
  test('an older gxserver sends no focus key', () => {
    assert.deepEqual(readyFocus({ type: 'ready', conversationId: 'c1' }), { kind: 'missing' });
    assert.equal(readyFromOlderServer(true, { type: 'ready' }), true);
  });

  test('a call that did not ask for a focus never treats a missing key as old', () => {
    assert.equal(readyFromOlderServer(false, { type: 'ready' }), false);
  });

  test('focus null is an all-sessions call on a new gxserver', () => {
    assert.deepEqual(readyFocus({ type: 'ready', focus: null }), { kind: 'focus', focus: null });
    assert.equal(readyFromOlderServer(true, { type: 'ready', focus: null }), false);
  });

  test('a reattach redraws the banner from ready.focus', () => {
    const answer = readyFocus({ type: 'ready', resumed: true, focus: voiceMode });
    assert.deepEqual(answer, { kind: 'focus', focus: voiceMode });
  });

  test('the old-computer line names the computer', () => {
    assert.equal(outdatedFocusMessage('Mac mini'), 'Update Ghostex on Mac mini to have a voice call about one session.');
  });
});

describe('starting a call about a session', () => {
  const target = { machineId: 'm1', projectId: 'P3lv0', sessionId: 'G1z2p' };

  test('no call open: start one', () => {
    assert.equal(voiceCallAboutAction({ active: false, machineId: null, focus: null }, target), 'start');
  });

  test('an all-sessions call on the same computer is refocused, not doubled', () => {
    assert.equal(voiceCallAboutAction({ active: true, machineId: 'm1', focus: null }, target), 'refocus');
  });

  test('a call about another session on the same computer is refocused', () => {
    const other = { ...voiceMode, sessionId: 'G9xyz' };
    assert.equal(voiceCallAboutAction({ active: true, machineId: 'm1', focus: other }, target), 'refocus');
  });

  test('the call is already about this session', () => {
    assert.equal(voiceCallAboutAction({ active: true, machineId: 'm1', focus: voiceMode }, target), 'already');
  });

  test('a call on another computer cannot move', () => {
    assert.equal(voiceCallAboutAction({ active: true, machineId: 'm2', focus: null }, target), 'otherComputer');
  });

  test('an ended call never blocks a new one', () => {
    assert.equal(voiceCallAboutAction({ active: false, machineId: 'm2', focus: voiceMode }, target), 'start');
  });
});

describe('scope changes mid-call', () => {
  test('widening says so', () => {
    assert.equal(focusChangeNotice(voiceMode, null), 'Now about all sessions.');
  });

  test('refocusing names the new session', () => {
    assert.equal(focusChangeNotice(null, voiceMode), 'Now only about Voice mode.');
  });

  test('the same scope again, or an all-sessions start, says nothing', () => {
    assert.equal(focusChangeNotice(voiceMode, { ...voiceMode }), null);
    assert.equal(focusChangeNotice(null, null), null);
  });

  test('a closed session adds no note (its sessionClosed announcement says it)', () => {
    const closed = { ...voiceMode, closed: true };
    assert.equal(focusChangeNotice(voiceMode, closed), null);
  });

  test('a rename of the focused session adds no note', () => {
    assert.equal(focusChangeNotice(voiceMode, { ...voiceMode, title: 'Voice mode 2' }), null);
  });

  test('the banner shows the project in brackets', () => {
    assert.equal(focusBannerDetail(voiceMode), '(Ghostex)');
    assert.equal(focusBannerDetail({ ...voiceMode, project: '' }), '');
  });
});
