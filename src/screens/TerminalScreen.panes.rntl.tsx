/// <reference types="jest" />
/**
 * Run with `bun run test:jest src/screens/TerminalScreen.panes.rntl.tsx`. Two agent sessions side by side on the
 * terminal screen of the iPhone Duo's inner display (`src/panes/`), rendered under the real `VerticalBarArea` with the
 * system's bar layout coming from a stand-in for the native module, so the fold's divisions reach the screen the way
 * they do on the device. Real are the screen, the pane host, the pane, terminal, settings and inventory stores, the
 * pad and its text editor; mocked are the boundaries only: the native module (its terminal view is a stand-in that
 * shows its props and records when it is mounted), the connection, haptics, storage, the safe area, navigation focus,
 * the chat screen, the voice button and the file picker.
 *
 * Covered: two terminal views at once, each with its own session; the pad keys, the text editor and Upload going to
 * the active pane only, the pane tapped last, the keyboard following it however it changes (a touch, the tab strip, a
 * pick in the chooser once its terminal is open) and going to the terminal left alone when the active pane or the
 * selected tab closes, but never raised again once lowered nor taken from the text editor;
 * the active pane marked (accent title, `paneFocus`) only while two panes show; Panes, the chooser and closing;
 * swapping by the title bar without a terminal mounted again, and no swap while the chooser is one of the two; the
 * divider drag and its 25-75 % clamp; the keyboard rules and the divider coming back; one content area folded; the
 * laptop pose with the pad's rules; half folded like a book, nothing to touch on the fold; a restart bringing the
 * layout back; the window turning into a shape with nothing stored; a session selected outside the panes and the chat
 * view; the session beside the chooser kept at the warm-terminal limit; and that only the title bars and the divider
 * handle take a drag (nothing in a pane's content does).
 *
 * Frames in window points of the iPhone Duo's inner display as the laptop test (`TerminalScreen.laptop.rntl.tsx`)
 * has them: upright 669 x 951, turned 951 x 669, the fold's division across at y 455.5 (40 pt) upright and down the
 * middle turned; the terminal area from y 82 to the home indicator inset of 20 pt is assumed, as is a 336 pt keyboard.
 * Device-only, not shown here: the frames the device reports, the native cursor drawn filled or hollow, the native
 * touch selection and its edit menu in a pane, and how a swap or a divider drag feels.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Alert, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { parseMobileSummary, type GhostexMobileSummary } from '../contract/mobileSummary';
import { PanesCopy } from '../copy';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { PANE_GAP, PANE_HANDLE_REACH, PANE_MIN_USABLE_HEIGHT, PANE_TITLE_HEIGHT } from '../panes/geometry';
import { SINGLE_PANE_DOCUMENT, type PaneLayoutDocument } from '../panes/layout';
import { initPaneLayouts, PANE_LAYOUT_STORAGE_KEY, usePaneStore } from '../panes/store';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import { attachSessionKey, restoreAttachTabs, useTerminalStore, type TerminalTab } from '../terminal/sessions';
import { GhostexPalette } from '../theme/palette';
import TerminalScreen from './TerminalScreen';

const mockNative = {
  sendKey: jest.fn((_sessionKey: string, _key: string, _mods?: object) => Promise.resolve()),
  sendText: jest.fn((_sessionKey: string, _text: string) => Promise.resolve()),
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
  openTerminal: jest.fn((_sessionKey: string, _machineId: string, _opts: object) => Promise.resolve()),
};
const mockPickAndSend = jest.fn((_machineId: string, _sessionKey: string, _sink?: unknown) => Promise.resolve('sent'));
/** Each terminal view's mount and unmount, in order: a remount shows here. */
const mockMounts: string[] = [];
/** Each time a terminal view is drawn (rendered), by its session: what a gesture redraws shows here. */
const mockTerminalRenders: string[] = [];
let mockBarLayout: BarLayout | null = null;
let mockReport: ((layout: BarLayout) => void) | null = null;
/** The chat screen's queued-prompts count report from its latest render: the terminal screen's pill shows it. */
let mockQueueCount: ((count: number) => void) | null = null;

jest.mock('../../modules/ghostex-native/src', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  function MockTerminalView(props: { sessionKey: string }) {
    mockTerminalRenders.push(props.sessionKey);
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
      sendKey: (...args: [string, string, object?]) => mockNative.sendKey(...args),
      sendText: (...args: [string, string]) => mockNative.sendText(...args),
      setKeyModifiers: () => Promise.resolve(),
      pasteFromClipboard: () => Promise.resolve(),
      focusTerminal: (sessionKey: string) => mockNative.focusTerminal(sessionKey),
      blurTerminal: (sessionKey: string) => mockNative.blurTerminal(sessionKey),
      openTerminal: (...args: [string, string, object]) => mockNative.openTerminal(...args),
      closeTerminal: () => Promise.resolve(),
    },
    GhostexTerminalView: MockTerminalView,
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
jest.mock('../components/terminal/uploads', () => ({
  ...jest.requireActual('../components/terminal/uploads'),
  pickAndSendAttachment: (...args: [string, string, unknown?]) => mockPickAndSend(...args),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// The saved computers' credentials: every Easy Connect record's address names the same computer (a synthetic address
// holding one all-zero public server key; no secret, no live address), so two records of it are merged at load.
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve('tcoWFwWCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));
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
jest.mock('../chat/native/NativeChatScreen', () => ({
  __esModule: true,
  default: (props: { onQueueCountChange?: (count: number) => void }) => {
    mockQueueCount = props.onQueueCountChange ?? null;
    return null;
  },
}));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
}));

type Window = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

const UPRIGHT: Window = { width: 669, height: 951 };
const TURNED: Window = { width: 951, height: 669 };
const HOME = 20;
const AREA_TOP = 82;
/** The terminal area, the pane container: below the header to the home indicator inset. */
const areaOf = (window: Window): Rect => ({
  x: 0,
  y: AREA_TOP,
  width: window.width,
  height: window.height - HOME - AREA_TOP,
});
/** Unfolded flat, upright: the fold across the inner display, not bent. */
const FLAT_UPRIGHT: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: false };
/** Unfolded flat, turned: the fold down the middle. */
const FLAT_TURNED: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: false };
/** Half folded like a laptop. */
const LAPTOP: FoldDivision = { ...FLAT_UPRIGHT, active: true };
const FOLD_TOP = 455.5;
const KEYBOARD_HEIGHT = 336;
const TOGGLE = 'Command pad';
const EDITOR = 'Terminal text editor';
const HIDDEN_TOO = { hidden: true };

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

function attachTab(sessionId: string, title: string): TerminalTab {
  return {
    sessionKey: attachSessionKey('m1', sessionId),
    machineId: 'm1',
    title,
    kind: 'attach',
    ghostexSessionId: sessionId,
    ghostexProjectId: 'p1',
    state: 'open',
  };
}

const ALPHA = attachTab('a', 'Alpha');
const BETA = attachTab('b', 'Beta');
const GAMMA = attachTab('c', 'Gamma');
const A = ALPHA.sessionKey;
const B = BETA.sessionKey;
const C = GAMMA.sessionKey;

