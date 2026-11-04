/// <reference types="jest" />
/**
 * Run with `bun run test:jest src/screens/TerminalScreen.paneTypes.rntl.tsx`. The browser, files and Git changes panes
 * on the terminal screen of the iPhone Duo's inner display (`src/panes/`), rendered under the real `VerticalBarArea`
 * as `TerminalScreen.panes.rntl.tsx` does. Real are the screen, the pane host, the pane bodies (the Web Preview's start
 * and page, the Files browser, the Changes view), the pane, terminal, settings and inventory stores; mocked are the
 * boundaries only: the native module (its terminal view a stand-in that shows its props), the WebView (a stand-in that
 * shows the page it is given), gxserver's answers (`sessionChatRpc`: the project's files and its Changes diff), the
 * computer's listening ports and the port forward, the ghostex CLI (`runGhostexCli`), haptics, storage, the safe area,
 * navigation and the chat screen.
 *
 * Covered: each type's entry from the chooser and from the title's pane type menu; what each shows (web preview,
 * files, Git changes read only); the other slot keeping its content and its terminal; files and Git changes keeping the
 * project they were opened from when the selection changes; the layout stored within version 1 and brought back after
 * a restart, also with the origin session gone; closing either pane; the only session pane keeping its session; the
 * chooser's Close row, its list not springing back, neither pane moving while it is one of them, Panes in the header
 * and in "More options" naming and closing it in either slot, a new terminal in the project of the session beside it
 * opening in its pane, and Add project; the pad and the keyboard with a non-terminal pane active, flat and half folded
 * like a laptop; the keyboard coming back from a pane's field to the terminal that becomes active or is left alone,
 * and staying away when it was lowered, when the Duo folds or when the session that takes the screen was not on it;
 * half folded like a book, the controls of a browser, files, Git changes or chooser body beside the fold wherever the
 * divider stands; folding with such a pane active opening its content full screen; the existing full-screen screens'
 * chrome left alone.
 *
 * Device-only, not shown here: a real page in the WebView, the native keyboard leaving the terminal and coming back
 * in a pane's field, and how the panes look.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Dimensions, FlatList, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { createSessionCommand } from '../commands/ghostexCli';
import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { FoldListFrame } from '../components/common/foldGap';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import { LaptopFoldProvider } from '../components/common/verticalBar/laptopFold';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { parseMobileSummary, type GhostexMobileSummary } from '../contract/mobileSummary';
import { ChangesCopy, DocsCopy, DuoChromeCopy, PanesCopy, WebPreviewCopy } from '../copy';
import { emptyMachineInventory, useInventoryStore, type MachineInventory } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { PANE_TITLE_HEIGHT } from '../panes/geometry';
import { SINGLE_PANE_DOCUMENT, type PaneLayout, type PaneLayoutDocument } from '../panes/layout';
import type { PaneEntry } from '../panes/resolve';
import { initPaneLayouts, PANE_LAYOUT_STORAGE_KEY, usePaneStore } from '../panes/store';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import { attachSessionKey, useTerminalStore, type TerminalTab } from '../terminal/sessions';
import TerminalScreen from './TerminalScreen';

const mockNative = {
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
  /** Whether a terminal holds the keyboard's input: a hardware keyboard typing into it, no keyboard on screen. */
  terminalHoldsKeyboard: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(false)),
  openTerminal: jest.fn((_sessionKey: string, _machineId: string, _opts: object) => Promise.resolve()),
};
let mockBarLayout: BarLayout | null = null;
let mockReport: ((layout: BarLayout) => void) | null = null;
/** Each terminal view's mount and unmount, in order: a remount shows here. */
const mockMounts: string[] = [];

jest.mock('../../modules/ghostex-native/src', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  function MockTerminalView(props: { sessionKey: string }) {
    React.useEffect(() => {
      mockMounts.push(`mount ${props.sessionKey}`);
      return () => {
        mockMounts.push(`unmount ${props.sessionKey}`);
      };
    }, [props.sessionKey]);
    return React.createElement(MockView, { testID: 'terminal-view', ...props });
  }
  return {
    GhostexNative: {
      addListener: (event: string, listener: (layout: BarLayout) => void) => {
        if (event === 'onBarLayoutChange') mockReport = listener;
        return { remove: () => undefined };
      },
      observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
      stopObservingBarLayout: () => Promise.resolve(),
      setKeepScreenOn: () => Promise.resolve(),
      scrollToBottom: () => Promise.resolve(),
      refreshTerminalViewport: () => Promise.resolve(),
      sendKey: () => Promise.resolve(),
      sendText: () => Promise.resolve(),
      setKeyModifiers: () => Promise.resolve(),
      pasteFromClipboard: () => Promise.resolve(),
      focusTerminal: (sessionKey: string) => mockNative.focusTerminal(sessionKey),
      blurTerminal: (sessionKey: string) => mockNative.blurTerminal(sessionKey),
      terminalHoldsKeyboard: (sessionKey: string) => mockNative.terminalHoldsKeyboard(sessionKey),
      openTerminal: (...args: [string, string, object]) => mockNative.openTerminal(...args),
      closeTerminal: () => Promise.resolve(),
    },
    GhostexTerminalView: MockTerminalView,
  };
});
jest.mock('react-native-webview', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    WebView: (props: { source: { uri: string } }) =>
      React.createElement(MockView, { testID: 'web-page', accessibilityLabel: props.source.uri }),
  };
});
jest.mock('../inventory/client', () => ({
  ...jest.requireActual('../inventory/client'),
  ensureConnected: () => Promise.resolve(),
}));
jest.mock('../remote/commands', () => ({
  remoteTerminalCommand: (_machineId: string, command: string) => Promise.resolve(command),
  remoteShellCommand: () => Promise.resolve(null),
}));
jest.mock('../machines/credentials', () => ({
  ...jest.requireActual('../machines/credentials'),
  hasPassword: () => Promise.resolve(false),
}));
// The computer: its listening ports, the forward to one of them (phone port 61000), and gxserver's answers.
jest.mock('../webPreview/ports', () => ({
  fetchRemotePorts: () => Promise.resolve([]),
}));
jest.mock('../webPreview/forwards', () => ({
  startWebPreviewForward: () => Promise.resolve({ localPort: 61000, gxserver: false }),
  describeForwardFailure: () => ({ message: '', hint: '' }),
}));
jest.mock('../webPreview/machineLinks', () => ({
  ...jest.requireActual('../webPreview/machineLinks'),
  holdComputerForward: () => undefined,
  releaseComputerForward: () => Promise.resolve(),
}));
type Answer = { result: unknown; error: { code: string; message: string } | null };
const mockRpcCalls: { machineId: string; method: string; params: Record<string, unknown> }[] = [];
const MOCK_PATCH = [
  'diff --git a/src/panes/divider.ts b/src/panes/divider.ts',
  '--- a/src/panes/divider.ts',
  '+++ b/src/panes/divider.ts',
  '@@ -1,2 +1,2 @@',
  '-export const MIN_DIVIDER_RATIO = 0.2;',
  '+export const MIN_DIVIDER_RATIO = 0.25;',
  ' export const MAX_DIVIDER_RATIO = 0.75;',
  '',
].join('\n');
jest.mock('../chat/rust/transport', () => ({
  ...jest.requireActual('../chat/rust/transport'),
  sessionChatRpc: (machine: { id: string }, method: string, params: Record<string, unknown>): Promise<Answer> => {
    mockRpcCalls.push({ machineId: machine.id, method, params });
    if (method === 'runGitAction') {
      return Promise.resolve({
        result: { isRepo: true, patch: MOCK_PATCH, baseLabel: 'main', branch: 'duo', onDefaultBranch: false },
        error: null,
      });
    }
    if (params.action === 'list' && params.scope === 'project') {
      const entries = [
        { path: 'src', name: 'src', kind: 'directory' },
        {
          path: `README-${String(params.projectId)}.md`,
          name: `README-${String(params.projectId)}.md`,
          kind: 'file',
          size: 1200,
        },
      ];
      return Promise.resolve({ result: { action: 'list', progressive: true, entries }, error: null });
    }
    return Promise.resolve({ result: { entries: [] }, error: null });
  },
}));
/** The ghostex CLI on the computer: refused unless a test answers it (a new terminal's `create-session`). */
const mockRunCli = jest.fn((_machine: unknown, _command: string): Promise<unknown> =>
  Promise.reject(new Error('no cli')),
);
jest.mock('../components/sessions/cli', () => ({
  ...jest.requireActual('../components/sessions/cli'),
  runGhostexCli: (machine: unknown, command: string) => mockRunCli(machine, command),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  selectionAsync: () => Promise.resolve(),
  performAndroidHapticsAsync: () => Promise.resolve(),
  AndroidHaptics: { Keyboard_Tap: 'keyboard-tap', Context_Click: 'context-click' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../chat/native/NativeChatScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
  useRoute: () => ({ key: 'terminal' }),
}));

type Window = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

const UPRIGHT: Window = { width: 669, height: 951 };
const HOME = 20;
const AREA_TOP = 82;
const areaOf = (window: Window): Rect => ({
  x: 0,
  y: AREA_TOP,
  width: window.width,
  height: window.height - HOME - AREA_TOP,
});
const FLAT_UPRIGHT: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: false };
const LAPTOP: FoldDivision = { ...FLAT_UPRIGHT, active: true };
const KEYBOARD_HEIGHT = 336;
const TOGGLE = 'Command pad';

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

