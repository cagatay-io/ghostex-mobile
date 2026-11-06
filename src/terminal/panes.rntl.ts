/// <reference types="jest" />
/**
 * Run with `bun run test:jest src/terminal/panes.rntl.ts`. Two agent sessions on screen at once, in the real terminal
 * store (`sessions.ts`) and the real display policy (`zmxDisplay.ts`); mocked are the native module (its grids, the
 * bytes it is asked to send) and the connection.
 * - Both terminals on screen own their real grid: each announces itself visible with its own size, neither is pinned
 *   to the 200 columns a terminal off screen rests at; one off screen still is.
 * - A session shown in either pane counts as on screen (no banner, no attention sound for it).
 * - At the limit of seven warm terminals, the oldest one off screen is closed, never one of the two on screen.
 * - Closing the selected tab hands the selection to the pane beside it, which stays on screen.
 * - Coming back to the foreground, the terminals on screen are attached again first.
 * - A stored pane's session can be attached without changing the selection.
 */

import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { act } from '@testing-library/react-native';

import { useMachinesStore, type MachineRecord } from '../machines/store';
import { attachSessionKey, MAX_WARM_SESSIONS, restoreAttachTabs, useTerminalStore, type TerminalTab } from './sessions';
import { initZmxDisplayPolicy, noteAttachOpened, sessionOnScreen, setMountedSessionKeys } from './zmxDisplay';

type Grid = { cols: number; rows: number };

const mockGrids = new Map<string, Grid>();
const mockSent: { sessionKey: string; text: string }[] = [];
const mockPinned: { sessionKey: string; cols: number; rows: number }[] = [];
const mockOpened: string[] = [];
const mockClosed: string[] = [];

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: () => ({ remove: () => undefined }),
    getTerminalGrid: (sessionKey: string) => Promise.resolve(mockGrids.get(sessionKey) ?? null),
    setTerminalGrid: (sessionKey: string, cols: number, rows: number) => {
      mockPinned.push({ sessionKey, cols, rows });
      return Promise.resolve();
    },
    sendRawInput: (sessionKey: string, text: string) => {
      mockSent.push({ sessionKey, text });
      return Promise.resolve();
    },
    openTerminal: (sessionKey: string) => {
      mockOpened.push(sessionKey);
      return Promise.resolve();
    },
    closeTerminal: (sessionKey: string) => {
      mockClosed.push(sessionKey);
      return Promise.resolve();
    },
    scrollToBottom: () => Promise.resolve(),
    refreshTerminalViewport: () => Promise.resolve(),
  },
}));
jest.mock('../inventory/client', () => ({ ensureConnected: () => Promise.resolve() }));
jest.mock('../remote/commands', () => ({
  remoteTerminalCommand: (_machineId: string, command: string) => Promise.resolve(command),
  remoteShellCommand: () => Promise.resolve(null),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};
const TARGET = { id: 'm1', host: 'mac.local', username: 'me', port: 22 };

function attachTab(sessionId: string, state: TerminalTab['state'] = 'open'): TerminalTab {
  return {
    sessionKey: attachSessionKey('m1', sessionId),
    machineId: 'm1',
    title: sessionId,
    kind: 'attach',
    ghostexSessionId: sessionId,
    ghostexProjectId: 'p1',
    state,
  };
}

const TOP = attachTab('top');
const BOTTOM = attachTab('bottom');
const AWAY = attachTab('away');

function announcements(sessionKey: string): string[] {
  return mockSent.filter((entry) => entry.sessionKey === sessionKey).map((entry) => entry.text);
}

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  for (let i = 0; i < 10; i += 1) await act(async () => undefined);
}

beforeAll(() => {
  // The app in the foreground, as React Native's AppState reports it to the display policy.
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const subscription: NativeEventSubscription = { remove: () => undefined };
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    listeners.push(listener);
    return subscription;
  });
  // Jest's React Native has no app to report a state; the test is the app's state here.
  const appState: { currentState: string | null | undefined } = AppState;
  appState.currentState = 'active';
  initZmxDisplayPolicy();
  for (const listener of listeners) listener('active');
});

