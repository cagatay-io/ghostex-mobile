/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Add to Session Context on the app's own session inputs (`sessionInputs.ts`) behind
 * the real Add to Session Context flow: in chat view the text goes into the open chat's draft through the chat box's
 * append (`appendToDraft`) and nothing else is dispatched (no send); in terminal view it is typed into the session's
 * terminal exactly as gxserver wrote it, with no Enter key after it. Right before inserting, the target is checked
 * again against the phone's tabs and the computer's session list (still open, running, an agent), as the desktop
 * checks Running + agent at insertion (gpui_engine_terminal_attachment.rs:455-462 at 86b287b1); otherwise nothing is
 * inserted and the notice says no agent session is available. In a session pane on screen the pane's own view (chat or
 * terminal) takes the text, not the session's saved view. The chat host registry, the native terminal, the tab store,
 * the pane store and the inventory store are stand-ins; the request is a fake `runProjectDocsAction`.
 */

import type { UserAction } from '../chat/rust/actions';
import { DocsCopy } from '../copy';
import type { DocsRpc } from './request';
import { addFileToSessionContext, type ContextSession } from './sessionContext';
import { appSessionInputs } from './sessionInputs';

const mockSendText = jest.fn((_sessionKey: string, _text: string) => Promise.resolve());
const mockSendKey = jest.fn(() => Promise.resolve());
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    sendText: (sessionKey: string, text: string) => mockSendText(sessionKey, text),
    sendKey: () => mockSendKey(),
  },
}));

type FakeHost = {
  getState: () => { composer: { ready: boolean; text: string } };
  dispatch: (action: UserAction) => void;
};
const mockHosts = new Map<string, FakeHost>();
const mockOpenHost = jest.fn((machineId: string, projectId: string, sessionId: string) => {
  return mockHosts.get(JSON.stringify([machineId, projectId, sessionId])) ?? null;
});
jest.mock('../chat/rust/host', () => ({
  openRustChatHost: (machineId: string, projectId: string, sessionId: string) =>
    mockOpenHost(machineId, projectId, sessionId),
}));
// The phone's tabs (the store's `tabs`) and the tabs set to Chat View (`chatModeArmed`: the tab's own choice, else
// the Default Agent View).
type MockTab = {
  sessionKey: string;
  machineId: string;
  kind: 'attach' | 'shell';
  ghostexSessionId?: string;
  state: string;
};
let mockTabs: MockTab[] = [];
const mockChatTabs = new Set<string>();
jest.mock('../terminal/sessions', () => ({
  useTerminalStore: {
    getState: () => ({ tabs: mockTabs, chatModeArmed: (sessionKey: string) => mockChatTabs.has(sessionKey) }),
  },
}));
// What each session pane on screen shows (the pane store's `paneViews`); null with one content area.
let mockPaneViews: Record<string, 'chat' | 'terminal'> | null = null;
jest.mock('../panes/store', () => ({ usePaneStore: { getState: () => ({ paneViews: mockPaneViews }) } }));
// The computer's session list per machine (the inventory summary's `sessions`).
type MockSession = { sessionId: string; isLive: boolean; agentIcon: string; agentName: string; agent: string };
let mockSessions: MockSession[] = [];
jest.mock('../inventory/store', () => ({
  useInventoryStore: {
    getState: () => ({ inventoriesByMachineId: { 'machine-1': { summary: { sessions: mockSessions } } } }),
  },
}));

const PROMPT = '\nFile context: docs/plan.md\n\n```markdown\n# Plan\n```\n';
const SESSION: ContextSession = {
  sessionKey: 'machine-1:session-7',
  sessionId: 'session-7',
  title: 'Spike',
  chatCapable: true,
};
const rpc: DocsRpc = () => Promise.resolve({ result: { contextPrompt: PROMPT }, error: null });

function chatHost(ready: boolean, draft: string) {
  const dispatched: UserAction[] = [];
  const host: FakeHost = {
    getState: () => ({ composer: { ready, text: draft } }),
    dispatch: (action) => dispatched.push(action),
  };
  mockHosts.set(JSON.stringify(['machine-1', 'project-1', 'session-7']), host);
  return dispatched;
}