/** A session on the wire, as the computer's summary sends it. */
function summarySession(sessionId: string, displayTitle: string) {
  return {
    sessionId,
    projectId: 'p1',
    projectName: 'ghostex-mobile',
    displayTitle,
    provider: 'zmx',
    agent: 'Codex',
    agentName: 'Codex',
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

const SUMMARY = mobileSummary({
  sessions: [summarySession('a', 'Alpha'), summarySession('b', 'Beta'), summarySession('c', 'Gamma')],
});

function stacked(first: string, second: string, dividerRatio = 0.5): PaneLayoutDocument {
  return {
    schemaVersion: 1,
    layouts: {
      stacked: {
        first: { paneType: 'session', sessionKey: first },
        second: { paneType: 'session', sessionKey: second },
        dividerRatio,
      },
    },
  };
}

function sideBySide(first: string, second: string, dividerRatio = 0.5): PaneLayoutDocument {
  const document = stacked(first, second, dividerRatio);
  return { schemaVersion: 1, layouts: { sideBySide: document.layouts.stacked } };
}

const navigation = { setOptions: () => undefined, popTo: () => undefined, navigate: jest.fn() };
const keyboard = keyboardFixture(UPRIGHT);
const initialSettings = useSettingsStore.getState().settings;
/** The terminal area's view, kept from the first render: the pane container. */
let areaView: TestInstance | null = null;

function barLayout(window: Window, divisions: FoldDivision[]): BarLayout {
  return {
    windowWidth: window.width,
    windowHeight: window.height,
    safeTop: 80,
    safeLeft: 0,
    safeRight: 0,
    marginTop: 88,
    topBar: { x: 0, y: 26, width: 466, height: 44 },
    divisions,
  };
}

type Setup = {
  window?: Window;
  divisions?: FoldDivision[];
  tabs?: TerminalTab[];
  selected?: string;
  /** What storage holds for the pane layout when the app starts. */
  stored?: PaneLayoutDocument;
};

/**
 * The app starting: storage holds `stored`, the screen renders with one terminal while the pane layouts load, its
 * terminal area is laid out, then the pane store has read storage (`initPaneLayouts` does that at app start, once the saved computers are loaded).
 */
async function renderScreen({
  window = UPRIGHT,
  divisions = [FLAT_UPRIGHT],
  tabs = [ALPHA, BETA],
  selected = A,
  stored,
}: Setup = {}): Promise<void> {
  mockBarLayout = barLayout(window, divisions);
  await act(() => {
    keyboard.setScreen(window.width, window.height);
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
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
  await layOutArea(areaOf(window));
  await act(() => usePaneStore.getState().hydrate());
  await settle();
}

async function layOutArea(area: Rect): Promise<void> {
  if (areaView === null) throw new Error('no terminal area');
  await fireEvent(areaView, 'layout', { nativeEvent: { layout: area } });
}

/** The device turned, folded or unfolded: the window's new size, the bar layout's report and the area's layout. */
async function changeWindow(window: Window, divisions: FoldDivision[]): Promise<void> {
  await act(() => {
    keyboard.setScreen(window.width, window.height);
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await act(async () => {
    mockReport?.(barLayout(window, divisions));
  });
  await layOutArea(areaOf(window));
  await settle();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await act(async () => undefined);
}

async function keyboardWillShow(window: Window = UPRIGHT): Promise<void> {
  await act(() => keyboard.show(window.height - KEYBOARD_HEIGHT, KEYBOARD_HEIGHT, 250));
}

async function keyboardWillHide(): Promise<void> {
  await act(() => keyboard.hide(250));
  await act(() => jest.advanceTimersByTime(1000));
}

function style(instance: TestInstance): Record<string, unknown> {
  return StyleSheet.flatten(instance.props.style) ?? {};
}

function num(instance: TestInstance, key: string): number {
  const value = style(instance)[key];
  if (typeof value !== 'number') throw new Error(`no numeric ${key} in ${JSON.stringify(style(instance))}`);
  return value;
}

/** A pane card's frame in the pane container, by the session it shows. */
function card(sessionKey: string): Rect {
  const view = screen.getByTestId(`pane:${sessionKey}`);
  return { x: num(view, 'left'), y: num(view, 'top'), width: num(view, 'width'), height: num(view, 'height') };
}

function titleBar(sessionKey: string): TestInstance {
  return screen.getByTestId(`pane-bar:${sessionKey}`);
}

function handle(): TestInstance {
  return screen.getByTestId('pane-divider-handle');
}

/** Where the divider stands in the pane container: the middle of the gap between the two cards (upright: a y). */
function dividerAt(upright = true): number {
  const cards = screen
    .getAllByTestId(/^pane:/)
    .map((view) =>
      upright
        ? { start: num(view, 'top'), size: num(view, 'height') }
        : { start: num(view, 'left'), size: num(view, 'width') },
    )
    .sort((a, b) => a.start - b.start);
  if (cards.length !== 2) throw new Error(`${cards.length} pane cards`);
  return (cards[0].start + cards[0].size + cards[1].start) / 2;
}

function terminalViews(): TestInstance[] {
  return screen.getAllByTestId('terminal-view');
}

function terminalView(sessionKey: string): TestInstance {
  const view = terminalViews().find((entry) => entry.props.sessionKey === sessionKey);
  if (view === undefined) throw new Error(`no terminal view for ${sessionKey}`);
  return view;
}

function shownSessions(): string[] {
  return terminalViews().map((view) => String(view.props.sessionKey));
}

function selected(): string | null {
  return useTerminalStore.getState().selectedSessionKey;
}

/** A terminal that was opening reports itself open: the change the native terminal's open event makes to its tab. */
function openedNow(sessionKey: string): void {
  useTerminalStore.setState((state) => ({
    tabs: state.tabs.map((tab) => (tab.sessionKey === sessionKey ? { ...tab, state: 'open' } : tab)),
  }));
}

/** A finger at a point, as React Native's touch and responder events carry it. */
function touch(pageX: number, pageY: number, down = true) {
  const point = { pageX, pageY, locationX: 0, locationY: 0, identifier: 0, target: 1, timestamp: 0 };
  return {
    persist: () => undefined,
    nativeEvent: { ...point, touches: down ? [point] : [], changedTouches: [point] },
  };
}

/** A tap anywhere in a pane: the card notes every touch that starts in it. */
async function tapPane(sessionKey: string): Promise<void> {
  await fireEvent(terminalView(sessionKey), 'touchStart', touch(10, 10));
  await settle();
}

/** A finger on a pane's title bar moved by (dx, dy) and lifted. */
async function dragTitleBar(sessionKey: string, dx: number, dy: number): Promise<void> {
  const start = touch(100, 100);
  await fireEvent(titleBar(sessionKey), 'touchStart', start);
  const moved = touch(100 + dx, 100 + dy);
  expect(titleBar(sessionKey).props.onMoveShouldSetResponder(moved)).toBe(true);
  await fireEvent(titleBar(sessionKey), 'responderGrant', moved);
  await fireEvent(titleBar(sessionKey), 'responderMove', moved);
  await fireEvent(titleBar(sessionKey), 'responderRelease', touch(100 + dx, 100 + dy, false));
  await settle();
}

/** A finger on the divider handle moved by `delta` along the divider's axis and lifted. */
async function dragDivider(delta: number, upright = true): Promise<void> {
  const at = (offset: number) => (upright ? touch(300, 400 + offset) : touch(400 + offset, 300));
  await fireEvent(handle(), 'responderGrant', at(0));
  await fireEvent(handle(), 'responderMove', at(delta));
  await fireEvent(handle(), 'responderRelease', {
    ...at(delta),
    nativeEvent: { ...at(delta).nativeEvent, touches: [] },
  });
  await settle();
}

async function press(label: string | RegExp): Promise<void> {
  await fireEvent.press(screen.getByLabelText(label));
  await settle();
}

/** A pad key's touch: down, up, and the press that completes it. */
async function tapKey(label: string): Promise<void> {
  const key = screen.getByLabelText(label);
  await fireEvent(key, 'pressIn');
  await fireEvent(key, 'pressOut');
  await fireEvent.press(key);
}

function storedLayouts(): PaneLayoutDocument['layouts'] {
  return usePaneStore.getState().document.layouts;
}

async function storageHolds(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/** The pad's toggle and everything that places it on screen, from the toggle up to the screen's root. */
function padPlacement(): Record<string, unknown>[] {
  const keys = ['left', 'right', 'top', 'bottom', 'width', 'height', 'transform'];
  const chain: Record<string, unknown>[] = [];
  for (let node: TestInstance | null = screen.getByLabelText(TOGGLE); node !== null; node = node.parent) {
    const placed = Object.fromEntries(Object.entries(style(node)).filter(([key]) => keys.includes(key)));
    if (Object.keys(placed).length > 0) chain.push(placed);
  }
  return chain;
}

beforeAll(() => {
  initPaneLayouts();
});

beforeEach(async () => {
  jest.useFakeTimers();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  mockNative.focusTerminal.mockImplementation(() => Promise.resolve(true));
  mockPickAndSend.mockClear();
  mockMounts.length = 0;
  mockReport = null;
  areaView = null;
  useSettingsStore.setState({
    settings: {
      ...initialSettings,
      extraKeysToolbarVisible: true,
      commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS],
      commandPadPosition: {},
      // Agent sessions open as terminals (the chat view is its own case below).
      preferredAgentInterface: 'terminal',
    },
  });
  useTerminalStore.setState({ sessionViewModeBySessionKey: {} });
  useMachinesStore.setState({ machines: [MACHINE] });
  useInventoryStore.setState({ inventoriesByMachineId: { m1: { ...emptyMachineInventory(), summary: SUMMARY } } });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  await AsyncStorage.clear();
  usePaneStore.setState({
    hydrated: false,
    document: SINGLE_PANE_DOCUMENT,
    activeSlot: 0,
    chooser: null,
    shown: null,
  });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('two session panes', () => {
  test('upright: two terminal views, each with its own session, the second below the first at the same x', async () => {
    await renderScreen({ stored: stacked(A, B) });
    expect(shownSessions().sort()).toEqual([A, B]);
    const top = card(A);
    const bottom = card(B);
    expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height);
    expect(bottom.x).toBe(top.x);
    // Both terminals are on screen at once, so neither is evicted and both own their grid (`src/terminal/panes.rntl.ts`).
    expect(useTerminalStore.getState().paneSessionKey).toBe(B);
  });

  test('turned: the second right of the first, at the same y', async () => {
    await renderScreen({ window: TURNED, divisions: [FLAT_TURNED], stored: sideBySide(A, B) });
    expect(shownSessions().sort()).toEqual([A, B]);
    const left = card(A);
    const right = card(B);
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(right.y).toBe(left.y);
  });

  test('Panes opens the chooser beside the session; a session picked there opens in the second pane', async () => {
    await renderScreen({ tabs: [ALPHA], stored: undefined });
    expect(shownSessions()).toEqual([A]);
    await press(PanesCopy.addPane);
    expect(screen.getByText(PanesCopy.chooserLead)).toBeTruthy();
    // The session on screen beside the chooser is not offered.
    expect(screen.queryByLabelText(/^Alpha, Codex/)).toBeNull();
    await press(/^Beta, Codex/);
    expect(mockNative.openTerminal).toHaveBeenCalledWith(B, 'm1', expect.anything());
    expect(shownSessions().sort()).toEqual([A, B]);
    // The pick is selected: it takes the keyboard and the pad, in the second pane.
    expect(selected()).toBe(B);
    expect(card(B).y).toBeGreaterThan(card(A).y);
    expect(storedLayouts().stacked).toEqual(stacked(A, B).layouts.stacked);
  });

  test("a pane's close button leaves the other one alone, full screen; Panes closes the second", async () => {
    await renderScreen({ stored: stacked(A, B) });
    await press(PanesCopy.close('Beta'));
    expect(shownSessions()).toEqual([A]);
    expect(screen.queryByTestId(`pane:${A}`)).toBeNull();
    expect(storedLayouts().stacked).toBeUndefined();

    await press(PanesCopy.addPane);
    await press(/^Beta, Codex/);
    expect(shownSessions().sort()).toEqual([A, B]);
    await press(PanesCopy.closeSecondPane);
    expect(shownSessions()).toEqual([A]);
    // The active pane was the second: the one staying takes the selection.
    expect(selected()).toBe(A);
  });

  test("a pane's title opens the pane type menu with the types this build shows", async () => {
    // The title's window frame anchors the menu (the test renderer measures nothing by itself).
    const nativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
      '@react-native/jest-preset/jest/MockNativeMethods',
    ).default;
    nativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
      onFrame(60, 82, 200, PANE_TITLE_HEIGHT),
    );
    try {
      await renderScreen({ stored: stacked(A, B) });
      await press(PanesCopy.title('Alpha', PanesCopy.sessionType));
      expect(screen.getByText(PanesCopy.typeMenuTitle)).toBeTruthy();
      expect(screen.getByText(PanesCopy.sessionType)).toBeTruthy();
    } finally {
      nativeMethods.measureInWindow.mockReset();
    }
  });
});

describe('input goes to the pane tapped last: the keyboard, the pad, the editor, Upload', () => {
  test('the pad keys, the text editor and Upload reach the active pane only, then the other once it is tapped', async () => {
    // Upload asks for Photo Library or File first, as the terminal menu does; Choose File sends for the active pane.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const chooseFile = () => act(async () => alert.mock.calls.at(-1)?.[2]?.[1]?.onPress?.());
    await renderScreen({ stored: stacked(A, B) });
    await press(TOGGLE);
    await tapKey('Esc');
    expect(mockNative.sendKey.mock.calls.map(([sessionKey]) => sessionKey)).toEqual([A]);
    await tapKey('Upload');
    await chooseFile();
    expect(mockPickAndSend.mock.calls.map(([, sessionKey]) => sessionKey)).toEqual([A]);

    await tapPane(B);
    expect(selected()).toBe(B);
    await tapKey('Esc');
    await tapKey('Upload');
    await chooseFile();
    expect(mockNative.sendKey.mock.calls.map(([sessionKey]) => sessionKey)).toEqual([A, B]);
    expect(mockPickAndSend.mock.calls.map(([, sessionKey]) => sessionKey)).toEqual([A, B]);

    await press('Text editor');
    await fireEvent.changeText(screen.getByLabelText(EDITOR, HIDDEN_TOO), 'ls');
    await press('Insert text into terminal');
    expect(mockNative.sendText.mock.calls).toEqual([[B, 'ls']]);
    // Both terminals stayed where they were: a tap moves the focus, not the panes.
    expect(shownSessions().sort()).toEqual([A, B]);
    alert.mockRestore();
  });

  test('with the keyboard up, tapping the other pane moves the keyboard to its terminal', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    await tapPane(B);
    expect(mockNative.focusTerminal).toHaveBeenCalledWith(B);
    expect(mockNative.focusTerminal).not.toHaveBeenCalledWith(A);
  });

  test('a tap in the active pane changes nothing', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await tapPane(A);
    expect(selected()).toBe(A);
    expect(usePaneStore.getState().activeSlot).toBe(0);
  });

  test('with the keyboard up, a touch in the other pane hands it the keyboard once, and no terminal mounts again', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    mockMounts.length = 0;
    await tapPane(B);
    expect(selected()).toBe(B);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[B]]);
    expect(mockMounts).toEqual([]);
  });

  test('with the keyboard up, selecting the other pane in the tab strip moves the keyboard to its terminal', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    mockMounts.length = 0;
    await fireEvent.press(screen.getByRole('tab', { name: 'Beta' }));
    await settle();
    expect(selected()).toBe(B);
    expect(terminalView(B).props.paneFocus).toBe(true);
    expect(mockMounts).toEqual([]);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[B]]);
  });

  test('a session picked in the chooser while the keyboard is up takes the keyboard once its terminal is open', async () => {
    await renderScreen({ tabs: [ALPHA], stored: undefined });
    await press(PanesCopy.addPane);
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    await press(/^Beta, Codex/);
    expect(selected()).toBe(B);
    // Its terminal is still opening: there is nothing to take the keyboard yet.
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    await act(() => openedNow(B));
    await settle();
    expect(mockNative.focusTerminal.mock.calls).toEqual([[B]]);
  });

  test('a keyboard the person lowered stays down when the active pane changes', async () => {
    await renderScreen({ tabs: [ALPHA], stored: undefined });
    await press(PanesCopy.addPane);
    await keyboardWillShow();
    await press(/^Beta, Codex/);
    // Lowered while the picked terminal still opens, then it opens: the keyboard is not raised for it.
    await keyboardWillHide();
    mockNative.focusTerminal.mockClear();
    await act(() => openedNow(B));
    await settle();
    // Lowered, then the other pane selected in the tab strip: neither raises it.
    await fireEvent.press(screen.getByRole('tab', { name: 'Alpha' }));
    await settle();
    expect(selected()).toBe(A);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('the text editor opened while the picked terminal still opens keeps the keyboard', async () => {
    await renderScreen({ tabs: [ALPHA], stored: undefined });
    await press(PanesCopy.addPane);
    await keyboardWillShow();
    await press(/^Beta, Codex/);
    await press(TOGGLE);
    await press('Text editor');
    expect(screen.getByLabelText(EDITOR, HIDDEN_TOO)).toBeTruthy();
    mockNative.focusTerminal.mockClear();
    await act(() => openedNow(B));
    await settle();
    expect(screen.getByLabelText(EDITOR, HIDDEN_TOO)).toBeTruthy();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('with the keyboard up, the selected tab closing hands the keyboard to the terminal left on screen', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    await act(() => useTerminalStore.getState().closeTab(A));
    await settle();
    expect(selected()).toBe(B);
    expect(shownSessions()).toEqual([B]);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[B]]);
  });

  test("with the keyboard up, the active pane's close button hands the keyboard to the terminal left on screen", async () => {
    await renderScreen({ stored: stacked(A, B) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    await press(PanesCopy.close('Alpha'));
    expect(selected()).toBe(B);
    expect(shownSessions()).toEqual([B]);
    expect(mockNative.focusTerminal.mock.calls).toEqual([[B]]);
  });

  test('a keyboard the person lowered stays down when the active pane or the selected tab closes', async () => {
    await renderScreen({ tabs: [ALPHA, BETA, GAMMA], stored: stacked(A, B) });
    await keyboardWillShow();
    await keyboardWillHide();
    mockNative.focusTerminal.mockClear();
    await press(PanesCopy.close('Alpha'));
    expect(shownSessions()).toEqual([B]);
    await press(PanesCopy.addPane);
    await press(/^Gamma, /);
    expect(shownSessions().sort()).toEqual([B, C]);
    await act(() => useTerminalStore.getState().closeTab(C));
    await settle();
    expect(selected()).toBe(B);
    expect(shownSessions()).toEqual([B]);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });
});

describe('the active pane is marked only while two panes show', () => {
  test('accent title and paneFocus on the active pane, grey and paneFocus false on the other; they follow a tap', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const title = (name: string) => screen.getByLabelText(PanesCopy.title(name, PanesCopy.sessionType));
    const titleColour = (name: string) => style(within(title(name)).getByText(name)).color;
    expect(terminalView(A).props.paneFocus).toBe(true);
    expect(terminalView(B).props.paneFocus).toBe(false);
    expect(title('Alpha').props.accessibilityState).toMatchObject({ selected: true });
    expect(title('Beta').props.accessibilityState).toMatchObject({ selected: false });
    expect(titleColour('Alpha')).toBe(GhostexPalette.ACCENT);
    expect(titleColour('Beta')).toBe(GhostexPalette.MUTED);

    await tapPane(B);
    expect(terminalView(A).props.paneFocus).toBe(false);
    expect(terminalView(B).props.paneFocus).toBe(true);
    expect(titleColour('Alpha')).toBe(GhostexPalette.MUTED);
    expect(titleColour('Beta')).toBe(GhostexPalette.ACCENT);
  });

  test('one pane: no marking, the terminal keeps its own focus (no paneFocus)', async () => {
    await renderScreen();
    expect(shownSessions()).toEqual([A]);
    expect(terminalView(A).props.paneFocus).toBeUndefined();
    expect(screen.queryByTestId(`pane-bar:${A}`)).toBeNull();
  });
});