function attachTab(sessionId: string, title: string, projectId: string): TerminalTab {
  return {
    sessionKey: attachSessionKey('m1', sessionId),
    machineId: 'm1',
    title,
    kind: 'attach',
    ghostexSessionId: sessionId,
    ghostexProjectId: projectId,
    state: 'open',
  };
}

const ALPHA = attachTab('a', 'Alpha', 'p1');
const BETA = attachTab('b', 'Beta', 'p1');
const GAMMA = attachTab('c', 'Gamma', 'p2');
const A = ALPHA.sessionKey;
const B = BETA.sessionKey;
const C = GAMMA.sessionKey;

/** A session on the wire, as the computer's summary sends it. */
function summarySession(sessionId: string, displayTitle: string, projectId: string, projectName: string) {
  return {
    sessionId,
    projectId,
    projectName,
    displayTitle,
    provider: 'zmx',
    agent: 'Codex',
    agentName: 'Codex',
    agentIcon: 'codex',
    activity: 'idle',
    status: 'running',
    isLive: true,
  };
}

/** The computer's session list as the inventory reads it (`parseMobileSummary`). */
function mobileSummary(wire: object): GhostexMobileSummary {
  const summary = parseMobileSummary(JSON.stringify(wire));
  if (summary === null) throw new Error('the fixture is not a mobile summary');
  return summary;
}

function inventory(summary: GhostexMobileSummary): MachineInventory {
  return { ...emptyMachineInventory(), summary };
}

const PROJECTS = [
  { projectId: 'p1', name: 'ghostex-mobile', path: '/Users/me/ghostex-mobile' },
  { projectId: 'p2', name: 'pad-lab', path: '/Users/me/pad-lab' },
];
const SESSIONS = [
  summarySession('a', 'Alpha', 'p1', 'ghostex-mobile'),
  summarySession('b', 'Beta', 'p1', 'ghostex-mobile'),
  summarySession('c', 'Gamma', 'p2', 'pad-lab'),
];
const SUMMARY = mobileSummary({ projects: PROJECTS, sessions: SESSIONS });

function layout(first: PaneLayout['first'], second: PaneLayout['second'], dividerRatio = 0.5): PaneLayoutDocument {
  return { schemaVersion: 1, layouts: { stacked: { first, second, dividerRatio } } };
}
const session = (sessionKey: string) => ({ paneType: 'session', sessionKey }) as const;
const BROWSER = { paneType: 'browser' } as const;
const files = (origin: string) => ({ paneType: 'files', sessionKey: origin }) as const;
const git = (origin: string) => ({ paneType: 'git', sessionKey: origin }) as const;

const navigation = { setOptions: jest.fn(), popTo: () => undefined, navigate: jest.fn(), push: jest.fn() };
const keyboard = keyboardFixture(UPRIGHT);
const initialSettings = useSettingsStore.getState().settings;
let areaView: TestInstance | null = null;

/** The window's bars; `bandWidth`: the status band's row for the header buttons (narrow: some go to "More options"). */
function barLayout(window: Window, divisions: FoldDivision[], bandWidth = 466): BarLayout {
  return {
    windowWidth: window.width,
    windowHeight: window.height,
    safeTop: 80,
    safeLeft: 0,
    safeRight: 0,
    marginTop: 88,
    topBar: { x: 0, y: 26, width: bandWidth, height: 44 },
    divisions,
  };
}

type Setup = {
  divisions?: FoldDivision[];
  tabs?: TerminalTab[];
  selected?: string;
  stored?: PaneLayoutDocument;
  bandWidth?: number;
};

