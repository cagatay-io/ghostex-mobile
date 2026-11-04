/// <reference types="jest" />
/**
 * Run with `bun run test:jest src/screens/TerminalScreen.chatPanes.rntl.tsx`. The chat view in the pane slots of the
 * iPhone Duo's inner display, under
 * the real `VerticalBarArea` with the fold's divisions from a stand-in for the native module. Real are the screen, the
 * pane host, the pane, terminal, settings and inventory stores; mocked are the boundaries: the native module (its
 * terminal view a stand-in), the chat screen (a stand-in that shows its props), the zmx display policy and the chat
 * lease (recorded), the connection, haptics, storage, the safe area and navigation focus.
 *
 * One test per approved state where a test can show it (chat-single, chat-choose, chat-two, chat-under, chat-second,
 * chat-kb-top, chat-kb-bottom, chat-kb-back, chat-kb-land, chat-lap, chat-folded, chat-phone), plus: the chat or
 * terminal of a pane is never stored, a pane pick opens a terminal, the keyboard follows the active pane to and from
 * the composer, the zmx display states and the chat lease, the back swipe kept. Device-only (REPORT.md): chat-sheet
 * (the chat's own window-level sheets), the keyboard's motion and the IME handing over between composer and terminal.
 *
 * Frames in window points of the inner display as `TerminalScreen.panes.rntl.tsx` has them: upright 669 x 951,
 * turned 951 x 669, the fold across at y 455.5 (40 pt); the terminal area from y 82 to the 20 pt home indicator inset;
 * a 336 pt keyboard.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { parseMobileSummary } from '../contract/mobileSummary';
import { PanesCopy, TerminalHeaderCopy } from '../copy';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { PANE_FOLD_CLEARANCE, PANE_TITLE_HEIGHT } from '../panes/geometry';
import { SINGLE_PANE_DOCUMENT, type PaneLayoutDocument, type PaneSlot } from '../panes/layout';
import { initPaneLayouts, PANE_LAYOUT_STORAGE_KEY, usePaneStore } from '../panes/store';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import { attachSessionKey, useTerminalStore, type TerminalTab } from '../terminal/sessions';
import TerminalScreen from './TerminalScreen';

const mockNative = {
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
  openTerminal: jest.fn((_sessionKey: string, _machineId: string, _opts: object) => Promise.resolve()),
};
let mockBarLayout: BarLayout | null = null;
let mockReport: ((layout: BarLayout) => void) | null = null;
/** The zmx display policy's last report: the terminal on screen, the chat on screen, the terminal in the other pane. */
let mockMounted: [string | null, string | null, string | null] = [null, null, null];
/** The chat lease's session (`setChatGridSessionKey`). */
let mockChatGrid: string | null = null;

jest.mock('../../modules/ghostex-native/src', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
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
      openTerminal: (...args: [string, string, object]) => mockNative.openTerminal(...args),
      closeTerminal: () => Promise.resolve(),
    },
    GhostexTerminalView: (props: { sessionKey: string }) =>
      React.createElement(MockView, { testID: 'terminal-view', ...props }),
  };
});
jest.mock('../chat/native/NativeChatScreen', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: { sessionId: string }) =>
      React.createElement(MockView, { testID: `chat:${props.sessionId}`, ...props }),
  };
});
jest.mock('../terminal/zmxDisplay', () => ({
  ...jest.requireActual('../terminal/zmxDisplay'),
  setMountedSessionKeys: (terminal: string | null, chat: string | null, pane: string | null = null) => {
    mockMounted = [terminal, chat, pane];
  },
}));
jest.mock('../terminal/chatGridClaim', () => ({
  setChatGridSessionKey: (sessionKey: string | null) => {
    mockChatGrid = sessionKey;
  },
}));
jest.mock('../inventory/client', () => ({
  ...jest.requireActual('../inventory/client'),
  ensureConnected: () => Promise.resolve(),
}));
jest.mock('../remote/commands', () => ({
  remoteTerminalCommand: (_machineId: string, command: string) => Promise.resolve(command),
  remoteShellCommand: () => Promise.resolve(null),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  selectionAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }),
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
/** The folded Duo's outer display and a regular iPhone: windows without the fold's divisions. */
const FOLDED: Window = { width: 466, height: 678 };
const PHONE: Window = { width: 402, height: 874 };
const HOME = 20;
const AREA_TOP = 82;
const areaOf = (window: Window): Rect => ({
  x: 0,
  y: AREA_TOP,
  width: window.width,
  height: window.height - HOME - AREA_TOP,
});
const FLAT_UPRIGHT: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: false };
const FLAT_TURNED: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: false };
const LAPTOP: FoldDivision = { ...FLAT_UPRIGHT, active: true };
const FOLD_TOP = 455.5;
const KEYBOARD_HEIGHT = 336;
const TOGGLE = 'Command pad';
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