const OPEN_TAB: MockTab = {
  sessionKey: 'machine-1:session-7',
  machineId: 'machine-1',
  kind: 'attach',
  ghostexSessionId: 'session-7',
  state: 'open',
};
const LIVE_AGENT: MockSession = {
  sessionId: 'session-7',
  isLive: true,
  agentIcon: 'claude',
  agentName: 'Claude',
  agent: 'claude',
};

beforeEach(() => {
  mockHosts.clear();
  mockChatTabs.clear();
  mockSendText.mockClear();
  mockSendKey.mockClear();
  mockPaneViews = null;
  // The session Files came from: its tab open on the phone, live with its agent on the computer.
  mockTabs = [OPEN_TAB];
  mockSessions = [LIVE_AGENT];
});

test('in chat view the text is appended to the open chat draft and nothing is sent', async () => {
  mockChatTabs.add(SESSION.sessionKey);
  const dispatched = chatHost(true, 'Look at this:');
  const outcome = await addFileToSessionContext(
    rpc,
    'project-1',
    'docs/plan.md',
    SESSION,
    appSessionInputs('machine-1', 'project-1'),
  );
  expect(outcome).toEqual({ added: true, into: 'chat' });
  // The chat box's own append, after the draft typed so far; no submit or any other action.
  expect(dispatched).toEqual([{ type: 'appendToDraft', text: PROMPT, draft: 'Look at this:' }]);
  expect(mockSendText).not.toHaveBeenCalled();
  expect(mockSendKey).not.toHaveBeenCalled();
});

test('a chat that is not open or not ready yet takes nothing, and says so', async () => {
  mockChatTabs.add(SESSION.sessionKey);
  const inputs = appSessionInputs('machine-1', 'project-1');
  expect(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, inputs)).toEqual({
    added: false,
    message: DocsCopy.contextNoSession,
  });
  const dispatched = chatHost(false, '');
  expect(await addFileToSessionContext(rpc, 'project-1', 'docs/plan.md', SESSION, inputs)).toEqual({
    added: false,
    message: DocsCopy.contextNoSession,
  });
  expect(dispatched).toEqual([]);
  expect(mockSendText).not.toHaveBeenCalled();
});

test('in terminal view the text is typed into that terminal as it is, with no Enter after it', async () => {
  const dispatched = chatHost(true, '');
  const outcome = await addFileToSessionContext(
    rpc,
    'project-1',
    'docs/plan.md',
    SESSION,
    appSessionInputs('machine-1', 'project-1'),
  );
  expect(outcome).toEqual({ added: true, into: 'terminal' });
  expect(mockSendText.mock.calls).toEqual([['machine-1:session-7', PROMPT]]);
  expect(mockSendKey).not.toHaveBeenCalled();
  expect(dispatched).toEqual([]);
});

test('a session that cannot show its chat is typed into even while its tab is set to Chat View', async () => {
  mockChatTabs.add(SESSION.sessionKey);
  chatHost(true, '');
  await addFileToSessionContext(
    rpc,
    'project-1',
    'docs/plan.md',
    { ...SESSION, chatCapable: false },
    appSessionInputs('machine-1', 'project-1'),
  );
  expect(mockSendText.mock.calls).toEqual([['machine-1:session-7', PROMPT]]);
});