describe('swapping by the title bar', () => {
  test("A's title bar dragged onto the bottom slot: B above A, neither terminal mounted again, the swap stored", async () => {
    await renderScreen({ stored: stacked(A, B) });
    const before = card(B).y;
    mockMounts.length = 0;
    // From the top title bar's middle to well inside the bottom slot.
    await dragTitleBar(A, 0, before + 60);
    expect(card(B).y).toBeLessThan(card(A).y);
    expect(card(B).y).toBe(0);
    expect(mockMounts).toEqual([]);
    expect(shownSessions().sort()).toEqual([A, B]);
    // The active pane moved with its content; the selection did not change.
    expect(selected()).toBe(A);
    expect(terminalView(A).props.paneFocus).toBe(true);
    expect(storedLayouts().stacked).toEqual(stacked(B, A).layouts.stacked);
    expect(await storageHolds()).toEqual(stacked(B, A));
  });

  test('released over its own slot: nothing moves', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const before = [card(A), card(B)];
    await dragTitleBar(A, 0, 40);
    expect([card(A), card(B)]).toEqual(before);
    expect(storedLayouts().stacked).toEqual(stacked(A, B).layouts.stacked);
  });

  test('while a title bar is dragged only its copy follows the finger: the panes are drawn again only when it crosses into the other slot', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const top = card(A);
    const bottomSlot = card(B).y;
    /** The copy of the title bar (hidden from VoiceOver), where it is drawn in the pane container. */
    const ghostAt = (): { x: number; y: number } => {
      const ghost = screen.getByTestId('pane-swap-ghost', HIDDEN_TOO);
      const shift = (style(ghost).transform ?? []) as Record<string, number>[];
      return {
        x: num(ghost, 'left') + shift.reduce((sum, entry) => sum + (entry.translateX ?? 0), 0),
        y: num(ghost, 'top') + shift.reduce((sum, entry) => sum + (entry.translateY ?? 0), 0),
      };
    };
    const move = (dy: number) => fireEvent(titleBar(A), 'responderMove', touch(100, 100 + dy));
    await fireEvent(titleBar(A), 'touchStart', touch(100, 100));
    await fireEvent(titleBar(A), 'responderGrant', touch(100, 110));
    mockTerminalRenders.length = 0;
    for (let dy = 11; dy <= 70; dy += 1) await move(dy);
    expect(mockTerminalRenders).toEqual([]);
    expect(ghostAt()).toEqual({ x: top.x, y: top.y + 70 });
    expect(screen.queryByText(PanesCopy.releaseToSwap)).toBeNull();

    // Into the other slot: it is marked as the drop target, once.
    await move(bottomSlot + 20);
    expect(screen.getByText(PanesCopy.releaseToSwap)).toBeTruthy();
    const atCrossing = mockTerminalRenders.length;
    for (let dy = bottomSlot + 21; dy <= bottomSlot + 80; dy += 1) await move(dy);
    expect(mockTerminalRenders).toHaveLength(atCrossing);
    expect(ghostAt()).toEqual({ x: top.x, y: top.y + bottomSlot + 80 });

    await fireEvent(titleBar(A), 'responderRelease', touch(100, 100 + bottomSlot + 80, false));
    await settle();
    expect(screen.queryByTestId('pane-swap-ghost', HIDDEN_TOO)).toBeNull();
    expect(card(B).y).toBe(0);
  });

  test('a touch on the title bar that moves less than the slop is a tap, not a drag', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await fireEvent(titleBar(A), 'touchStart', touch(100, 100));
    expect(titleBar(A).props.onMoveShouldSetResponder(touch(104, 104))).toBe(false);
  });

  test('while the chooser is one of the two panes, neither moves: no grip, no drag, no drop target', async () => {
    await renderScreen({ tabs: [ALPHA], stored: undefined });
    await press(PanesCopy.addPane);
    const before = [card(A), card('chooser')];
    expect(screen.queryByLabelText(PanesCopy.move(PanesCopy.newPane))).toBeNull();
    expect(screen.queryByLabelText(PanesCopy.move('Alpha'))).toBeNull();
    for (const key of ['chooser', A]) {
      await fireEvent(titleBar(key), 'touchStart', touch(100, 100));
      // Dragged from its title bar well into the other slot.
      expect(titleBar(key).props.onMoveShouldSetResponder(touch(100, 600))).toBe(false);
    }
    expect(screen.queryByText(PanesCopy.releaseToSwap)).toBeNull();
    expect([card(A), card('chooser')]).toEqual(before);
    expect(storedLayouts().stacked).toBeUndefined();
  });
});