const SUMMARY = parseMobileSummary(
  JSON.stringify({
    sessions: [summarySession('a', 'Alpha'), summarySession('b', 'Beta'), summarySession('c', 'Gamma')],
  }),
);

const sessionSlot = (sessionKey: string): PaneSlot => ({ paneType: 'session', sessionKey });

function stacked(first: PaneSlot, second: PaneSlot, dividerRatio = 0.5): PaneLayoutDocument {
  return { schemaVersion: 1, layouts: { stacked: { first, second, dividerRatio } } };
}

function sideBySide(first: PaneSlot, second: PaneSlot, dividerRatio = 0.5): PaneLayoutDocument {
  return { schemaVersion: 1, layouts: { sideBySide: { first, second, dividerRatio } } };
}

const navigation = { setOptions: jest.fn(), popTo: jest.fn(), navigate: jest.fn(), push: jest.fn() };
const keyboard = keyboardFixture(UPRIGHT);
const initialSettings = useSettingsStore.getState().settings;

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
  /** The sessions whose saved view is their chat. */
  chats?: string[];
  stored?: PaneLayoutDocument;
};

/** The app starting with one content area while the pane layouts load, then the pane store reading storage. */
async function renderScreen({
  window = UPRIGHT,
  divisions = [FLAT_UPRIGHT],
  tabs = [ALPHA, BETA, GAMMA],
  selected = A,
  chats = [A],
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
    sessionViewModeBySessionKey: Object.fromEntries(chats.map((key) => [key, 'chat'])),
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
  // The terminal area: the parent of what fills it with one content area, the chat or the terminal.
  const filler = screen.queryByTestId('terminal-view') ?? screen.getByTestId(/^chat:/, HIDDEN_TOO);
  if (filler.parent === null) throw new Error('no terminal area');
  await fireEvent(filler.parent, 'layout', { nativeEvent: { layout: areaOf(window) } });
  await act(() => usePaneStore.getState().hydrate());
  await settle();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await act(async () => undefined);
}

async function keyboardWillShow(window: Window = UPRIGHT): Promise<void> {
  await act(() => keyboard.show(window.height - KEYBOARD_HEIGHT, KEYBOARD_HEIGHT, 250));
  await settle();
}

async function keyboardWillHide(): Promise<void> {
  await act(() => keyboard.hide(250));
  await act(() => jest.advanceTimersByTime(1000));
  await settle();
}

function num(instance: TestInstance, key: string): number {
  const value = (StyleSheet.flatten(instance.props.style) as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== 'number') throw new Error(`no numeric ${key}`);
  return value;
}

/** A pane card's frame in the pane container, by what it shows (a session's key, or a pane type). */
function card(key: string): Rect {
  const view = screen.getByTestId(`pane:${key}`);
  return { x: num(view, 'left'), y: num(view, 'top'), width: num(view, 'width'), height: num(view, 'height') };
}

function bottomOf(rect: Rect): number {
  return rect.y + rect.height;
}

function dividerAt(): number {
  const cards = screen
    .getAllByTestId(/^pane:/)
    .map((view) => ({ start: num(view, 'top'), size: num(view, 'height') }))
    .sort((a, b) => a.start - b.start);
  return (cards[0].start + cards[0].size + cards[1].start) / 2;
}

/** The chat screen of a session (`a`, `b`, `c`), wherever it stands. */
function chat(sessionId: string): TestInstance {
  return screen.getByTestId(`chat:${sessionId}`, HIDDEN_TOO);
}

/** The chat screen standing in a pane, by the session's key. */
function chatInPane(sessionKey: string, sessionId: string): TestInstance {
  return within(screen.getByTestId(`pane:${sessionKey}`)).getByTestId(`chat:${sessionId}`, HIDDEN_TOO);
}

function terminalsShown(): string[] {
  return screen.queryAllByTestId('terminal-view', HIDDEN_TOO).map((view) => String(view.props.sessionKey));
}

/** Within a pane: no terminal view. */
function terminalIn(sessionKey: string): TestInstance | null {
  return within(screen.getByTestId(`pane:${sessionKey}`)).queryByTestId('terminal-view', HIDDEN_TOO);
}

function selected(): string | null {
  return useTerminalStore.getState().selectedSessionKey;
}

function savedViews(): Record<string, string> {
  return useTerminalStore.getState().sessionViewModeBySessionKey;
}

function touch() {
  const point = { pageX: 10, pageY: 10, locationX: 0, locationY: 0, identifier: 0, target: 1, timestamp: 0 };
  return { persist: () => undefined, nativeEvent: { ...point, touches: [point], changedTouches: [point] } };
}

/** A touch anywhere in a pane: the card notes every touch that starts in it. */
async function tapPane(sessionKey: string): Promise<void> {
  await fireEvent(screen.getByTestId(`pane:${sessionKey}`), 'touchStart', touch());
  await settle();
}

async function press(label: string | RegExp): Promise<void> {
  await fireEvent.press(screen.getByLabelText(label));
  await settle();
}

beforeAll(() => {
  initPaneLayouts();
});

beforeEach(async () => {
  jest.useFakeTimers();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  navigation.setOptions.mockClear();
  mockReport = null;
  mockMounted = [null, null, null];
  mockChatGrid = null;
  useSettingsStore.setState({
    settings: {
      ...initialSettings,
      extraKeysToolbarVisible: true,
      commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS],
      commandPadPosition: {},
      preferredAgentInterface: 'terminal',
    },
  });
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
    chatSession: null,
    pickedSession: null,
    questionHold: null,
  });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the chat view offers the pane slots', () => {
  test('chat-single: the chat view as today, with the Panes button', async () => {
    await renderScreen();
    expect(chat('a').props.visible).toBe(true);
    expect(chat('a').props.inPane).toBeFalsy();
    expect(screen.queryAllByTestId(/^pane:/)).toEqual([]);
    expect(terminalsShown()).toEqual([]);
    expect(screen.getByLabelText(PanesCopy.addPane)).toBeTruthy();
  });

  test('chat-choose, chat-two: the chat stays in its slot, the chooser leaves its session out, a pick opens a terminal', async () => {
    // Only the chat's tab is open: the pick opens its session's terminal.
    await renderScreen({ tabs: [ALPHA] });
    await press(PanesCopy.addPane);
    expect(chatInPane(A, 'a').props.visible).toBe(true);
    expect(chatInPane(A, 'a').props.inPane).toBe(true);
    expect(terminalsShown()).toEqual([]);
    expect(screen.getByText(PanesCopy.chooserLead)).toBeTruthy();
    // A session cannot appear beside its own chat.
    expect(screen.queryByLabelText(/^Alpha, Codex/)).toBeNull();
    expect(screen.getByLabelText(/^Beta, Codex/)).toBeTruthy();

    await press(/^Beta, Codex/);
    expect(mockNative.openTerminal).toHaveBeenCalledWith(B, 'm1', expect.anything());
    expect(selected()).toBe(B);
    expect(terminalIn(B)).not.toBeNull();
    expect(chatInPane(A, 'a').props.visible).toBe(true);
    expect(terminalIn(A)).toBeNull();
    expect(card(B).y).toBeGreaterThan(card(A).y);
    // The pick's terminal is the pane's only: nothing about it is saved.
    expect(savedViews()).toEqual({ [A]: 'chat' });
    // The chat's title bar says it is a chat.
    expect(screen.getByLabelText(PanesCopy.title('Alpha', PanesCopy.chatType))).toBeTruthy();
  });

  test('chat-under: any pane type above the chat; the active chat has no pad and no editor', async () => {
    await renderScreen({ stored: stacked({ paneType: 'agents' }, sessionSlot(A)) });
    expect(chatInPane(A, 'a').props.visible).toBe(true);
    expect(screen.getByTestId('pane:agents')).toBeTruthy();
    expect(terminalsShown()).toEqual([]);
    await tapPane(A);
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
  });

  test('chat-second: one chat per screen; the chat view of the other pane turns the first back to its terminal', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    expect(chatInPane(A, 'a')).toBeTruthy();
    expect(terminalIn(B)).not.toBeNull();
    await tapPane(B);
    expect(selected()).toBe(B);
    await press(TerminalHeaderCopy.chatView);
    expect(chatInPane(B, 'b').props.visible).toBe(true);
    expect(terminalIn(A)).not.toBeNull();
    expect(screen.queryByTestId('chat:a', HIDDEN_TOO)).toBeNull();
    // Pane-scoped: the sessions' own saved views are unchanged.
    expect(savedViews()).toEqual({ [A]: 'chat' });

    // The chat's own Terminal View turns its pane back to the terminal.
    await act(() => (chatInPane(B, 'b').props.onSwitchToTerminal as () => void)());
    await settle();
    expect(terminalIn(B)).not.toBeNull();
    expect(terminalIn(A)).not.toBeNull();
    expect(savedViews()).toEqual({ [A]: 'chat' });
  });

  test('not stored: the layout holds no view; one pane again shows the session’s saved view', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    await press(TerminalHeaderCopy.terminalView);
    expect(terminalIn(A)).not.toBeNull();
    const raw = await AsyncStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
    expect(JSON.parse(raw ?? 'null')).toEqual(stacked(sessionSlot(A), sessionSlot(B)));
    await press(PanesCopy.close('Beta'));
    expect(screen.queryAllByTestId(/^pane:/)).toEqual([]);
    expect(chat('a').props.visible).toBe(true);
    expect(terminalsShown()).toEqual([]);
  });

  test('a session selected from outside the panes shows its saved view there, and stays the one chat', async () => {
    await renderScreen({ chats: [A, C], stored: stacked(sessionSlot(A), sessionSlot(B)) });
    await tapPane(B);
    await act(() => useTerminalStore.getState().selectTab(C, { scrollToBottom: false }));
    await settle();
    expect(chatInPane(C, 'c').props.visible).toBe(true);
    expect(terminalIn(A)).not.toBeNull();
  });

  test('a session whose saved view turns to its chat view while it stands in a pane shows it there', async () => {
    await renderScreen({ chats: [], stored: stacked(sessionSlot(A), sessionSlot(B)) });
    expect(terminalsShown().sort()).toEqual([A, B]);
    await act(() => useTerminalStore.getState().setSessionViewMode(B, 'chat'));
    await settle();
    expect(chatInPane(B, 'b').props.visible).toBe(true);
    expect(terminalIn(A)).not.toBeNull();
  });

  test('a question a link opened stands full screen over the panes; the Panes button brings them back', async () => {
    await renderScreen({ chats: [], stored: stacked(sessionSlot(A), sessionSlot(B)) });
    // What a question's link does (`deepLinks.ts`'s `showChatView`; the real route is in
    // `TerminalScreen.infoPanes.rntl.tsx`): its session selected in its chat view, held full screen.
    await act(() => {
      useTerminalStore.getState().selectTab(C, { scrollToBottom: false });
      useTerminalStore.getState().setSessionViewMode(C, 'chat');
      usePaneStore.getState().setQuestionHold(C);
    });
    await settle();
    expect(screen.queryAllByTestId(/^pane:/)).toEqual([]);
    expect(chat('c').props.visible).toBe(true);
    expect(chat('c').props.inPane).toBeFalsy();
    await press(PanesCopy.addPane);
    expect(usePaneStore.getState().questionHold).toBeNull();
    expect(screen.getAllByTestId(/^pane:/)).toHaveLength(2);
    expect(chatInPane(C, 'c').props.visible).toBe(true);
  });

  // Picking an already selected chat still switches that pane to its terminal.
  test('a pick of the session already shown as chat (agents pane) opens its terminal there, its saved view kept', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), { paneType: 'agents' }) });
    expect(chatInPane(A, 'a').props.visible).toBe(true);
    await fireEvent.press(within(screen.getByTestId('pane:agents')).getByLabelText(/^Alpha, Codex/));
    await settle();
    expect(selected()).toBe(A);
    expect(savedViews()[A]).toBe('chat');
    expect(terminalIn(A)).not.toBeNull();
    expect(within(screen.getByTestId(`pane:${A}`)).queryByTestId('chat:a', HIDDEN_TOO)).toBeNull();
    expect(mockChatGrid).toBeNull();
  });

  test('picking the chat beside a terminal pane turns only that chat to its terminal', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    await act(() => usePaneStore.getState().setPickedSession(B));
    await settle();
    expect(chatInPane(A, 'a').props.visible).toBe(true);
  });
});