/** The app starting with `stored` in storage, as `TerminalScreen.panes.rntl.tsx` renders it. */
async function renderScreen({
  divisions = [FLAT_UPRIGHT],
  tabs = [ALPHA, BETA, GAMMA],
  selected = A,
  stored,
  bandWidth,
}: Setup = {}): Promise<void> {
  mockBarLayout = barLayout(UPRIGHT, divisions, bandWidth);
  await act(() => {
    keyboard.setScreen(UPRIGHT.width, UPRIGHT.height);
    Dimensions.set({ window: { ...UPRIGHT, scale: 3, fontScale: 1 }, screen: { ...UPRIGHT, scale: 3, fontScale: 1 } });
  });
  if (stored !== undefined) await AsyncStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
  useTerminalStore.setState({
    tabs,
    selectedSessionKey: selected,
    paneSessionKey: null,
    warmOrder: tabs.map((tab) => tab.sessionKey),
  });
  await render(
    <VerticalBarArea>
      <TerminalScreen
        navigation={navigation as never}
        route={{ key: 'terminal', name: 'Terminal', params: { sessionKey: selected, machineId: 'm1' } }}
      />
    </VerticalBarArea>,
  );
  await act(async () => undefined);
  areaView = screen.getByTestId('terminal-view').parent;
  await layOut(areaOf(UPRIGHT));
  await act(() => usePaneStore.getState().hydrate());
  await settle();
}

async function layOut(area: Rect): Promise<void> {
  if (areaView === null) throw new Error('no terminal area');
  await fireEvent(areaView, 'layout', { nativeEvent: { layout: area } });
}

/** Folded or unfolded: the bar layout's report of the fold's divisions, the window keeping its size. */
async function changeDivisions(divisions: FoldDivision[]): Promise<void> {
  await act(async () => {
    mockReport?.(barLayout(UPRIGHT, divisions));
  });
  await layOut(areaOf(UPRIGHT));
  await settle();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await act(async () => undefined);
}

async function press(label: string | RegExp): Promise<void> {
  await fireEvent.press(screen.getByLabelText(label));
  await settle();
}

function shownSessions(): string[] {
  return screen.getAllByTestId('terminal-view').map((view) => String(view.props.sessionKey));
}

function pane(key: string): TestInstance {
  return screen.getByTestId(`pane:${key}`);
}

function storedStacked(): PaneLayout | undefined {
  return usePaneStore.getState().document.layouts.stacked;
}

async function storageHolds(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/** A touch that starts in a pane: the card notes every touch that starts in it. */
async function touchPane(key: string): Promise<void> {
  const point = { pageX: 10, pageY: 10, locationX: 0, locationY: 0, identifier: 0, target: 1, timestamp: 0 };
  await fireEvent(pane(key), 'touchStart', { nativeEvent: { ...point, touches: [point], changedTouches: [point] } });
  await settle();
}

/**
 * A list in a pane gets no laptop fold (`FoldListFrame` with `fold={null}`, its screen's guard), though the window is
 * half folded like a laptop: each list frame in the pane keeps the pane's whole height (no fold inset) and measures
 * nothing. While `show` runs a frame measurement answers the whole window, which crosses the fold, so a fold passed
 * into the pane would show as an inset. The laptop fold is read where the pane stands (the `LaptopFoldProvider` above
 * it), the frames' fold through React's fiber (the test renderer keeps host views only).
 */
async function expectPaneListsWithoutFold(key: string, show: () => Promise<void>): Promise<void> {
  const nativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
    '@react-native/jest-preset/jest/MockNativeMethods',
  ).default;
  nativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
    onFrame(0, 0, UPRIGHT.width, UPRIGHT.height),
  );
  try {
    await show();
    expect(propsAbove(pane(key), LaptopFoldProvider)?.value).toEqual(expect.objectContaining({ top: LAPTOP.y }));
    const frames = pane(key).queryAll((node) => propsAbove(node, FoldListFrame, 3) !== null);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(propsAbove(frame, FoldListFrame, 3)?.fold).toBeNull();
      expect(StyleSheet.flatten(frame.props.style)?.paddingBottom).toBeUndefined();
      const measured = nativeMethods.measureInWindow.mock.contexts.filter(
        (context: { props?: { onLayout?: unknown } } | undefined) => context?.props?.onLayout === frame.props.onLayout,
      );
      expect(measured).toHaveLength(0);
    }
  } finally {
    nativeMethods.measureInWindow.mockReset();
  }
}

/** The props of the nearest component of `type` above `node` (at most `depth` components up), through React's fiber. */
function propsAbove(node: TestInstance, type: unknown, depth = Infinity): Record<string, unknown> | null {
  let fiber = node.unstable_fiber?.return ?? null;
  for (let step = 0; fiber !== null && step < depth; step += 1, fiber = fiber.return) {
    if (fiber.type === type) return fiber.memoizedProps as Record<string, unknown>;
  }
  return null;
}

/** The title's window frame anchors the type menu (the test renderer measures nothing by itself). */
function measuredTitles(): () => void {
  const nativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
    '@react-native/jest-preset/jest/MockNativeMethods',
  ).default;
  nativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
    onFrame(60, 82, 200, PANE_TITLE_HEIGHT),
  );
  return () => nativeMethods.measureInWindow.mockReset();
}

/** A command of the open pane type menu, by its label (a pane's title may show the same words). */
function menuItem(label: string): TestInstance {
  for (const text of screen.getAllByText(label)) {
    for (let node: TestInstance | null = text; node !== null; node = node.parent) {
      const state = node.props.accessibilityState as { disabled?: boolean; expanded?: boolean } | undefined;
      if (state?.disabled !== undefined && state.expanded === undefined) return node;
    }
  }
  throw new Error(`no menu command ${label}`);
}

/** The Changes view lays itself out (its rows wait for their width) inside the Git changes pane. */
async function layOutChanges(key: string): Promise<void> {
  let node: TestInstance | null = within(pane(key)).getByLabelText(
    `${ChangesCopy.scopeMenu}: ${ChangesCopy.scopeMain}`,
  );
  const withLayout: TestInstance[] = [];
  while (node !== null && node !== pane(key)) {
    if (typeof node.props.onLayout === 'function') withLayout.push(node);
    node = node.parent;
  }
  for (const view of withLayout) {
    await fireEvent(view, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 600, height: 400 } } });
  }
  await settle();
}

beforeAll(() => {
  initPaneLayouts();
});