beforeEach(() => {
  jest.useFakeTimers();
  mockGrids.clear();
  mockSent.length = 0;
  mockPinned.length = 0;
  mockOpened.length = 0;
  mockClosed.length = 0;
  setMountedSessionKeys(null, null);
  useMachinesStore.setState({ machines: [MACHINE] });
  useTerminalStore.setState({ tabs: [], selectedSessionKey: null, paneSessionKey: null, warmOrder: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('two terminals on screen', () => {
  beforeEach(async () => {
    mockGrids.set(TOP.sessionKey, { cols: 92, rows: 18 });
    mockGrids.set(BOTTOM.sessionKey, { cols: 92, rows: 27 });
    mockGrids.set(AWAY.sessionKey, { cols: 80, rows: 40 });
    useTerminalStore.setState({ tabs: [TOP, BOTTOM, AWAY], selectedSessionKey: TOP.sessionKey });
    for (const tab of [TOP, BOTTOM, AWAY]) noteAttachOpened(tab.sessionKey);
    // The attach clients start reading after the viewport refresh delay.
    await settle(2000);
  });

  test('each announces itself visible with its own grid; neither rests at 200 columns', async () => {
    // Off screen until now: all three rest at 200 columns.
    mockPinned.length = 0;
    setMountedSessionKeys(TOP.sessionKey, null, BOTTOM.sessionKey);
    await settle();
    expect(announcements(TOP.sessionKey)).toContain('\x1b]1337;ZMX_VISIBLE=18,92\x07');
    expect(announcements(BOTTOM.sessionKey)).toContain('\x1b]1337;ZMX_VISIBLE=27,92\x07');
    // Both are unpinned to their real grid; none is pinned to 200 columns again.
    expect(mockPinned).toEqual([
      { sessionKey: TOP.sessionKey, cols: 0, rows: 0 },
      { sessionKey: BOTTOM.sessionKey, cols: 0, rows: 0 },
    ]);
    expect(announcements(AWAY.sessionKey).at(-1)).toBe('\x1b]1337;ZMX_HIDDEN=40,200\x07');
  });

  test('the focus moving between the panes leaves both visible and pins neither', async () => {
    setMountedSessionKeys(TOP.sessionKey, null, BOTTOM.sessionKey);
    await settle();
    mockPinned.length = 0;
    mockSent.length = 0;
    setMountedSessionKeys(BOTTOM.sessionKey, null, TOP.sessionKey);
    await settle();
    expect(mockPinned.filter((entry) => entry.cols === 200)).toEqual([]);
    expect(announcements(TOP.sessionKey).some((text) => text.includes('ZMX_HIDDEN'))).toBe(false);
    expect(announcements(BOTTOM.sessionKey).some((text) => text.includes('ZMX_HIDDEN'))).toBe(false);
  });

  test('back to one pane, the one that left rests at 200 columns again', async () => {
    setMountedSessionKeys(TOP.sessionKey, null, BOTTOM.sessionKey);
    await settle();
    setMountedSessionKeys(TOP.sessionKey, null);
    await settle();
    expect(announcements(BOTTOM.sessionKey).at(-1)).toBe('\x1b]1337;ZMX_HIDDEN=27,200\x07');
  });
});

describe('a session in either pane is on screen', () => {
  test('both sessions count while the app is active; one off screen does not', () => {
    useTerminalStore.setState({ tabs: [TOP, BOTTOM, AWAY], selectedSessionKey: TOP.sessionKey });
    setMountedSessionKeys(TOP.sessionKey, null, BOTTOM.sessionKey);
    expect(sessionOnScreen('m1', 'top')).toBe(true);
    expect(sessionOnScreen('m1', 'bottom')).toBe(true);
    expect(sessionOnScreen('m1', 'away')).toBe(false);
    setMountedSessionKeys(TOP.sessionKey, null);
    expect(sessionOnScreen('m1', 'bottom')).toBe(false);
  });
});

describe('the warm terminal limit', () => {
  test('the oldest terminal off screen is closed, not the pane beside the selected one', async () => {
    const pane = attachTab('pane');
    const selected = attachTab('selected');
    const others = ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => attachTab(id));
    const warm = [pane, selected, ...others];
    expect(warm).toHaveLength(MAX_WARM_SESSIONS);
    useTerminalStore.setState({
      tabs: warm,
      selectedSessionKey: selected.sessionKey,
      paneSessionKey: pane.sessionKey,
      warmOrder: warm.map((tab) => tab.sessionKey),
    });
    await act(async () => {
      await useTerminalStore.getState().attachSession(TARGET, { sessionId: 'new' }, { select: false });
    });
    expect(mockClosed).toContain(others[0].sessionKey);
    expect(mockClosed).not.toContain(pane.sessionKey);
    expect(mockClosed).not.toContain(selected.sessionKey);
    expect(useTerminalStore.getState().tabs.map((tab) => tab.sessionKey)).toContain(pane.sessionKey);
  });
});

describe('opening a stored pane session', () => {
  test('attaches it without changing the selection', async () => {
    useTerminalStore.setState({ tabs: [TOP], selectedSessionKey: TOP.sessionKey, warmOrder: [TOP.sessionKey] });
    await act(async () => {
      await useTerminalStore.getState().attachSession(TARGET, { sessionId: 'bottom' }, { select: false });
    });
    expect(useTerminalStore.getState().selectedSessionKey).toBe(TOP.sessionKey);
    expect(useTerminalStore.getState().tabs.map((tab) => tab.sessionKey)).toEqual([TOP.sessionKey, BOTTOM.sessionKey]);
    expect(mockOpened).toEqual([BOTTOM.sessionKey]);
  });

  test('a session opened the usual way is selected, as before', async () => {
    useTerminalStore.setState({ tabs: [TOP], selectedSessionKey: TOP.sessionKey, warmOrder: [TOP.sessionKey] });
    await act(async () => {
      await useTerminalStore.getState().attachSession(TARGET, { sessionId: 'bottom' });
    });
    expect(useTerminalStore.getState().selectedSessionKey).toBe(BOTTOM.sessionKey);
  });
});

describe('closing the selected tab with a pane beside it', () => {
  test('the pane beside it takes the selection, not the last tab', async () => {
    useTerminalStore.setState({
      tabs: [BOTTOM, TOP, AWAY],
      selectedSessionKey: TOP.sessionKey,
      paneSessionKey: BOTTOM.sessionKey,
    });
    await act(async () => {
      await useTerminalStore.getState().closeTab(TOP.sessionKey);
    });
    expect(useTerminalStore.getState().selectedSessionKey).toBe(BOTTOM.sessionKey);
    expect(useTerminalStore.getState().paneSessionKey).toBeNull();
  });

  test('without a pane beside it the last tab is selected, as before', async () => {
    useTerminalStore.setState({ tabs: [BOTTOM, TOP, AWAY], selectedSessionKey: TOP.sessionKey });
    await act(async () => {
      await useTerminalStore.getState().closeTab(TOP.sessionKey);
    });
    expect(useTerminalStore.getState().selectedSessionKey).toBe(AWAY.sessionKey);
  });

  test('closing the pane beside it leaves the selection and clears the pane', async () => {
    useTerminalStore.setState({
      tabs: [BOTTOM, TOP, AWAY],
      selectedSessionKey: TOP.sessionKey,
      paneSessionKey: BOTTOM.sessionKey,
    });
    await act(async () => {
      await useTerminalStore.getState().closeTab(BOTTOM.sessionKey);
    });
    expect(useTerminalStore.getState().selectedSessionKey).toBe(TOP.sessionKey);
    expect(useTerminalStore.getState().paneSessionKey).toBeNull();
  });
});

describe('coming back to the foreground', () => {
  test('the selected terminal is attached again first, then the pane beside it, then the rest', async () => {
    const failed = [attachTab('away', 'failed'), attachTab('bottom', 'failed'), attachTab('top', 'failed')];
    useTerminalStore.setState({
      tabs: failed,
      selectedSessionKey: TOP.sessionKey,
      paneSessionKey: BOTTOM.sessionKey,
    });
    await act(async () => {
      await restoreAttachTabs('m1');
    });
    expect(mockOpened).toEqual([TOP.sessionKey, BOTTOM.sessionKey, AWAY.sessionKey]);
  });
});