test('in a session pane the view the pane shows takes the text, not the session’s saved view', async () => {
  // Saved as Chat View, its pane turned to the terminal: typed into the terminal.
  mockChatTabs.add(SESSION.sessionKey);
  mockPaneViews = { [SESSION.sessionKey]: 'terminal', 'machine-1:session-8': 'chat' };
  const untouched = chatHost(true, '');
  expect(
    await addFileToSessionContext(
      rpc,
      'project-1',
      'docs/plan.md',
      SESSION,
      appSessionInputs('machine-1', 'project-1'),
    ),
  ).toEqual({ added: true, into: 'terminal' });
  expect(mockSendText.mock.calls).toEqual([['machine-1:session-7', PROMPT]]);
  expect(untouched).toEqual([]);

  // Saved as Terminal View, its pane turned to the chat: appended to the chat's draft.
  mockChatTabs.clear();
  mockSendText.mockClear();
  mockPaneViews = { [SESSION.sessionKey]: 'chat', 'machine-1:session-8': 'terminal' };
  const dispatched = chatHost(true, 'Look at this:');
  expect(
    await addFileToSessionContext(
      rpc,
      'project-1',
      'docs/plan.md',
      SESSION,
      appSessionInputs('machine-1', 'project-1'),
    ),
  ).toEqual({ added: true, into: 'chat' });
  expect(dispatched).toEqual([{ type: 'appendToDraft', text: PROMPT, draft: 'Look at this:' }]);
  expect(mockSendText).not.toHaveBeenCalled();

  // Panes on screen without this session: its saved view.
  mockChatTabs.add(SESSION.sessionKey);
  mockPaneViews = { 'machine-1:session-8': 'terminal', 'machine-1:session-9': 'terminal' };
  const saved = chatHost(true, '');
  expect(
    await addFileToSessionContext(
      rpc,
      'project-1',
      'docs/plan.md',
      SESSION,
      appSessionInputs('machine-1', 'project-1'),
    ),
  ).toEqual({ added: true, into: 'chat' });
  expect(saved).toHaveLength(1);
  expect(mockSendText).not.toHaveBeenCalled();
});

/** Adds the file with the app's inputs, chat view or terminal view; answers the outcome and what was inserted. */
async function addInView(chat: boolean, read: DocsRpc = rpc) {
  if (chat) mockChatTabs.add(SESSION.sessionKey);
  const dispatched = chatHost(true, '');
  const outcome = await addFileToSessionContext(
    read,
    'project-1',
    'docs/plan.md',
    SESSION,
    appSessionInputs('machine-1', 'project-1'),
  );
  return { outcome, inserted: [...dispatched, ...mockSendText.mock.calls] };
}

const REFUSED = { added: false, message: DocsCopy.contextNoSession };

test('an agent session that ended (its tab closed by the remote end, gone from the computer) takes nothing', async () => {
  // Remote EOF leaves the tab and its native view in place (GhostexNativeModule.swift:451-460), so `sendText` alone
  // would still type into it.
  mockTabs = [{ ...OPEN_TAB, state: 'closed' }];
  mockSessions = [];
  for (const chat of [false, true]) {
    mockChatTabs.clear();
    mockSendText.mockClear();
    expect(await addInView(chat)).toEqual({ outcome: REFUSED, inserted: [] });
  }
});

test('a session the computer no longer runs (asleep or stopped) takes nothing', async () => {
  mockSessions = [{ ...LIVE_AGENT, isLive: false }];
  for (const chat of [false, true]) {
    mockChatTabs.clear();
    mockSendText.mockClear();
    expect(await addInView(chat)).toEqual({ outcome: REFUSED, inserted: [] });
  }
});

test('a session that no longer runs an agent takes nothing', async () => {
  mockSessions = [{ ...LIVE_AGENT, agentIcon: '', agentName: '', agent: '' }];
  for (const chat of [false, true]) {
    mockChatTabs.clear();
    mockSendText.mockClear();
    expect(await addInView(chat)).toEqual({ outcome: REFUSED, inserted: [] });
  }
});

test('a session whose tab was closed on the phone takes nothing, and no other session is chosen', async () => {
  mockTabs = [{ ...OPEN_TAB, sessionKey: 'machine-1:session-8', ghostexSessionId: 'session-8' }];
  mockSessions = [LIVE_AGENT, { ...LIVE_AGENT, sessionId: 'session-8' }];
  expect(await addInView(false)).toEqual({ outcome: REFUSED, inserted: [] });
});

test('in terminal view a terminal that is not connected takes nothing', async () => {
  mockTabs = [{ ...OPEN_TAB, state: 'opening' }];
  expect(await addInView(false)).toEqual({ outcome: REFUSED, inserted: [] });
});

test('the target is checked right before inserting, after the file was read', async () => {
  // The agent ends while gxserver reads the file.
  const ending: DocsRpc = () => {
    mockSessions = [];
    return Promise.resolve({ result: { contextPrompt: PROMPT }, error: null });
  };
  expect(await addInView(false, ending)).toEqual({ outcome: REFUSED, inserted: [] });
});