/** The required least height of the lower pane above the keyboard, bound here independently
 * so a smaller value in the geometry fails this test. */
const REQUIRED_MIN_LOWER_PANE = 240;

describe('the keyboard rules with a chat in a pane', () => {
  const keyboardTopInArea = (window: Window) => window.height - KEYBOARD_HEIGHT - AREA_TOP;

  test('chat-kb-top: the chat above keeps its slot, the pane below ends at the keyboard; no pad', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    const before = card(A);
    await keyboardWillShow();
    expect(card(A)).toEqual(before);
    expect(bottomOf(card(B))).toBeLessThanOrEqual(keyboardTopInArea(UPRIGHT));
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    // The pane holds the cover: the composer does not lift itself again.
    expect(chatInPane(A, 'a').props.inPane).toBe(true);
  });

  test('chat-kb-bottom, chat-kb-back: the chat below keeps 240 pt above the keyboard; the divider comes back', async () => {
    await renderScreen({ selected: A, stored: stacked(sessionSlot(B), sessionSlot(A)) });
    await tapPane(A);
    const before = dividerAt();
    await keyboardWillShow();
    expect(card(A).height).toBeGreaterThanOrEqual(REQUIRED_MIN_LOWER_PANE);
    expect(bottomOf(card(A))).toBeLessThanOrEqual(keyboardTopInArea(UPRIGHT));
    expect(dividerAt()).toBeLessThan(before);
    await keyboardWillHide();
    expect(dividerAt()).toBe(before);
  });

  test('chat-kb-land: across, both panes end at the keyboard', async () => {
    await renderScreen({
      window: TURNED,
      divisions: [FLAT_TURNED],
      stored: sideBySide(sessionSlot(A), sessionSlot(B)),
    });
    expect(card(B).x).toBeGreaterThanOrEqual(card(A).x + card(A).width);
    await keyboardWillShow(TURNED);
    for (const key of [A, B]) expect(bottomOf(card(key))).toBeLessThanOrEqual(keyboardTopInArea(TURNED));
    expect(chatInPane(A, 'a').props.visible).toBe(true);
  });

  test('chat-lap: half folded, chat and terminal side by side above the fold; the pad only with the terminal active', async () => {
    const foldInArea = FOLD_TOP - AREA_TOP;
    await renderScreen({ divisions: [LAPTOP], stored: sideBySide(sessionSlot(A), sessionSlot(B)) });
    for (const key of [A, B]) expect(bottomOf(card(key))).toBeLessThanOrEqual(foldInArea - PANE_FOLD_CLEARANCE);
    expect(card(A).y).toBe(card(B).y);
    expect(chatInPane(A, 'a').props.visible).toBe(true);
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    await keyboardWillShow();
    for (const key of [A, B]) expect(bottomOf(card(key))).toBeLessThanOrEqual(foldInArea - PANE_FOLD_CLEARANCE);
    await tapPane(B);
    expect(screen.getByLabelText(TOGGLE, HIDDEN_TOO)).toBeTruthy();
  });

  test('the body the chat fills is its card below the title bar', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    const body = chatInPane(A, 'a').parent;
    if (body === null) throw new Error('no pane body');
    expect(num(body, 'top')).toBe(PANE_TITLE_HEIGHT);
  });
});