describe('resizing by the divider handle', () => {
  test('dragged 100 pt down: the top pane grows by 100 pt and the bottom pane shrinks by as much; stored', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const top = card(A).height;
    const bottom = card(B).height;
    await dragDivider(100);
    expect(card(A).height - top).toBeCloseTo(100, 0);
    expect(bottom - card(B).height).toBeCloseTo(100, 0);
    const area = areaOf(UPRIGHT);
    expect(storedLayouts().stacked?.dividerRatio).toBeCloseTo(0.5 + 100 / area.height, 5);
  });

  test('while the handle is dragged the panes follow it at once, before the finger lets go; nothing is stored yet', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const top = card(A).height;
    await fireEvent(handle(), 'responderGrant', touch(300, 400));
    await fireEvent(handle(), 'responderMove', touch(300, 460));
    expect(card(A).height - top).toBeCloseTo(60, 0);
    await fireEvent(handle(), 'responderMove', touch(300, 480));
    expect(card(A).height - top).toBeCloseTo(80, 0);
    expect(storedLayouts().stacked?.dividerRatio).toBe(0.5);
  });

  test('dragged as far as it goes: each pane keeps 25 % of the pane container', async () => {
    const { height } = areaOf(UPRIGHT);
    await renderScreen({ stored: stacked(A, B) });
    await dragDivider(2000);
    expect(storedLayouts().stacked?.dividerRatio).toBe(0.75);
    expect(Math.abs(height - dividerAt() - height * 0.25)).toBeLessThanOrEqual(1);
    await dragDivider(-4000);
    expect(storedLayouts().stacked?.dividerRatio).toBe(0.25);
    expect(Math.abs(dividerAt() - height * 0.25)).toBeLessThanOrEqual(1);
  });
});