beforeEach(async () => {
  jest.useFakeTimers();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  mockNative.focusTerminal.mockImplementation(() => Promise.resolve(true));
  mockNative.terminalHoldsKeyboard.mockImplementation(() => Promise.resolve(false));
  mockMounts.length = 0;
  mockRpcCalls.length = 0;
  mockRunCli.mockReset();
  mockRunCli.mockImplementation(() => Promise.reject(new Error('no cli')));
  mockReport = null;
  areaView = null;
  navigation.navigate.mockClear();
  navigation.push.mockClear();
  navigation.setOptions.mockClear();
  useSettingsStore.setState({
    settings: {
      ...initialSettings,
      extraKeysToolbarVisible: true,
      commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS],
      commandPadPosition: {},
      preferredAgentInterface: 'terminal',
    },
  });
  useTerminalStore.setState({ sessionViewModeBySessionKey: {} });
  useMachinesStore.setState({ machines: [MACHINE] });
  useInventoryStore.setState({ inventoriesByMachineId: { m1: inventory(SUMMARY) } });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  await AsyncStorage.clear();
  usePaneStore.setState({
    hydrated: false,
    document: SINGLE_PANE_DOCUMENT,
    activeSlot: null,
    chooser: null,
    shown: null,
    browserPage: null,
  });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the chooser offers Web Preview, Files and Git Changes beside the session', () => {
  test('Git Changes fills the second pane with the session project’s Changes; the first keeps its terminal', async () => {
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    // Opening the chooser moves the terminal into its pane (package 1); from here on it stays mounted.
    mockMounts.length = 0;
    expect(screen.getByText(PanesCopy.chooserTypesLead)).toBeTruthy();
    for (const type of [PanesCopy.browserType, PanesCopy.filesType, PanesCopy.gitType]) {
      expect(screen.getByLabelText(new RegExp(`^${type}, `))).toBeTruthy();
    }
    await press(new RegExp(`^${PanesCopy.gitType}, `));

    expect(shownSessions()).toEqual([A]);
    expect(mockMounts).toEqual([]);
    expect(storedStacked()).toEqual({ first: session(A), second: git(A), dividerRatio: 0.5 });
    expect(await storageHolds()).toEqual(layout(session(A), git(A)));
    // The Changes data path: runGitAction changesDiff for the session's project on its computer.
    expect(mockRpcCalls).toContainEqual({
      machineId: 'm1',
      method: 'runGitAction',
      params: { projectId: 'p1', action: 'changesDiff', scope: 'main', ignoreWhitespace: false },
    });
    // The pane is titled by its project and is the active one: no pad, as its keys would reach no terminal.
    expect(
      within(screen.getByTestId(`pane-bar:git:${A}`)).getByLabelText(
        PanesCopy.title('ghostex-mobile', PanesCopy.gitType),
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText(TOGGLE)).toBeNull();
    // The screen's chrome stays the Changes screen's: the pane sets no header.
    expect(navigation.setOptions).not.toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }));
  });

  test('Files and Git Changes are not offered for a session without a project folder', async () => {
    const withoutFolder = mobileSummary({ projects: [{ ...PROJECTS[0], path: '' }, PROJECTS[1]], sessions: SESSIONS });
    useInventoryStore.setState({ inventoriesByMachineId: { m1: inventory(withoutFolder) } });
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    expect(screen.getByLabelText(new RegExp(`^${PanesCopy.browserType}, `))).toBeTruthy();
    expect(screen.queryByLabelText(new RegExp(`^${PanesCopy.filesType}, `))).toBeNull();
    expect(screen.queryByLabelText(new RegExp(`^${PanesCopy.gitType}, `))).toBeNull();
  });
});

describe('Git changes, read only', () => {
  test('the changed files of the project; a tap on one shows its diff in the pane; no stage, commit or revert', async () => {
    const scrolled = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
    await renderScreen({ stored: layout(session(A), git(A)) });
    await layOutChanges(`git:${A}`);
    const gitPane = within(pane(`git:${A}`));
    expect(gitPane.getByText(ChangesCopy.filesChanged(1))).toBeTruthy();
    expect(gitPane.getAllByText('divider.ts').length).toBeGreaterThan(0);

    // The file's row in the list jumps to its diff, whose lines the pane shows.
    await fireEvent.press(gitPane.getAllByText('divider.ts')[0]);
    await act(() => jest.runOnlyPendingTimers());
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ viewPosition: 0 }));
    expect(gitPane.getByText(/MIN_DIVIDER_RATIO = 0\.25/)).toBeTruthy();

    // Nothing in the pane stages, commits or reverts, also not on a long press.
    const line = gitPane.getByText(/MIN_DIVIDER_RATIO = 0\.25/);
    await fireEvent(line, 'longPress');
    await settle();
    expect(screen.queryByText(/stage|commit|revert|discard/i)).toBeNull();
    expect(mockRpcCalls.every((call) => call.method !== 'runGitAction' || call.params.action === 'changesDiff')).toBe(
      true,
    );
  });
});

describe('files', () => {
  test('the pane type menu sets the second session pane to Files of its session’s project; the first stays', async () => {
    const restore = measuredTitles();
    try {
      await renderScreen({ stored: layout(session(A), session(B)), selected: A });
      await touchPane(B);
      mockMounts.length = 0;
      await press(PanesCopy.title('Beta', PanesCopy.sessionType));
      await fireEvent.press(menuItem(PanesCopy.filesType));
      await settle();
    } finally {
      restore();
    }
    expect(shownSessions()).toEqual([A]);
    // B's terminal leaves its slot; A's stays mounted where it was.
    expect(mockMounts).toEqual([`unmount ${B}`]);
    // The selection stays a shown session's.
    expect(useTerminalStore.getState().selectedSessionKey).toBe(A);
    expect(storedStacked()).toEqual({ first: session(A), second: files(B), dividerRatio: 0.5 });
    // The project's file browser in the slot: the project scope's listing, its search field and its files.
    expect(mockRpcCalls).toContainEqual(
      expect.objectContaining({
        method: 'runProjectDocsAction',
        params: expect.objectContaining({ projectId: 'p1', scope: 'project', action: 'list' }),
      }),
    );
    const filesPane = within(pane(`files:${B}`));
    expect(filesPane.getByLabelText(DocsCopy.searchPlaceholder)).toBeTruthy();
    expect(filesPane.getByText('README-p1.md')).toBeTruthy();
  });

  test('a file opened in the pane opens in the full-screen viewer, as from Files', async () => {
    await renderScreen({ stored: layout(session(A), files(A)) });
    await fireEvent.press(within(pane(`files:${A}`)).getByText('README-p1.md'));
    await settle();
    expect(navigation.push).toHaveBeenCalledWith(
      'DocViewer',
      expect.objectContaining({
        machineId: 'm1',
        projectId: 'p1',
        entryPath: 'README-p1.md',
        session: expect.objectContaining({ sessionKey: A }),
      }),
    );
  });
});

