/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A tapped notification's opening through the real `deepLinks.ts`, link handler and
 * terminal store (`src/terminal/sessions.ts`), whose selected tab the Terminal screen shows; faked are the boundaries
 * only: storage, the native terminal (its opening held by the test), the SSH connection, the remote command
 * builders, the app log, the workspace reveal and the navigation container.
 *
 * - An attach that waited for an opening of the same tab already under way selects nothing once a later tap
 *   superseded the tapped notification's opening, so the later tap's session stays on screen.
 * - While the opening is still current, and for a link without a check (an attention-list row), the attach that
 *   waited selects its session and the link navigates there, as before.
 */

import type { NavigationContainerRef } from '@react-navigation/native';

import type * as InventoryStoreModule from '../inventory/store';
import type * as MachinesStoreModule from '../machines/store';
import type { MachineRecord } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import type * as SettingsStoreModule from '../settings/store';
import type * as TerminalSessionsModule from '../terminal/sessions';
import type * as DeepLinksModule from './deepLinks';

/** While set, the native terminal's opening waits for it. */
const mockNativeOpening: { gate: Promise<void> | null } = { gate: null };

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    openTerminal: jest.fn(async () => {
      await mockNativeOpening.gate;
    }),
    closeTerminal: jest.fn(() => Promise.resolve()),
    scrollToBottom: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../inventory/client', () => ({ ensureConnected: jest.fn(() => Promise.resolve()) }));
jest.mock('../remote/commands', () => ({
  remoteTerminalCommand: jest.fn(() => Promise.resolve(null)),
  remoteShellCommand: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('./appLog', () => ({ logAppEvent: jest.fn() }));
jest.mock('../workspaces/store', () => ({ revealSessionWorkspace: jest.fn() }));

const COMPUTER: MachineRecord = {
  id: 'm1',
  name: 'Mac mini',
  host: 'm1.local',
  username: 'tester',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};
const TARGET = { id: 'm1', host: 'm1.local', username: 'tester', port: 22 };

/** Lets the attaches, the link handler and the navigation that one step started finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 16; i += 1) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
}

type FocusedRoute = { name: string; params?: { sessionKey?: string } };

/** The real link wiring and stores, on a stand-in navigation container that records each navigation. */
function realApp() {
  jest.resetModules();
  mockNativeOpening.gate = null;
  const { useTerminalStore } = jest.requireActual<typeof TerminalSessionsModule>('../terminal/sessions');
  const { useMachinesStore } = jest.requireActual<typeof MachinesStoreModule>('../machines/store');
  const { useSettingsStore, defaultSettings } = jest.requireActual<typeof SettingsStoreModule>('../settings/store');
  const { useInventoryStore } = jest.requireActual<typeof InventoryStoreModule>('../inventory/store');
  useMachinesStore.setState({ hydrated: true, machines: [COMPUTER] });
  useSettingsStore.setState({
    hydrated: true,
    settings: { ...defaultSettings(), preferredAgentInterface: 'terminal' },
  });
  useTerminalStore.setState({ hydrated: true, tabs: [], selectedSessionKey: null, warmOrder: [] });
  useInventoryStore.setState({ inventoriesByMachineId: {} });
  const deepLinks = jest.requireActual<typeof DeepLinksModule>('./deepLinks');
  let route: FocusedRoute = { name: 'Sessions' };
  const listeners: (() => void)[] = [];
  /** The Terminal screens navigated to, by session key. */
  const navigatedTo: string[] = [];
  // The cast holds for what the ref uses of its container here: its listeners, readiness, route and navigate.
  const container = {
    addListener: (event: string, listener: () => void) => {
      if (event === 'state') listeners.push(listener);
      return () => undefined;
    },
    removeListener: () => undefined,
    isReady: () => true,
    getCurrentRoute: () => route,
    navigate: (name: string, params?: { sessionKey?: string }) => {
      route = { name, params };
      navigatedTo.push(params?.sessionKey ?? name);
      for (const listener of listeners) listener();
    },
  } as unknown as NavigationContainerRef<RootStackParamList>;
  deepLinks.navigationRef.current = container;
  // The app's first screen.
  for (const listener of listeners) listener();
  return {
    deepLinks,
    terminal: useTerminalStore,
    navigatedTo,
    selected: () => useTerminalStore.getState().selectedSessionKey,
  };
}

/**
 * The Sessions list opens s1's terminal, whose native opening is held; then a tapped notification's link for s1
 * (with `current` as its opening's check, or none) enters the attach, which waits for that opening.
 */
async function tapWhileS1Opens(current: (() => boolean) | undefined) {
  const app = realApp();
  const opened = Promise.withResolvers<void>();
  mockNativeOpening.gate = opened.promise;
  const first = app.terminal.getState().attachSession(TARGET, { sessionId: 's1' });
  await settle();
  expect(app.selected()).toBe('m1:s1');
  app.deepLinks.tapOpens('m1', 's1');
  app.deepLinks.openDeepLink('ghostex://session?machineId=m1&sessionId=s1', current);
  await settle();
  /** The native terminal reports s1 open; the held opening and the attach waiting for it go on. */
  const finishOpening = async () => {
    app.terminal.setState({
      tabs: app.terminal
        .getState()
        .tabs.map((tab) => (tab.sessionKey === 'm1:s1' ? { ...tab, state: 'open' as const } : tab)),
    });
    mockNativeOpening.gate = null;
    opened.resolve();
    await first;
    await settle();
  };
  return { app, finishOpening };
}

test('a later tap while the tapped session’s terminal still opens: the earlier tap selects nothing over it', async () => {
  let current = true;
  const { app, finishOpening } = await tapWhileS1Opens(() => current);
  // A later tap opens s2 (its Chat View tab), which supersedes the first tap's opening.
  current = false;
  app.deepLinks.tapOpens('m1', 's2');
  app.terminal.getState().openChatTab(TARGET, { sessionId: 's2' });
  expect(app.selected()).toBe('m1:s2');
  await finishOpening();
  expect(app.navigatedTo).toEqual([]);
  expect(app.selected()).toBe('m1:s2');
});

test.each([
  ['while the tapped notification’s opening is still current', () => true],
  ['for a link without a check (an attention-list row)', undefined],
] as const)('%s, the attach that waited selects its session and opens it', async (_case, current) => {
  const { app, finishOpening } = await tapWhileS1Opens(current);
  // Something else was selected meanwhile; the opening still holds.
  app.terminal.getState().openChatTab(TARGET, { sessionId: 's2' });
  await finishOpening();
  expect(app.selected()).toBe('m1:s1');
  expect(app.navigatedTo).toEqual(['m1:s1']);
});