describe('the keyboard with two panes', () => {
  test('upright, top pane active: both keep their slots, the bottom ends above the keyboard; it hides: the divider is back', async () => {
    const area = areaOf(UPRIGHT);
    await renderScreen({ stored: stacked(A, B, 0.4) });
    const dividerBefore = dividerAt();
    const topBefore = card(A);
    const views = [terminalView(A), terminalView(B)].map((view) => ({
      width: num(view, 'width'),
      height: num(view, 'height'),
    }));
    await keyboardWillShow();
    const keyboardTop = UPRIGHT.height - KEYBOARD_HEIGHT - area.y;
    expect(card(A)).toEqual(topBefore);
    expect(card(B).y + card(B).height).toBeLessThanOrEqual(keyboardTop);
    // No divider drag while the keyboard is up.
    expect(screen.queryByTestId('pane-divider-handle')).toBeNull();
    // The terminals keep their size (their grids stay); what the keyboard takes they slide over.
    expect(
      [terminalView(A), terminalView(B)].map((view) => ({ width: num(view, 'width'), height: num(view, 'height') })),
    ).toEqual(views);

    await keyboardWillHide();
    expect(dividerAt()).toBe(dividerBefore);
    // The keyboard's layout is never stored.
    expect(storedLayouts().stacked?.dividerRatio).toBe(0.4);
  });

  test('upright, a top pane taller than the room above the keyboard: it ends above the keyboard, the bottom pane is its title bar', async () => {
    const area = areaOf(UPRIGHT);
    await renderScreen({ stored: stacked(A, B, 0.75) });
    await keyboardWillShow();
    const keyboardTop = UPRIGHT.height - KEYBOARD_HEIGHT - area.y;
    expect(card(A).y + card(A).height).toBeLessThanOrEqual(keyboardTop);
    expect(card(B).height).toBe(PANE_TITLE_HEIGHT);
  });

  test('upright, bottom pane active: the divider moves up and the bottom pane keeps 240 pt above the keyboard', async () => {
    const area = areaOf(UPRIGHT);
    await renderScreen({ stored: stacked(A, B, 0.6), selected: B });
    const dividerBefore = dividerAt();
    await keyboardWillShow();
    const keyboardTop = UPRIGHT.height - KEYBOARD_HEIGHT - area.y;
    expect(card(B).height).toBeGreaterThanOrEqual(PANE_MIN_USABLE_HEIGHT);
    expect(card(B).y + card(B).height).toBeLessThanOrEqual(keyboardTop);
    expect(dividerAt()).toBeLessThan(dividerBefore);
    await keyboardWillHide();
    expect(dividerAt()).toBe(dividerBefore);
  });

  test('turned: both panes end above the keyboard', async () => {
    const area = areaOf(TURNED);
    await renderScreen({ window: TURNED, divisions: [FLAT_TURNED], stored: sideBySide(A, B) });
    await keyboardWillShow(TURNED);
    const keyboardTop = TURNED.height - KEYBOARD_HEIGHT - area.y;
    for (const key of [A, B]) expect(card(key).y + card(key).height).toBeLessThanOrEqual(keyboardTop);
    expect(card(A).y).toBe(card(B).y);
  });
});