describe('files and Git changes stay with the project they were opened from', () => {
  test('another session selected goes into the session pane; the files pane keeps its project', async () => {
    await renderScreen({ stored: layout(session(A), files(A)) });
    await act(() => useTerminalStore.getState().selectTab(C, { scrollToBottom: false }));
    await settle();
    expect(shownSessions()).toEqual([C]);
    expect(storedStacked()).toEqual({ first: session(C), second: files(A), dividerRatio: 0.5 });
    expect(
      within(screen.getByTestId(`pane-bar:files:${A}`)).getByLabelText(
        PanesCopy.title('ghostex-mobile', PanesCopy.filesType),
      ),
    ).toBeTruthy();
    expect(within(pane(`files:${A}`)).getByText('README-p1.md')).toBeTruthy();
    expect(within(pane(`files:${A}`)).queryByText('README-p2.md')).toBeNull();
  });

  test('the origin session’s tab closing leaves the pane; the session pane’s tab closing ends the layout', async () => {
    await renderScreen({ stored: layout(session(B), git(A)), selected: B });
    await act(() => useTerminalStore.setState((state) => ({ tabs: state.tabs.filter((tab) => tab.sessionKey !== A) })));
    await settle();
    expect(storedStacked()).toEqual({ first: session(B), second: git(A), dividerRatio: 0.5 });
    expect(screen.getByTestId(`pane:git:${A}`)).toBeTruthy();

    await act(() => useTerminalStore.setState((state) => ({ tabs: state.tabs.filter((tab) => tab.sessionKey !== B) })));
    await settle();
    expect(storedStacked()).toBeUndefined();
  });
});

describe('the browser: the existing Web Preview in a slot', () => {
  test('its start, then the page in the pane with a compact toolbar; Back at the first page returns to the start', async () => {
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    mockMounts.length = 0;
    await press(new RegExp(`^${PanesCopy.browserType}, `));
    expect(storedStacked()).toEqual({ first: session(A), second: BROWSER, dividerRatio: 0.5 });
    const browserPane = () => within(pane('browser'));
    // The start: an address or the computer's listening ports, as Sessions › Web opens it.
    await fireEvent.changeText(browserPane().getByLabelText(WebPreviewCopy.manualSection), '5173');
    await fireEvent.press(browserPane().getByText(WebPreviewCopy.openButton));
    await settle();
    expect(browserPane().getByTestId('web-page').props.accessibilityLabel).toBe('http://127.0.0.1:61000/');
    for (const label of [WebPreviewCopy.backLabel, WebPreviewCopy.forwardLabel, WebPreviewCopy.reloadLabel]) {
      expect(browserPane().getByLabelText(label)).toBeTruthy();
    }
    expect(browserPane().queryByLabelText(WebPreviewCopy.closeLabel)).toBeNull();
    expect(
      within(screen.getByTestId('pane-bar:browser')).getByLabelText(
        PanesCopy.title('localhost:5173', PanesCopy.browserType),
      ),
    ).toBeTruthy();
    // The session pane beside it kept its terminal.
    expect(shownSessions()).toEqual([A]);
    expect(mockMounts).toEqual([]);

    await fireEvent.press(browserPane().getByLabelText(WebPreviewCopy.backLabel));
    await settle();
    expect(browserPane().queryByTestId('web-page')).toBeNull();
    expect(browserPane().getByLabelText(WebPreviewCopy.manualSection)).toBeTruthy();
  });
});

describe('a restart brings each type back within the pane layout version 1', () => {
  test('a browser pane at the Web Preview’s start, a Git changes pane at its project', async () => {
    await renderScreen({ stored: layout(BROWSER, session(A)) });
    expect(within(pane('browser')).getByLabelText(WebPreviewCopy.manualSection)).toBeTruthy();
    expect(shownSessions()).toEqual([A]);
  });

  test('a files pane whose session the computer no longer lists says so', async () => {
    await renderScreen({ stored: layout(session(A), files('m1:gone')) });
    expect(within(pane('files:m1:gone')).getByText(PanesCopy.projectGone)).toBeTruthy();
  });

  test('a stored pane of a type this build does not show leaves one pane', async () => {
    await renderScreen({ stored: layout(session(A), { paneType: 'usage' }) });
    expect(screen.queryByTestId('pane:usage')).toBeNull();
    expect(shownSessions()).toEqual([A]);
  });
});

describe('closing, and the only session pane', () => {
  test('either pane’s close button leaves the session alone on screen', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    await press(PanesCopy.close(PanesCopy.browserType));
    expect(screen.queryByTestId('pane:browser')).toBeNull();
    expect(storedStacked()).toBeUndefined();

    await act(() => usePaneStore.getState().showSlots('stacked', A, { paneType: 'git', sessionKey: A }));
    await settle();
    await press(PanesCopy.close('Alpha'));
    expect(screen.queryByTestId(`pane:git:${A}`)).toBeNull();
    expect(shownSessions()).toEqual([A]);
    expect(useTerminalStore.getState().selectedSessionKey).toBe(A);
  });

  test('the only session pane’s type menu offers no other type', async () => {
    const restore = measuredTitles();
    try {
      await renderScreen({ stored: layout(session(A), BROWSER) });
      await press(PanesCopy.title('Alpha', PanesCopy.sessionType));
      for (const type of [PanesCopy.browserType, PanesCopy.filesType, PanesCopy.gitType]) {
        expect(menuItem(type).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      }
      await fireEvent.press(menuItem(PanesCopy.browserType));
      await settle();
      expect(storedStacked()).toEqual({ first: session(A), second: BROWSER, dividerRatio: 0.5 });
    } finally {
      restore();
    }
  });

  test('Session on a browser pane opens the chooser there; the session picked fills it', async () => {
    const restore = measuredTitles();
    try {
      await renderScreen({ stored: layout(session(A), BROWSER) });
      await press(PanesCopy.title(PanesCopy.browserType, PanesCopy.browserType));
      await fireEvent.press(menuItem(PanesCopy.sessionType));
      await settle();
    } finally {
      restore();
    }
    expect(screen.getByText(PanesCopy.chooserLead)).toBeTruthy();
    await press(/^Beta, Codex/);
    expect(storedStacked()).toEqual({ first: session(A), second: session(B), dividerRatio: 0.5 });
    expect(shownSessions().sort()).toEqual([A, B]);
  });
});

