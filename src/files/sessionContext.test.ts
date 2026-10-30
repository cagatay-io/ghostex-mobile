/// <reference types="node" />
/**
 * Run with `bun test src/files/sessionContext.test.ts`.
 *
 * REQ-FILES-010 (add a file to the session's context): the real flow (`sessionContext.ts`) and the real row menu
 * (`rowMenu.ts`) with a stand-in for `runProjectDocsAction` that captures what is sent and stand-in session inputs
 * that record what lands in the chat draft and the terminal. The app's own inputs (chat host, native terminal)
 * are driven in `sessionInputs.rntl.ts`.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { RpcAnswer } from '../chat/rust/transport';
import { DocsCopy } from '../copy';
import type { DocsRpc } from './request';
import { previewActions, rowMenuActions } from './rowMenu';
import {
  addFileToSessionContext,
  contextSessionFor,
  type ContextSession,
  type ContextTargetNow,
  type SessionInputs,
} from './sessionContext';

// gxserver's text for a file (`session_context_prompt`, server/src/project_docs/actions.rs).
const PROMPT = '\nFile context: docs/plan.md\n\n```markdown\n# Plan\n```\n';

const SESSION: ContextSession = {
  sessionKey: 'machine-1:session-7',
  sessionId: 'session-7',
  title: 'Duo layout spike',
  chatCapable: true,
};

function host(answer: RpcAnswer) {
  const sent: Record<string, unknown>[] = [];
  const rpc: DocsRpc = (method, params) => {
    assert.equal(method, 'runProjectDocsAction');
    sent.push(params);
    return Promise.resolve(answer);
  };
  return { rpc, sent };
}

/** The session Files came from as it is when the text arrives: open on the phone, live with its agent. */
const OPEN_TAB = { kind: 'attach', ghostexSessionId: 'session-7', state: 'open' } as const;
const LIVE_RECORD = { isLive: true, agentIcon: 'claude', agentName: 'Claude', agent: 'claude' };
const LIVE: ContextTargetNow = { tab: OPEN_TAB, record: LIVE_RECORD };

/** Session inputs that record every insertion; `chat`: whether the session shows its chat; `now`: the target now. */
function inputs(chat: boolean, options: { chatReady?: boolean; terminal?: boolean; now?: ContextTargetNow } = {}) {
  const chatDraft: { session: string; text: string }[] = [];
  const terminal: { session: string; text: string }[] = [];
  const fake: SessionInputs = {
    showsChat: (session) => chat && session.chatCapable,
    appendToChatDraft: (session, text) => {
      if (options.chatReady === false) return false;
      chatDraft.push({ session: session.sessionId, text });
      return true;
    },
    pasteIntoTerminal: (session, text) => {
      if (options.terminal === false) return Promise.reject(new Error(`No terminal for session ${session.sessionKey}`));
      terminal.push({ session: session.sessionKey, text });
      return Promise.resolve();
    },
    current: () => options.now ?? LIVE,
  };
  return { fake, chatDraft, terminal };
}

const ANSWER: RpcAnswer = { result: { action: 'addToSessionContext', contextPrompt: PROMPT }, error: null };