describe('folded: one content area', () => {
  test('no pane slots: the active session alone, no Panes button; unfolded again the panes come back', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await tapPane(B);
    await changeWindow(UPRIGHT, []);
    expect(shownSessions()).toEqual([B]);
    expect(screen.queryByTestId(`pane:${B}`)).toBeNull();
    expect(screen.queryByLabelText(PanesCopy.addPane)).toBeNull();
    expect(screen.queryByLabelText(PanesCopy.closeSecondPane)).toBeNull();
    // The stored layout waits.
    expect(storedLayouts().stacked).toEqual(stacked(A, B).layouts.stacked);

    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    expect(shownSessions().sort()).toEqual([A, B]);
    expect(terminalView(B).props.paneFocus).toBe(true);
  });

  test('an iPhone without a fold: no Panes button, one terminal, whatever is stored', async () => {
    await renderScreen({ divisions: [], stored: stacked(A, B) });
    expect(shownSessions()).toEqual([A]);
    expect(screen.queryByLabelText(PanesCopy.addPane)).toBeNull();
  });
});

describe('half folded like a laptop', () => {
  test('side by side in the upper half, the keyboard below the fold; the pad keeps its place over both', async () => {
    const area = areaOf(UPRIGHT);
    const foldInArea = FOLD_TOP - area.y;
    await renderScreen({ divisions: [LAPTOP], tabs: [ALPHA, BETA] });
    await press(TOGGLE);
    const padWithOnePane = padPlacement();
    expect(padWithOnePane.length).toBeGreaterThan(0);

    await act(() => usePaneStore.getState().showSessions('sideBySide', A, B));
    await settle();
    expect(shownSessions().sort()).toEqual([A, B]);
    for (const key of [A, B]) expect(card(key).y + card(key).height).toBeLessThanOrEqual(foldInArea);
    expect(card(A).y).toBe(card(B).y);
    expect(card(B).x).toBeGreaterThanOrEqual(card(A).x + card(A).width);
    // The pad stands where it stood over one pane (its room is the whole pane container above the fold).
    expect(padPlacement()).toEqual(padWithOnePane);

    await keyboardWillShow();
    for (const key of [A, B]) expect(card(key).y + card(key).height).toBeLessThanOrEqual(foldInArea);
    expect(card(A).y).toBe(card(B).y);
    expect(padPlacement()).toEqual(padWithOnePane);
    await tapKey('Esc');
    expect(mockNative.sendKey.mock.calls.map(([sessionKey]) => sessionKey)).toEqual([A]);
  });

  test('the text editor stands over the active pane only, as wide as it, above the fold', async () => {
    await renderScreen({ divisions: [LAPTOP], stored: sideBySide(A, B), selected: B });
    await press(TOGGLE);
    await press('Text editor');
    let dock: TestInstance | null = screen.getByLabelText(EDITOR, HIDDEN_TOO);
    while (dock !== null && style(dock).position !== 'absolute') dock = dock.parent;
    if (dock === null) throw new Error('no editor dock');
    const active = card(B);
    expect(num(dock, 'left')).toBe(areaOf(UPRIGHT).x + active.x);
    expect(num(dock, 'width')).toBe(active.width);
  });

  test('keyboard down, the divider handle stands and resizes the panes, which end above the fold; keyboard up, it is gone', async () => {
    const foldInArea = FOLD_TOP - areaOf(UPRIGHT).y;
    await renderScreen({ divisions: [LAPTOP], stored: sideBySide(A, B) });
    for (const key of [A, B]) expect(card(key).y + card(key).height).toBeLessThanOrEqual(foldInArea);
    await dragDivider(80, false);
    expect(storedLayouts().sideBySide?.dividerRatio).toBeGreaterThan(0.5);
    expect(card(A).width).toBeGreaterThan(card(B).width);

    await keyboardWillShow();
    expect(screen.queryByTestId('pane-divider-handle')).toBeNull();
  });

  test.each([
    ['right', B, A],
    ['left', A, B],
  ])(
    'the text editor over the %s pane takes nothing of the other one; the cover starts at the fold',
    async (_side, active, other) => {
      const area = areaOf(UPRIGHT);
      await renderScreen({ divisions: [LAPTOP], stored: sideBySide(A, B), selected: active });
      await keyboardWillShow();
      await press(TOGGLE);
      await press('Text editor');
      expect(screen.getByLabelText(EDITOR, HIDDEN_TOO)).toBeTruthy();
      const coverTop = area.height - num(screen.getByTestId('laptop-cover'), 'height');
      expect(coverTop).toBe(FOLD_TOP - area.y);
      expect(coverTop).toBeGreaterThanOrEqual(card(other).y + card(other).height);
    },
  );
});