describe('the chooser: not movable, no rubber-band, Close, a new terminal or project', () => {
  /** The chooser's list: the scroll view its rows stand in. */
  const chooserList = (): TestInstance => {
    for (let node: TestInstance | null = screen.getByText(PanesCopy.chooserLead); node !== null; node = node.parent) {
      if (node.type === 'RCTScrollView') return node;
    }
    throw new Error('no chooser list');
  };

  test('its list does not spring back when pulled past its ends', async () => {
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    expect(chooserList().props).toEqual(expect.objectContaining({ bounces: false, alwaysBounceVertical: false }));
  });

  test('a Close row at its top closes it as its close button does; the session stays alone on screen', async () => {
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    const rows = within(chooserList()).getAllByRole('button');
    expect(rows[0].props.accessibilityLabel).toBe(PanesCopy.chooserClose);
    await press(PanesCopy.chooserClose);
    expect(screen.queryByText(PanesCopy.chooserLead)).toBeNull();
    expect(screen.queryByTestId('pane:chooser')).toBeNull();
    expect(shownSessions()).toEqual([A]);
    expect(storedStacked()).toBeUndefined();
  });

  /** Session picked in the browser pane's type menu: the chooser in the first pane, the session pane beside it. */
  async function chooserInFirstPane(): Promise<void> {
    const restore = measuredTitles();
    try {
      await renderScreen({ stored: layout(BROWSER, session(A)) });
      await press(PanesCopy.title(PanesCopy.browserType, PanesCopy.browserType));
      await fireEvent.press(menuItem(PanesCopy.sessionType));
      await settle();
    } finally {
      restore();
    }
    expect(screen.getByText(PanesCopy.chooserLead)).toBeTruthy();
  }

  test('in a stored layout too, neither pane moves while the chooser is one of them', async () => {
    await chooserInFirstPane();
    const point = { pageX: 100, pageY: 100, locationX: 0, locationY: 0, identifier: 0, target: 1, timestamp: 0 };
    const moved = { nativeEvent: { ...point, pageY: 600, touches: [point], changedTouches: [point] } };
    for (const key of ['chooser', A]) {
      const bar = screen.getByTestId(`pane-bar:${key}`);
      await fireEvent(bar, 'touchStart', { nativeEvent: { ...point, touches: [point], changedTouches: [point] } });
      expect(bar.props.onMoveShouldSetResponder(moved)).toBe(false);
    }
    expect(screen.queryByLabelText(PanesCopy.move(PanesCopy.newPane))).toBeNull();
  });

  test('in the first pane, Panes in the header closes the chooser and the browser comes back', async () => {
    await chooserInFirstPane();
    // The button names what it closes: the chooser ("New pane"), not the session pane beside it.
    expect(screen.queryByLabelText(PanesCopy.closeSecondPane)).toBeNull();
    await press(PanesCopy.closeNewPane);
    expect(screen.queryByTestId('pane:chooser')).toBeNull();
    expect(pane('browser')).toBeTruthy();
    expect(shownSessions()).toEqual([A]);
    expect(storedStacked()).toEqual({ first: BROWSER, second: session(A), dividerRatio: 0.5 });
  });

  test('in the second pane too, and in "More options" when the band is narrow, Panes names the chooser it closes', async () => {
    // The "…" button's window frame anchors its menu (the test renderer measures nothing by itself).
    const restore = measuredTitles();
    try {
      await renderScreen({ stored: undefined, bandWidth: 140 });
      expect(screen.queryByLabelText(PanesCopy.addPane)).toBeNull();
      await press(DuoChromeCopy.more);
      await fireEvent.press(screen.getByText(PanesCopy.addPane));
      await settle();
      expect(screen.getByText(PanesCopy.chooserLead)).toBeTruthy();
      await press(DuoChromeCopy.more);
      expect(screen.queryByText(PanesCopy.closeSecondPane)).toBeNull();
      await fireEvent.press(screen.getByText(PanesCopy.closeNewPane));
      await settle();
    } finally {
      restore();
    }
    expect(screen.queryByTestId('pane:chooser')).toBeNull();
    expect(shownSessions()).toEqual([A]);
  });

  test('New terminal in the project of the session beside it: created on the computer, opened in this pane', async () => {
    const refreshMachine = useInventoryStore.getState().refreshMachine;
    // The computer's list read again after the creation names the new terminal session.
    useInventoryStore.setState({
      refreshMachine: () => {
        useInventoryStore.setState({
          inventoriesByMachineId: {
            m1: inventory(
              mobileSummary({
                projects: PROJECTS,
                sessions: [...SESSIONS, summarySession('n', 'Shell', 'p1', 'ghostex-mobile')],
              }),
            ),
          },
        });
        return Promise.resolve();
      },
    });
    mockRunCli.mockImplementation(() =>
      Promise.resolve({ json: { ok: true, session: { sessionId: 'n' } }, stdout: '' }),
    );
    const N = attachSessionKey('m1', 'n');
    try {
      await renderScreen({ stored: undefined });
      await press(PanesCopy.addPane);
      await press(PanesCopy.newTerminalIn('ghostex-mobile'));
    } finally {
      useInventoryStore.setState({ refreshMachine });
    }
    expect(mockRunCli).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1' }),
      createSessionCommand({ projectId: 'p1' }),
    );
    expect(mockNative.openTerminal).toHaveBeenCalledWith(N, 'm1', expect.anything());
    expect(shownSessions().sort()).toEqual([A, N]);
    expect(useTerminalStore.getState().selectedSessionKey).toBe(N);
    expect(storedStacked()).toEqual({ first: session(A), second: session(N), dividerRatio: 0.5 });
    // In the pane, never the full-screen Terminal route.
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('Add project opens the computer’s Add Project flow', async () => {
    await renderScreen({ stored: undefined });
    await press(PanesCopy.addPane);
    await press(PanesCopy.addProject);
    expect(navigation.push).toHaveBeenCalledWith('AddProjectSource', { machineId: 'm1' });
  });
});

describe('the active pane without a terminal', () => {
  test('flat: tapping it hides the pad and takes the keyboard from the terminal; back in the terminal the pad returns', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
    await act(() => keyboard.show(UPRIGHT.height - KEYBOARD_HEIGHT, KEYBOARD_HEIGHT, 250));
    await touchPane('browser');
    expect(screen.queryByLabelText(TOGGLE)).toBeNull();
    expect(mockNative.blurTerminal).toHaveBeenCalledWith(A);
    expect(screen.getByTestId('pane-bar:browser').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.any(String) })]),
    );
    expect(screen.getByTestId('terminal-view').props.paneFocus).toBe(false);

    await touchPane(A);
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
    expect(screen.getByTestId('terminal-view').props.paneFocus).toBe(true);
  });

  test('a hardware keyboard typing into the terminal: tapping the browser pane takes it from the terminal', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    // The terminal holds the keyboard's input while iOS shows no keyboard: no keyboard frame arrives.
    mockNative.terminalHoldsKeyboard.mockImplementation((sessionKey) => Promise.resolve(sessionKey === A));
    await touchPane('browser');
    expect(mockNative.blurTerminal).toHaveBeenCalledWith(A);
    expect(screen.getByTestId('terminal-view').props.paneFocus).toBe(false);
  });

  test('nothing typing into the terminal and no keyboard: tapping the browser pane leaves the terminal alone', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    await touchPane('browser');
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('half folded like a laptop: side by side above the fold, no pad while the files pane is active', async () => {
    await renderScreen({ divisions: [LAPTOP], stored: undefined });
    await act(() => usePaneStore.getState().showSlots('sideBySide', A, { paneType: 'files', sessionKey: A }));
    await settle();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
    await touchPane(`files:${A}`);
    expect(screen.queryByLabelText(TOGGLE)).toBeNull();
    expect(within(pane(`files:${A}`)).getByLabelText(DocsCopy.searchPlaceholder)).toBeTruthy();
  });
});