describe('the keyboard follows the active pane to and from the composer', () => {
  test('terminal to chat with the keyboard up: the composer takes it; chat to terminal: the terminal takes it', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    await tapPane(B);
    await keyboardWillShow();
    const asked = Number(chatInPane(A, 'a').props.focusRequestId ?? 0);
    mockNative.focusTerminal.mockClear();
    await tapPane(A);
    expect(Number(chatInPane(A, 'a').props.focusRequestId)).toBe(asked + 1);
    await tapPane(B);
    expect(mockNative.focusTerminal).toHaveBeenCalledWith(B);
  });

  test('turning the active pane to its chat or back keeps the keyboard down: nothing asks for it', async () => {
    await renderScreen({ chats: [], stored: stacked(sessionSlot(A), sessionSlot(B)) });
    await keyboardWillShow();
    mockNative.focusTerminal.mockClear();
    await press(TerminalHeaderCopy.chatView);
    expect(Number(chatInPane(A, 'a').props.focusRequestId ?? 0)).toBe(0);
    await press(TerminalHeaderCopy.terminalView);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });
});

describe('what the computer and the stack are told', () => {
  test('zmx: the terminals on screen are visible, the chat in its pane is the chat; the lease follows that chat', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    expect(mockMounted).toEqual([null, A, B]);
    expect(mockChatGrid).toBe(A);
    await tapPane(B);
    expect(mockMounted).toEqual([B, A, null]);
    expect(mockChatGrid).toBe(A);
  });

  test('the stack’s swipe back stays offered with a chat in a pane, as with terminal panes', async () => {
    await renderScreen({ stored: stacked(sessionSlot(A), sessionSlot(B)) });
    expect(navigation.setOptions).not.toHaveBeenCalledWith(expect.objectContaining({ gestureEnabled: false }));
  });
});

describe('without pane slots the chat view is as today', () => {
  test.each([
    ['chat-folded', FOLDED],
    ['chat-phone', PHONE],
  ])('%s: one chat, no Panes button, whatever is stored', async (_state, window) => {
    await renderScreen({ window, divisions: [], stored: stacked(sessionSlot(A), sessionSlot(B)) });
    expect(chat('a').props.visible).toBe(true);
    expect(chat('a').props.inPane).toBeFalsy();
    expect(screen.queryAllByTestId(/^pane:/)).toEqual([]);
    expect(screen.queryByLabelText(PanesCopy.addPane)).toBeNull();
  });
});