describe('a restart', () => {
  test('the stored layout comes back; its second session is attached again without changing the selection', async () => {
    const area = areaOf(UPRIGHT);
    // After a restart only the selected session has its tab again.
    await renderScreen({ tabs: [ALPHA], stored: stacked(A, B, 0.6) });
    expect(mockNative.openTerminal).toHaveBeenCalledWith(B, 'm1', expect.anything());
    expect(selected()).toBe(A);
    expect(shownSessions().sort()).toEqual([A, B]);
    expect(card(A).y).toBe(0);
    expect(dividerAt()).toBe(Math.round(0.6 * area.height));
    expect(terminalView(A).props.paneFocus).toBe(true);
  });

  test('a stored layout that is not exactly the schema is discarded: one pane', async () => {
    const invalid = {
      schemaVersion: 1,
      layouts: {
        stacked: { first: { paneType: 'session' }, second: { paneType: 'session', sessionKey: B }, dividerRatio: 0.5 },
      },
    };
    await renderScreen({ stored: invalid as unknown as PaneLayoutDocument });
    expect(shownSessions()).toEqual([A]);
    expect(await storageHolds()).toBeNull();
  });

  test('a start whose computers’ load merges two records of one computer: the panes keep the kept record’s sessions and store them under it', async () => {
    // The computer's older record, from before it was paired a second time (a synthetic id).
    const DROPPED = '11111111-1111-4111-8111-111111111111';
    const saved = (id: string, pairedAt: string) => ({ ...MACHINE, id, transport: 'tailcat', pairedAt });
    // A fresh app: the pane and computer stores loaded anew, as App.tsx starts them.
    await jest.isolateModulesAsync(async () => {
      type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
      const storage = jest.requireMock<Storage>('@react-native-async-storage/async-storage');
      const panes = jest.requireActual<typeof import('../panes/store')>('../panes/store');
      const machines = jest.requireActual<typeof import('../machines/store')>('../machines/store');
      const sessions = jest.requireActual<typeof import('../terminal/sessions')>('../terminal/sessions');
      const stored = stacked(sessions.attachSessionKey(DROPPED, 'alpha'), sessions.attachSessionKey(DROPPED, 'beta'));
      await storage.setItem(
        'machines.v1',
        JSON.stringify([saved(DROPPED, '2026-10-01T00:00:00.000Z'), saved(MACHINE.id, '2026-11-01T00:00:00.000Z')]),
      );
      await storage.setItem(panes.PANE_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
      panes.initPaneLayouts();
      await machines.useMachinesStore.getState().hydrate();
      for (let i = 0; i < 20 && !panes.usePaneStore.getState().hydrated; i += 1) await Promise.resolve();
      expect(machines.useMachinesStore.getState().machines.map((machine) => machine.id)).toEqual([MACHINE.id]);
      const kept = stacked(sessions.attachSessionKey(MACHINE.id, 'alpha'), sessions.attachSessionKey(MACHINE.id, 'beta'));
      expect(panes.usePaneStore.getState().document).toEqual(kept);
      // A pane action stores the layouts again: still under the kept record, the dropped id nowhere.
      panes.usePaneStore.getState().closePanes();
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      expect(await storage.getItem(panes.PANE_LAYOUT_STORAGE_KEY)).not.toContain(DROPPED);
    });
  });
});

describe('the window turning into a shape with nothing stored', () => {
  test('the two panes come along side by side, the divider in the middle, and are stored for that shape', async () => {
    await renderScreen({ stored: stacked(A, B, 0.4) });
    await tapPane(B);
    mockMounts.length = 0;
    await changeWindow(TURNED, [FLAT_TURNED]);
    expect(shownSessions().sort()).toEqual([A, B]);
    expect(card(B).x).toBeGreaterThan(card(A).x);
    expect(card(A).y).toBe(card(B).y);
    expect(dividerAt(false)).toBe(Math.round(0.5 * areaOf(TURNED).width));
    expect(terminalView(B).props.paneFocus).toBe(true);
    expect(storedLayouts().sideBySide).toEqual(sideBySide(A, B).layouts.sideBySide);
    // The upright layout stays as it was.
    expect(storedLayouts().stacked).toEqual(stacked(A, B, 0.4).layouts.stacked);
    // Turning back: the upright layout, with its own divider.
    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    expect(dividerAt()).toBe(Math.round(0.4 * areaOf(UPRIGHT).height));
  });

  test('one pane before the turn: one pane after it', async () => {
    await renderScreen({ stored: undefined });
    await changeWindow(TURNED, [FLAT_TURNED]);
    expect(shownSessions()).toEqual([A]);
    expect(storedLayouts().sideBySide).toBeUndefined();
  });
});

describe('selection and the chat view', () => {
  test('a session selected outside the panes (tab strip, link, notification) opens in the active pane', async () => {
    await renderScreen({ tabs: [ALPHA, BETA, GAMMA], stored: stacked(A, B) });
    await tapPane(B);
    await act(() => useTerminalStore.getState().selectTab(C));
    await settle();
    expect(shownSessions().sort()).toEqual([A, C]);
    expect(card(C).y).toBeGreaterThan(card(A).y);
    expect(storedLayouts().stacked).toEqual(stacked(A, C).layouts.stacked);
  });

  test('selecting the other pane’s session moves the focus there; it is never shown twice', async () => {
    await renderScreen({ stored: stacked(A, B) });
    await act(() => useTerminalStore.getState().selectTab(B));
    await settle();
    expect(shownSessions().sort()).toEqual([A, B]);
    expect(terminalView(B).props.paneFocus).toBe(true);
  });

  test('the chat view keeps the panes: its chat in its pane, the other terminal beside it; back, both terminals', async () => {
    // The chat view of a session that has one (Codex, with its project).
    await renderScreen({ stored: stacked(A, B) });
    expect(shownSessions().sort()).toEqual([A, B]);
    await act(() => useTerminalStore.getState().setSessionViewMode(A, 'chat'));
    await settle();
    expect(shownSessions()).toEqual([B]);
    expect(card(A).y).toBe(0);
    expect(card(B).y).toBeGreaterThan(card(A).y);
    await act(() => useTerminalStore.getState().setSessionViewMode(A, 'terminal'));
    await settle();
    expect(shownSessions().sort()).toEqual([A, B]);
  });
});

describe('pane gestures never take a gesture in the content', () => {
  const RESPONDER_PROPS = [
    'onStartShouldSetResponder',
    'onMoveShouldSetResponder',
    'onStartShouldSetResponderCapture',
    'onMoveShouldSetResponderCapture',
  ];
  const claims = (node: TestInstance) => RESPONDER_PROPS.some((prop) => typeof node.props[prop] === 'function');
  /** In a title bar or the divider handle, or one of them. */
  const onPaneGrip = (node: TestInstance) => {
    for (let at: TestInstance | null = node; at !== null; at = at.parent) {
      const id: unknown = at.props.testID;
      if (typeof id === 'string' && (id.startsWith('pane-bar:') || id === 'pane-divider-handle')) return true;
    }
    return false;
  };

  test('only the title bars and the divider handle claim a touch in the pane host; nothing above a terminal does', async () => {
    await renderScreen({ stored: stacked(A, B) });
    const host = screen.getByTestId(`pane:${A}`).parent;
    if (host === null) throw new Error('no pane host');
    const claiming = host.queryAll(claims);
    // The title bars (swap drag, title, close) and the handle (resize) do.
    expect(claiming.length).toBeGreaterThanOrEqual(3);
    for (const node of claiming) expect(onPaneGrip(node)).toBe(true);
    // From each terminal view up to the screen's root, nothing asks for its touches.
    for (const key of [A, B]) {
      for (let node: TestInstance | null = terminalView(key); node !== null; node = node.parent) {
        expect(claims(node)).toBe(false);
      }
    }
  });

  test("a drag in a terminal's content moves and resizes no pane", async () => {
    await renderScreen({ stored: stacked(A, B) });
    const before = [card(A), card(B), dividerAt()];
    const view = terminalView(B);
    await fireEvent(view, 'touchStart', touch(200, 600));
    await fireEvent(view, 'touchMove', touch(200, 300));
    await fireEvent(view, 'responderMove', touch(200, 300));
    await fireEvent(view, 'touchEnd', touch(200, 300, false));
    await settle();
    expect([card(A), card(B), dividerAt()]).toEqual(before);
    expect(storedLayouts().stacked).toEqual(stacked(A, B).layouts.stacked);
  });

  test("the panes' bodies keep clear of the divider handle's touch area", async () => {
    await renderScreen({ stored: stacked(A, B) });
    const divider = handle().parent;
    const body = terminalView(A).parent;
    if (divider === null || body === null) throw new Error('no divider or pane body');
    const handleTop = num(divider, 'top') + num(handle(), 'top');
    const handleBottom = handleTop + num(handle(), 'height');
    // The handle stands on the divider and reaches into both cards.
    expect((handleTop + handleBottom) / 2).toBe(dividerAt());
    // The top pane's body (its terminal) ends where the handle begins; the bottom one begins below its title bar.
    expect(card(A).y + card(A).height - num(body, 'bottom')).toBeLessThanOrEqual(handleTop);
    expect(card(B).y + PANE_TITLE_HEIGHT).toBeGreaterThanOrEqual(handleBottom);
  });
});

describe('the warm-terminal limit while the chooser fills the second pane', () => {
  test('the session beside the chooser stays open when the pick makes room, even as the oldest warm terminal', async () => {
    const otherTabs = ['d', 'e', 'f', 'g', 'h', 'i'].map((id) => attachTab(id, id));
    await renderScreen({ tabs: [ALPHA, ...otherTabs].map((tab) => ({ ...tab, state: 'failed' })) });
    // Foreground recovery reopens the selected terminal first, then every other tab: the selected one is the oldest.
    await act(() => restoreAttachTabs('m1'));
    await settle();
    expect(useTerminalStore.getState().warmOrder[0]).toBe(A);
    await press(PanesCopy.addPane);
    await press(/^Beta, Codex/);
    expect(useTerminalStore.getState().warmOrder.length).toBeLessThanOrEqual(7);
    expect(shownSessions().sort()).toEqual([A, B]);
    expect(useTerminalStore.getState().tabs.some((tab) => tab.sessionKey === A)).toBe(true);
    expect(useTerminalStore.getState().paneSessionKey).toBe(A);
  });
});

describe('half folded like a book: no layout of its own, nothing to touch on the fold', () => {
  /** Half folded with the fold down the middle of the turned inner display. */
  const BOOK: FoldDivision = { ...FLAT_TURNED, active: true };
  const area = areaOf(TURNED);
  /** The fold along the pane container's width. */
  const fold = { left: BOOK.x - area.x, right: BOOK.x + BOOK.width - area.x };
  const onFold = (left: number, right: number) => right > fold.left && left < fold.right;
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const margin = (node: TestInstance, key: string): number => {
    const value = style(node)[key];
    return typeof value === 'number' ? value : 0;
  };
  /** A pane's title bar along the container's width: its grip, title, close button and drag area stand in it. */
  const barSpan = (sessionKey: string) => {
    const at = card(sessionKey);
    const bar = titleBar(sessionKey);
    return { left: at.x + margin(bar, 'marginLeft'), right: at.x + at.width - margin(bar, 'marginRight') };
  };
  /** The divider handle's touch area in the pane container. */
  const handleRect = (): Rect => {
    const divider = handle().parent;
    if (divider === null) throw new Error('no divider');
    return {
      x: num(divider, 'left') + num(handle(), 'left'),
      y: num(divider, 'top') + num(handle(), 'top'),
      width: num(handle(), 'width'),
      height: num(handle(), 'height'),
    };
  };
  /** A pane's body, its terminal's place, in the pane container. */
  const bodyRect = (sessionKey: string): Rect => {
    const at = card(sessionKey);
    const body = terminalView(sessionKey).parent;
    if (body === null) throw new Error('no pane body');
    const [left, right, bottom] = [num(body, 'left'), num(body, 'right'), num(body, 'bottom')];
    return {
      x: at.x + left,
      y: at.y + PANE_TITLE_HEIGHT,
      width: at.width - left - right,
      height: at.height - PANE_TITLE_HEIGHT - bottom,
    };
  };
  const TITLES: Record<string, string> = { [A]: 'Alpha', [B]: 'Beta' };

  test('the divider handle stays outside the active division', async () => {
    await renderScreen({ window: TURNED, divisions: [BOOK], stored: sideBySide(A, B) });
    const { x, width } = handleRect();
    expect(x + width <= fold.left || x >= fold.right).toBe(true);
  });

  test.each([0.25, 0.3, 0.45, 0.5, 0.55, 0.7, 0.75])(
    'divider at %p: the handle and both title bars keep off the fold, the handle off both bodies',
    async (ratio) => {
      await renderScreen({ window: TURNED, divisions: [BOOK], stored: sideBySide(A, B, ratio) });
      const grip = handleRect();
      expect(onFold(grip.x, grip.x + grip.width)).toBe(false);
      for (const key of [A, B]) {
        // A drag on the handle never starts in a terminal's content.
        expect(overlaps(grip, bodyRect(key))).toBe(false);
        const bar = barSpan(key);
        expect(onFold(bar.left, bar.right)).toBe(false);
        // The handle in the title bars' row takes no title bar's place.
        if (grip.y < PANE_TITLE_HEIGHT) expect(grip.x + grip.width <= bar.left || grip.x >= bar.right).toBe(true);
        // The grip, the title and the close button are the title bar's own.
        const inBar = within(titleBar(key));
        expect(inBar.getByLabelText(PanesCopy.move(TITLES[key]))).toBeTruthy();
        expect(inBar.getByLabelText(PanesCopy.title(TITLES[key], PanesCopy.sessionType))).toBeTruthy();
        expect(inBar.getByLabelText(PanesCopy.close(TITLES[key]))).toBeTruthy();
      }
    },
  );

  /** The queued-prompts pill's left edge in the pane container: its own offset and each one up to its pane card. */
  const pillLeft = (): number => {
    let left = 0;
    for (
      let node: TestInstance | null = screen.getByLabelText(/queued prompts?\./);
      node !== null;
      node = node.parent
    ) {
      left += margin(node, 'left');
      if (String(node.props.testID ?? '').startsWith('pane:')) return left;
    }
    throw new Error('the queued-prompts pill is in no pane');
  };
  /** Assumed: wider than the pill with two digits at 12 pt and its padding; its real width is the device's layout's. */
  const PILL_WIDTH = 96;
  /** The chat screen reports queued prompts for the session in the active pane. */
  const queuePrompts = async (count: number): Promise<void> => {
    const report = mockQueueCount;
    if (report === null) throw new Error('no chat screen reports the queue');
    await act(() => report(count));
    await settle();
  };

  test.each([0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.7, 0.75])(
    'divider at %p: the queued-prompts pill keeps off the fold in either active pane, inside its body',
    async (ratio) => {
      await renderScreen({ window: TURNED, divisions: [BOOK], stored: sideBySide(A, B, ratio) });
      for (const key of [A, B]) {
        await tapPane(key);
        await queuePrompts(2);
        const left = pillLeft();
        expect(onFold(left, left + PILL_WIDTH)).toBe(false);
        const body = bodyRect(key);
        expect(left >= body.x && left + PILL_WIDTH <= body.x + body.width).toBe(true);
      }
    },
  );

  test.each(
    [0.3, 0.4, 0.45].flatMap((ratio) => [
      ['flat, turned', ratio, TURNED, FLAT_TURNED] as const,
      ['half folded like a laptop', ratio, UPRIGHT, LAPTOP] as const,
    ]),
  )(
    '%s, divider at %p: the queued-prompts pill stands at its own offset in the active body, as before',
    async (_pose, ratio, window, division) => {
      await renderScreen({ window, divisions: [division], stored: sideBySide(A, B, ratio) });
      for (const key of [A, B]) {
        await tapPane(key);
        await queuePrompts(2);
        const pill = screen.getByLabelText(/queued prompts?\./);
        expect(pillLeft()).toBe(bodyRect(key).x + margin(pill, 'left'));
      }
    },
  );

  test('folding like a book keeps the slots, the terminals and the stored divider; flat again, all is as before', async () => {
    await renderScreen({ window: TURNED, divisions: [FLAT_TURNED], stored: sideBySide(A, B) });
    const flat = {
      cards: [card(A), card(B)],
      terminals: [style(terminalView(A)), style(terminalView(B))],
      bars: [barSpan(A), barSpan(B)],
      handle: handleRect(),
    };
    // Flat, the title bars span their cards and the handle stands in the middle of the divider.
    expect(flat.bars).toEqual(flat.cards.map((at) => ({ left: at.x, right: at.x + at.width })));
    expect(flat.handle.x + flat.handle.width / 2).toBe(dividerAt(false));
    mockMounts.length = 0;

    await changeWindow(TURNED, [BOOK]);
    expect([card(A), card(B)]).toEqual(flat.cards);
    expect([style(terminalView(A)), style(terminalView(B))]).toEqual(flat.terminals);
    expect(storedLayouts().sideBySide?.dividerRatio).toBe(0.5);
    expect(mockMounts).toEqual([]);

    await changeWindow(TURNED, [FLAT_TURNED]);
    expect([barSpan(A), barSpan(B)]).toEqual(flat.bars);
    expect(handleRect()).toEqual(flat.handle);
  });
});