describe('half folded like a laptop: the files pane’s list gets no fold of its own', () => {
  test('the files pane’s list keeps its whole frame: no fold inset, no measurement', async () => {
    await expectPaneListsWithoutFold(`files:${A}`, async () => {
      await renderScreen({ divisions: [LAPTOP], stored: undefined });
      await act(() => usePaneStore.getState().showSlots('sideBySide', A, files(A)));
      await settle();
    });
  });
});

describe('folded: the active pane’s content opens full screen', () => {
  test('a browser pane at a page: the Web Preview screen at that page; unfolded the layout is back', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    await fireEvent.changeText(within(pane('browser')).getByLabelText(WebPreviewCopy.manualSection), '5173');
    await fireEvent.press(within(pane('browser')).getByText(WebPreviewCopy.openButton));
    await settle();
    await touchPane('browser');
    await changeDivisions([]);
    expect(navigation.navigate).toHaveBeenCalledWith('WebPreview', {
      machineId: 'm1',
      scheme: 'http',
      remotePort: 5173,
      path: '/',
      host: 'localhost',
    });
    expect(shownSessions()).toEqual([A]);
    expect(screen.queryByTestId('pane:browser')).toBeNull();

    await changeDivisions([FLAT_UPRIGHT]);
    expect(screen.getByTestId('pane:browser')).toBeTruthy();
  });

  test('a Git changes or files pane: the Changes or Files screen of its project', async () => {
    await renderScreen({ stored: layout(session(A), git(A)) });
    await touchPane(`git:${A}`);
    await changeDivisions([]);
    expect(navigation.navigate).toHaveBeenCalledWith('Changes', {
      machineId: 'm1',
      projectId: 'p1',
      projectName: 'ghostex-mobile',
    });

    navigation.navigate.mockClear();
    await changeDivisions([FLAT_UPRIGHT]);
    await act(() => usePaneStore.getState().showSlots('stacked', A, { paneType: 'files', sessionKey: A }));
    await settle();
    await touchPane(`files:${A}`);
    await changeDivisions([]);
    expect(navigation.navigate).toHaveBeenCalledWith(
      'Docs',
      expect.objectContaining({
        machineId: 'm1',
        projectId: 'p1',
        projectName: 'ghostex-mobile',
        projectPath: '/Users/me/ghostex-mobile',
      }),
    );
  });

  test('with the session pane active: the session alone, nothing opened', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    await changeDivisions([]);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(shownSessions()).toEqual([A]);
  });
});

