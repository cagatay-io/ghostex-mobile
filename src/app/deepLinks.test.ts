/// <reference types="node" />
/**
 * Run with `bun test src/app/deepLinks.test.ts`. A tapped notification opens its session, a question link its
 * Chat View, also at a cold start (the session list arrives during or after the attach): the real
 * `handleDeepLink` with a fake navigator and fake stores.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { handleDeepLink, sessionDeepLink, type DeepLinkDeps, type DeepLinkSession } from './deepLinkHandler';

function fake(session: DeepLinkSession | undefined) {
  const calls: string[] = [];
  const routes: unknown[] = [];
  const deps: DeepLinkDeps = {
    storesReady: () => true,
    machine: (id) => (id === 'm1' ? { id: 'm1', host: 'mac', username: 'u', port: 22 } : undefined),
    session: () => session,
    revealWorkspace: () => undefined,
    openChatTab: (_m, s) => {
      calls.push(`chat:${s.sessionId}`);
      return `m1:${s.sessionId}`;
    },
    showChatView: (key) => calls.push(`chatView:${key}`),
    attachSession: async (_m, s) => {
      calls.push(`attach:${s.sessionId}`);
      return `m1:${s.sessionId}`;
    },
    loadSession: async () => {
      calls.push('sessionList');
      return session;
    },
    navigate: (route) => routes.push(route),
    later: (retry) => retry(),
  };
  return { deps, calls, routes };
}

/** A cold start: the computer's session list is not on the phone yet; it lists `listed` once it arrives. */
function coldStart(listed: DeepLinkSession, arrives: 'duringAttach' | 'whenAsked') {
  const f = fake(undefined);
  let current: DeepLinkSession | undefined;
  f.deps.session = () => current;
  f.deps.attachSession = async (_m, s) => {
    f.calls.push(`attach:${s.sessionId}`);
    if (arrives === 'duringAttach') current = listed;
    return `m1:${s.sessionId}`;
  };
  f.deps.loadSession = async () => {
    f.calls.push('sessionList');
    current = listed;
    return current;
  };
  return f;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a notification tap opens its session', () => {
  test('a session that opens in its terminal is attached and shown', async () => {
    const f = fake({ projectId: 'p1', title: 'fix build', hasChatView: false, opensInChatView: false });
    handleDeepLink('ghostex://session?machineId=m1&sessionId=s1', f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1']);
    assert.deepEqual(f.routes, [
      { name: 'Terminal', params: { sessionKey: 'm1:s1', machineId: 'm1', title: 'fix build' } },
    ]);
  });

  test('a session that opens in its chat view shows the chat', () => {
    const f = fake({ projectId: 'p1', title: 'fix build', hasChatView: true, opensInChatView: true });
    handleDeepLink('ghostex://session?machineId=m1&sessionId=s1', f.deps);
    assert.deepEqual(f.calls, ['chat:s1']);
  });

  test('a question link opens session s1 of m1 in its chat view', () => {
    const f = fake({ projectId: 'p1', title: 'fix build', hasChatView: true, opensInChatView: false });
    const url = sessionDeepLink({ machineId: 'm1', sessionId: 's1', view: 'question' });
    handleDeepLink(url, f.deps);
    assert.deepEqual(f.calls, ['chat:s1', 'chatView:m1:s1']);
    assert.deepEqual(f.routes, [
      { name: 'Terminal', params: { sessionKey: 'm1:s1', machineId: 'm1', title: 'fix build' } },
    ]);
  });

  test('a session without a chat view opens its terminal', async () => {
    const f = fake({ projectId: 'p1', title: '', hasChatView: false, opensInChatView: false });
    handleDeepLink(sessionDeepLink({ machineId: 'm1', sessionId: 's1', view: 'question' }), f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1']);
  });

  test('an unknown computer opens nothing', () => {
    const f = fake(undefined);
    handleDeepLink('ghostex://session?machineId=other&sessionId=s1', f.deps);
    assert.deepEqual(f.calls, []);
  });
});

describe('a question notification tapped at a cold start', () => {
  const withChat: DeepLinkSession = { projectId: 'p1', title: 'fix build', hasChatView: true, opensInChatView: false };
  const terminalOnly: DeepLinkSession = { projectId: 'p1', title: '', hasChatView: false, opensInChatView: false };
  const questionLink = sessionDeepLink({ machineId: 'm1', sessionId: 's1', view: 'question' });

  test('the session list arrives during the attach: the Chat View with its question card is shown', async () => {
    const f = coldStart(withChat, 'duringAttach');
    handleDeepLink(questionLink, f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1', 'chatView:m1:s1']);
    assert.equal(f.routes.length, 1);
  });

  test('the session list is not there after the attach: it is read, then the Chat View is shown', async () => {
    const f = coldStart(withChat, 'whenAsked');
    handleDeepLink(questionLink, f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1', 'sessionList', 'chatView:m1:s1']);
    assert.equal(f.routes.length, 1);
  });

  test('exception: a session without a Chat View stays in its terminal', async () => {
    const f = coldStart(terminalOnly, 'whenAsked');
    handleDeepLink(questionLink, f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1', 'sessionList']);
  });

  test('an ordinary link forces no view: the Terminal screen picks it as a tap in the Sessions list would', async () => {
    const f = coldStart(withChat, 'duringAttach');
    handleDeepLink('ghostex://session?machineId=m1&sessionId=s1', f.deps);
    await settle();
    assert.deepEqual(f.calls, ['attach:s1']);
  });
});