describe('REQ-FILES-010: add a file to the session context', () => {
  test('REQ-FILES-010 AC1: one addToSessionContext request for the file, its text inserted once into that session', async () => {
    const { rpc, sent } = host(ANSWER);
    const session = inputs(true);
    const outcome = await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, session.fake);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.projectId, 'project-1');
    assert.equal(sent[0]?.scope, 'project');
    assert.equal(sent[0]?.action, 'addToSessionContext');
    assert.equal(sent[0]?.path, 'docs/plan.md');
    assert.deepEqual([...session.chatDraft, ...session.terminal], [{ session: 'session-7', text: PROMPT }]);
    assert.deepEqual(outcome, { added: true, into: 'chat' });
  });

  test('REQ-FILES-010 AC2: a session shown as a chat gets the text in its chat draft, not in its terminal', async () => {
    const { rpc } = host(ANSWER);
    const session = inputs(true);
    await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, session.fake);
    assert.deepEqual(session.chatDraft, [{ session: 'session-7', text: PROMPT }]);
    assert.deepEqual(session.terminal, []);
  });

  test('REQ-FILES-010 AC3: a session shown as a terminal gets the text pasted as it is, with nothing after it', async () => {
    const { rpc } = host(ANSWER);
    const session = inputs(false);
    const outcome = await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, session.fake);
    assert.deepEqual(session.terminal, [{ session: 'machine-1:session-7', text: PROMPT }]);
    assert.deepEqual(session.chatDraft, []);
    assert.deepEqual(outcome, { added: true, into: 'terminal' });
  });

  test('REQ-FILES-010 AC3: a session that cannot show its chat is pasted into even when Chat View is the default', async () => {
    const { rpc } = host(ANSWER);
    const session = inputs(true);
    await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', { ...SESSION, chatCapable: false }, session.fake);
    assert.equal(session.terminal.length, 1);
    assert.deepEqual(session.chatDraft, []);
  });

  test('REQ-FILES-010 AC4: a file the host refuses inserts nothing and answers the host message', async () => {
    for (const message of [
      'File is too large to add to session context.',
      'Only UTF-8 text files can be added to session context.',
    ]) {
      const { rpc } = host({ error: { code: 'actionFailed', message } });
      for (const chat of [true, false]) {
        const session = inputs(chat);
        const outcome = await addFileToSessionContext(rpc, 'project-1', 'assets/logo.png', SESSION, session.fake);
        assert.deepEqual(outcome, { added: false, message });
        assert.deepEqual([...session.chatDraft, ...session.terminal], []);
      }
    }
  });

  test('REQ-FILES-010 AC4: a refusal inside the result is the host message too', async () => {
    const { rpc } = host({ result: { error: 'Select a file to add to session context.' }, error: null });
    const session = inputs(true);
    const outcome = await addFileToSessionContext(rpc, 'project-1', 'docs', SESSION, session.fake);
    assert.deepEqual(outcome, { added: false, message: 'Select a file to add to session context.' });
    assert.deepEqual(session.chatDraft, []);
  });

  test('REQ-FILES-010: a chat box that is not open, or a terminal that is gone, says no agent session is available', async () => {
    const { rpc } = host(ANSWER);
    const notReady = inputs(true, { chatReady: false });
    assert.deepEqual(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, notReady.fake), {
      added: false,
      message: DocsCopy.contextNoSession,
    });
    const noTerminal = inputs(false, { terminal: false });
    assert.deepEqual(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, noTerminal.fake), {
      added: false,
      message: DocsCopy.contextNoSession,
    });
  });

  test('REQ-FILES-010 AC5: no session, a session without an agent, or a folder row: no Add to Session Context', () => {
    const agentTab = { kind: 'attach' as const, sessionKey: 'machine-1:session-7', ghostexSessionId: 'session-7' };
    // Opened from an agent session: offered on files only.
    const fromAgent = contextSessionFor(agentTab, 'claude', 'Duo layout spike', true);
    assert.deepEqual(fromAgent, SESSION);
    assert.equal(
      rowMenuActions('file', { sessionContext: fromAgent !== null, share: true }).includes('addToSessionContext'),
      true,
    );
    assert.deepEqual(rowMenuActions('folder', { sessionContext: fromAgent !== null, share: true }), ['copyPath']);
    // A session that runs no agent, and a shell tab.
    assert.equal(contextSessionFor(agentTab, 'terminal', 'zsh', false), null);
    assert.equal(contextSessionFor({ kind: 'shell', sessionKey: 'shell-1' }, 'terminal', 'zsh', false), null);
    // Opened without a session (a project's menu): the browser has none.
    assert.equal(rowMenuActions('file', { sessionContext: false, share: true }).includes('addToSessionContext'), false);
  });

  test('REQ-FILES-010 AC5 (corrected scope): a text preview header offers it only from an agent session, in the mockup order', () => {
    assert.deepEqual(previewActions({ sessionContext: true, share: true }), [
      'copyPath',
      'addToSessionContext',
      'share',
      'reload',
    ]);
    assert.deepEqual(previewActions({ sessionContext: false, share: true }), ['copyPath', 'share', 'reload']);
    assert.deepEqual(previewActions({ sessionContext: false, share: false }), ['copyPath', 'reload']);
  });
});

describe('REQ-FILES-010 scope: the target is checked again right before inserting (still open, running, an agent)', () => {
  const refused = { added: false, message: DocsCopy.contextNoSession };
  const tab = OPEN_TAB;
  const record = LIVE_RECORD;
  const notReady: [string, ContextTargetNow][] = [
    ['whose tab was closed on the phone', { tab: undefined, record }],
    ['whose tab now shows another session', { tab: { ...tab, ghostexSessionId: 'session-8' }, record }],
    ['the computer no longer lists', { tab, record: undefined }],
    ['asleep or stopped on the computer', { tab, record: { ...record, isLive: false } }],
    ['that no longer runs an agent', { tab, record: { ...record, agentIcon: '', agentName: '', agent: '' } }],
  ];

  for (const [why, now] of notReady) {
    test(`REQ-FILES-010: nothing is inserted into a session ${why}, in chat or terminal view`, async () => {
      for (const chat of [true, false]) {
        const { rpc } = host(ANSWER);
        const session = inputs(chat, { now });
        assert.deepEqual(
          await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, session.fake),
          refused,
        );
        assert.deepEqual([...session.chatDraft, ...session.terminal], []);
      }
    });
  }

  test('REQ-FILES-010: in terminal view only a connected terminal takes the text; the chat needs none', async () => {
    for (const state of ['opening', 'closed', 'failed', 'detached'] as const) {
      const { rpc } = host(ANSWER);
      const now = { tab: { ...tab, state }, record };
      const terminal = inputs(false, { now });
      assert.deepEqual(
        await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, terminal.fake),
        refused,
      );
      assert.deepEqual(terminal.terminal, []);
      const chat = inputs(true, { now });
      assert.deepEqual(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, chat.fake), {
        added: true,
        into: 'chat',
      });
    }
  });

  test('REQ-FILES-010: the check is made after the host answered, not when Add to Session Context was chosen', async () => {
    let now: ContextTargetNow = LIVE;
    const rpc: DocsRpc = () => {
      now = { tab, record: undefined };
      return Promise.resolve(ANSWER);
    };
    const session = inputs(false);
    session.fake.current = () => now;
    assert.deepEqual(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, session.fake), refused);
    assert.deepEqual(session.terminal, []);
  });
});