describe('the keyboard from a browser, files or Git changes pane back to a terminal', () => {
  /** The files pane active and its search field typed into: the keyboard is up, and the terminal does not hold it. */
  async function typingInFiles(): Promise<void> {
    await renderScreen({ stored: layout(session(A), files(A)) });
    await touchPane(`files:${A}`);
    await fireEvent(within(pane(`files:${A}`)).getByLabelText(DocsCopy.searchPlaceholder), 'focus');
    await act(() => keyboard.show(UPRIGHT.height - KEYBOARD_HEIGHT, KEYBOARD_HEIGHT, 0));
    await settle();
    mockNative.focusTerminal.mockClear();
  }

  test('another session selected (the tab strip, a link): its terminal in the session pane takes the keyboard', async () => {
    await typingInFiles();
    await act(() => useTerminalStore.getState().selectTab(C, { scrollToBottom: false }));
    await settle();
    expect(shownSessions()).toEqual([C]);
    expect(screen.getByTestId('terminal-view').props.paneFocus).toBe(true);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[C]]);
  });

  test('a touch back in the session pane: its terminal takes the keyboard', async () => {
    await typingInFiles();
    await touchPane(A);
    expect(screen.getByTestId('terminal-view').props.paneFocus).toBe(true);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[A]]);
  });

  test('the files pane closed: the session left alone on screen takes the keyboard', async () => {
    await typingInFiles();
    await press(PanesCopy.close('ghostex-mobile'));
    expect(screen.queryByTestId(`pane:files:${A}`)).toBeNull();
    expect(shownSessions()).toEqual([A]);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[A]]);
  });

  test('the session pane closed: the session left alone on screen takes the keyboard', async () => {
    await typingInFiles();
    await press(PanesCopy.close('Alpha'));
    expect(screen.queryByTestId(`pane:files:${A}`)).toBeNull();
    expect(shownSessions()).toEqual([A]);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[A]]);
  });

  test('a keyboard the person lowered stays down', async () => {
    await typingInFiles();
    await act(() => keyboard.hide(0));
    await settle();
    await touchPane(A);
    await act(() => useTerminalStore.getState().selectTab(C, { scrollToBottom: false }));
    await settle();
    expect(shownSessions()).toEqual([C]);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('folded, the files open full screen and the terminal left on the folded screen does not take the keyboard', async () => {
    await typingInFiles();
    await changeDivisions([]);
    expect(navigation.navigate).toHaveBeenCalledWith('Docs', expect.objectContaining({ projectId: 'p1' }));
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('the session pane’s tab closing ends the layout: the session selected next was not on screen and takes no keyboard', async () => {
    await typingInFiles();
    await act(() => useTerminalStore.getState().closeTab(A));
    await settle();
    expect(screen.queryByTestId(`pane:files:${A}`)).toBeNull();
    expect(useTerminalStore.getState().selectedSessionKey).not.toBe(A);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });
});

describe('half folded like a book: the controls in a browser, files, Git changes or chooser body keep off the fold', () => {
  const ACROSS: Window = { width: 951, height: 669 };
  /** The fold's 40 pt division down the middle of the turned inner display (the terminal area starts at x 0). */
  const BOOK: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };

  type Span = { from: number; to: number };

  /** Turned and half folded like a book, `first` and `second` side by side with the divider at `ratio`. */
  async function bookPose(first: PaneEntry, second: PaneEntry, ratio: number): Promise<void> {
    await act(() => {
      keyboard.setScreen(ACROSS.width, ACROSS.height);
      Dimensions.set({ window: { ...ACROSS, scale: 3, fontScale: 1 }, screen: { ...ACROSS, scale: 3, fontScale: 1 } });
      mockReport?.(barLayout(ACROSS, [BOOK]));
      usePaneStore.getState().showSlots('sideBySide', first, second);
      usePaneStore.getState().setDividerRatio('sideBySide', ratio);
    });
    await layOut(areaOf(ACROSS));
    await settle();
  }

  function styleOf(node: TestInstance, prop: 'style' | 'contentContainerStyle' = 'style'): Record<string, unknown> {
    return (StyleSheet.flatten(node.props[prop]) ?? {}) as Record<string, unknown>;
  }

  /** A style's left or right margin, padding or border, in points. */
  function sideOf(style: Record<string, unknown>, kind: 'margin' | 'padding' | 'border', side: 'Left' | 'Right') {
    const value =
      kind === 'border'
        ? (style[`border${side}Width`] ?? style.borderWidth)
        : (style[`${kind}${side}`] ?? style[`${kind}Horizontal`] ?? style[kind]);
    if (value === undefined) return 0;
    if (typeof value !== 'number') throw new Error(`${kind}${side} is not in points: ${String(value)}`);
    return value;
  }

  /**
   * Where `node` stands across the pane container: a view stretched across what its parent gives it (a row), or an
   * absolute one at its parent's right edge (`right` and `width`, a menu). From its pane card's frame and every view
   * between them: an absolute view's left and right, borders, margins, paddings (not for an absolute child), a scroll
   * view's content padding. The test renderer lays nothing out; these are the frames the styles give the bodies here,
   * each narrower than the Files column's widest.
   */
  function spanOf(key: string, node: TestInstance): Span {
    const card = pane(key);
    const views: TestInstance[] = [node];
    while (views[0] !== card) {
      const parent = views[0].parent;
      if (parent === null) throw new Error(`the view is not in the pane ${key}`);
      views.unshift(parent);
    }
    const frame = styleOf(card);
    let from = Number(frame.left);
    let to = from + Number(frame.width);
    views.forEach((view, index) => {
      const style = styleOf(view);
      if (index > 0 && style.position === 'absolute') {
        if (typeof style.right === 'number' && typeof style.width === 'number' && typeof style.left !== 'number') {
          to -= style.right;
          from = to - style.width;
        } else {
          from += typeof style.left === 'number' ? style.left : 0;
          to -= typeof style.right === 'number' ? style.right : 0;
        }
      } else if (index > 0) {
        from += sideOf(style, 'margin', 'Left');
        to -= sideOf(style, 'margin', 'Right');
      }
      if (view === node) return;
      from += sideOf(style, 'border', 'Left');
      to -= sideOf(style, 'border', 'Right');
      if (styleOf(views[index + 1]).position === 'absolute') return;
      const content = styleOf(view, 'contentContainerStyle');
      from += sideOf(style, 'padding', 'Left') + sideOf(content, 'margin', 'Left') + sideOf(content, 'padding', 'Left');
      to -=
        sideOf(style, 'padding', 'Right') + sideOf(content, 'margin', 'Right') + sideOf(content, 'padding', 'Right');
    });
    return { from, to };
  }

  function expectOffTheFold(what: string, span: Span): void {
    const offTheFold = span.to > span.from && (span.to <= BOOK.x || span.from >= BOOK.x + BOOK.width);
    expect({ what, ...span, fold: [BOOK.x, BOOK.x + BOOK.width], offTheFold }).toEqual(
      expect.objectContaining({ offTheFold: true }),
    );
  }

  function parentOf(node: TestInstance): TestInstance {
    if (node.parent === null) throw new Error('no parent');
    return node.parent;
  }

  test('a browser at 55 %: its start, then its toolbar with the "…" button at its end, stand before the fold', async () => {
    await renderScreen({ stored: layout(BROWSER, session(A)) });
    await bookPose(BROWSER, A, 0.55);
    const browserPane = () => within(pane('browser'));
    const address = browserPane().getByLabelText(WebPreviewCopy.manualSection);
    expectOffTheFold('start: address and Open', spanOf('browser', parentOf(address)));

    await fireEvent.changeText(address, '5173');
    await fireEvent.press(browserPane().getByText(WebPreviewCopy.openButton));
    await settle();
    const more = browserPane().getByLabelText(DuoChromeCopy.more);
    let row = parentOf(more);
    while (typeof row.props.onLayout !== 'function') row = parentOf(row);
    const toolbar = spanOf('browser', row);
    expectOffTheFold('toolbar', toolbar);
    // "…" is the row's last button: it ends where the row does.
    const width = Number(styleOf(more).width);
    expectOffTheFold('"…"', { from: toolbar.to - width, to: toolbar.to });
  });

  test('files at 30 %: the search row stands past the fold', async () => {
    await renderScreen({ stored: layout(session(A), files(A)) });
    await bookPose(A, files(A), 0.3);
    const search = within(pane(`files:${A}`)).getByLabelText(DocsCopy.searchPlaceholder);
    expectOffTheFold('search row', spanOf(`files:${A}`, parentOf(search)));
  });

  test('Git changes at 70 %: the scope row and its menu stand before the fold', async () => {
    await renderScreen({ stored: layout(git(A), session(A)) });
    await bookPose(git(A), A, 0.7);
    const scope = within(pane(`git:${A}`)).getByLabelText(`${ChangesCopy.scopeMenu}: ${ChangesCopy.scopeMain}`);
    expectOffTheFold('scope row', spanOf(`git:${A}`, parentOf(scope)));
    await fireEvent.press(scope);
    await settle();
    const item = within(pane(`git:${A}`)).getAllByRole('menuitem')[0];
    expectOffTheFold('scope menu', spanOf(`git:${A}`, parentOf(item)));
  });

  test('the chooser at 30 %: its pane types and its sessions stand past the fold', async () => {
    await renderScreen({ stored: layout(session(A), BROWSER) });
    await bookPose(A, BROWSER, 0.3);
    const restore = measuredTitles();
    try {
      await press(PanesCopy.title(PanesCopy.browserType, PanesCopy.browserType));
      await fireEvent.press(menuItem(PanesCopy.sessionType));
      await settle();
    } finally {
      restore();
    }
    for (const label of [new RegExp(`^${PanesCopy.browserType}, `), new RegExp(`^${PanesCopy.gitType}, `), /^Beta, /]) {
      expectOffTheFold(String(label), spanOf('chooser', within(pane('chooser')).getByLabelText(label)));
    }
  });
});
