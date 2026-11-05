/// <reference types="jest" />
/**
 * Shared by the command pad's screen tests (`TerminalScreen.commandPad*.rntl.tsx`): the boundary mocks, the iPhone 17
 * frames, the screen's render and keyboard helpers, and the frame readers the tests measure the pad with. Import it
 * before anything else in a test file: its module mocks must be declared before the screen's own imports load.
 *
 * Mocked are the boundaries only: the native module, haptics, storage, the safe area (reported on its own,
 * `setSafeArea`), navigation focus, the chat screen, the voice button and the file and photo pickers; the terminal
 * area's layout is delivered by the test (`layOutArea`), and a native-driven animation reports its end value as on the
 * device (`nativeAnimationsReportTheirEnd`). Frames of an iPhone 17: 402x874, home indicator inset 34, keyboard 336 pt
 * tall (top 538); in landscape 874x402, safe area 0/21 and 62 across, keyboard 200 pt tall.
 */

import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { nativeAnimationsReportTheirEnd } from '../components/common/nativeAnimationFixture';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';
import TerminalScreen from './TerminalScreen';

export const mockNative = {
  sendKey: jest.fn((_sessionKey: string, _key: string, _mods?: object) => Promise.resolve()),
  sendText: jest.fn((_sessionKey: string, _text: string) => Promise.resolve()),
  setKeyModifiers: jest.fn((_sessionKey: string, _mods: object) => Promise.resolve()),
  pasteFromClipboard: jest.fn((_sessionKey: string) => Promise.resolve()),
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
};
export const mockPickAndSend = jest.fn((_machineId: string, _sessionKey: string, _sink?: unknown) =>
  Promise.resolve('sent'),
);
export const mockPickImageAndSend = jest.fn((_machineId: string, _sessionKey: string, _sink?: unknown) =>
  Promise.resolve('sent'),
);
export const mockSelectionHaptic = jest.fn(() => Promise.resolve());
export const mockImpactHaptic = jest.fn((_style?: string) => Promise.resolve());

jest.mock('../../modules/ghostex-native/src', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    GhostexNative: {
      addListener: () => ({ remove: () => undefined }),
      setKeepScreenOn: () => Promise.resolve(),
      scrollToBottom: () => Promise.resolve(),
      sendKey: (...args: [string, string, object?]) => mockNative.sendKey(...args),
      sendText: (...args: [string, string]) => mockNative.sendText(...args),
      setKeyModifiers: (...args: [string, object]) => mockNative.setKeyModifiers(...args),
      pasteFromClipboard: (sessionKey: string) => mockNative.pasteFromClipboard(sessionKey),
      focusTerminal: (sessionKey: string) => mockNative.focusTerminal(sessionKey),
      blurTerminal: (sessionKey: string) => mockNative.blurTerminal(sessionKey),
      observeBarLayout: () =>
        Promise.resolve({
          id: 1,
          layout: { windowWidth: 402, windowHeight: 874, safeTop: 59, safeLeft: 0, safeRight: 0, marginTop: 59 },
        }),
      stopObservingBarLayout: () => Promise.resolve(),
    },
    GhostexTerminalView: (props: object) => React.createElement(MockView, { testID: 'terminal-view', ...props }),
  };
});
jest.mock('../components/terminal/uploads', () => ({
  ...jest.requireActual('../components/terminal/uploads'),
  pickAndSendAttachment: (...args: [string, string, unknown?]) => mockPickAndSend(...args),
  pickAndSendImageAttachment: (...args: [string, string, unknown?]) => mockPickImageAndSend(...args),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: (style?: string) => mockImpactHaptic(style),
  notificationAsync: () => Promise.resolve(),
  selectionAsync: () => mockSelectionHaptic(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
/** The safe area of an upright iPhone; a test of another pose replaces it (reset before each test). */
export const PORTRAIT_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
export const mockSafeArea = { ...PORTRAIT_INSETS };
/**
 * The safe area reaches the screen as its own report, as the system's safe-area provider sends it: a change made
 * with `setSafeArea` renders the screen on its own, apart from the window's size. Set before a render, the object is
 * simply read.
 */
const mockSafeAreaListeners = new Set<() => void>();
let mockSafeAreaReports = 0;
function mockSubscribeSafeArea(listener: () => void): () => void {
  mockSafeAreaListeners.add(listener);
  return () => mockSafeAreaListeners.delete(listener);
}
jest.mock('react-native-safe-area-context', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    useSafeAreaInsets: () => {
      useSyncExternalStore(mockSubscribeSafeArea, () => mockSafeAreaReports);
      return mockSafeArea;
    },
  };
});
jest.mock('../chat/native/NativeChatScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
}));

export const WINDOW = { width: 402, height: 874 };
export const KEYBOARD = { top: 538, height: 336 };
export const HIDDEN_TOO = { hidden: true };
export const TOGGLE = 'Command pad';
export const EDITOR = 'Terminal text editor';
/** The nine default keys by name, in their places row by row. */
export const DEFAULT_LABELS = ['Esc', 'Up', 'Ctrl+C', 'Left', 'Enter', 'Right', 'Tab', 'Down', 'Upload'];
/** Accessibility labels of the key bar's own controls (`TerminalKeyBar.tsx`, Android). */
export const KEY_BAR_LABELS = ['Extra keys', 'Open text editor', 'Dismiss keyboard', 'ESC', 'SHIFT', 'NEWLN', 'PGUP'];
export const NO_MODS = { ctrl: false, alt: false, shift: false };

export const navigation = { setOptions: () => undefined, popTo: () => undefined, navigate: jest.fn() };

export const SHELL_TAB: TerminalTab = {
  sessionKey: 'shell-1',
  machineId: 'm1',
  title: 'shell',
  kind: 'shell',
  state: 'open',
};
export const AGENT_TAB: TerminalTab = {
  sessionKey: 'agent-1',
  machineId: 'm1',
  title: 'agent',
  kind: 'attach',
  ghostexSessionId: 's1',
  ghostexProjectId: 'p1',
  ghostexAgentId: 'claude',
  state: 'open',
};

export const keyboard = keyboardFixture({ width: WINDOW.width, height: WINDOW.height });
const initialSettings = useSettingsStore.getState().settings;

/** A size in points: a window or the terminal area. */
export type Area = { width: number; height: number };

/** The terminal area of the simple frames: the window's width, 700 pt between the header and the home indicator. */
export const AREA: Area = { width: WINDOW.width, height: 700 };

/**
 * The window React Native reports to `useWindowDimensions` (a rotation or window change): the app reads the window
 * only through that hook, and this is the fixture that drives it.
 */
export async function setWindow(window: Area): Promise<void> {
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
}

/** The safe area the system reports for the window, as a report of its own (a turn or resize changes it). */
export async function setSafeArea(insets: typeof PORTRAIT_INSETS): Promise<void> {
  await act(() => {
    Object.assign(mockSafeArea, insets);
    mockSafeAreaReports += 1;
    for (const listener of mockSafeAreaListeners) listener();
  });
}

export async function renderScreen(tab: TerminalTab = SHELL_TAB, window: Area = WINDOW): Promise<void> {
  await setWindow(window);
  useTerminalStore.setState({ tabs: [tab], selectedSessionKey: tab.sessionKey });
  await render(
    <TerminalScreen
      navigation={navigation as never}
      route={{ key: 'terminal', name: 'Terminal', params: { sessionKey: tab.sessionKey, machineId: 'm1' } }}
    />,
  );
  await act(async () => undefined);
}

export async function setSettings(patch: Partial<typeof initialSettings>): Promise<void> {
  await act(() => useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, ...patch } }));
}

export async function keyboardWillShow(): Promise<void> {
  await act(() => keyboard.show(KEYBOARD.top, KEYBOARD.height, 250));
}

export async function keyboardWillHide(): Promise<void> {
  await act(() => keyboard.hide(250));
}

export async function openPad(): Promise<void> {
  await fireEvent.press(screen.getByLabelText(TOGGLE));
}

/** A pad key's touch: down, up, and the press that completes it. */
export async function tapKey(label: string): Promise<void> {
  const key = screen.getByLabelText(label);
  await fireEvent(key, 'pressIn');
  await fireEvent(key, 'pressOut');
  await fireEvent.press(key);
}

export function bottomOf(instance: TestInstance): number | undefined {
  return StyleSheet.flatten(instance.props.style)?.bottom;
}

/** The view that holds `instance`; a test that reaches past the root fails here. */
export function parentOf(instance: TestInstance): TestInstance {
  if (instance.parent === null) throw new Error('no parent view');
  return instance.parent;
}

/** A number in a flattened style (or any object) by name; undefined where there is none, so no cast is needed. */
export function numberAt(record: unknown, key: string): number | undefined {
  if (typeof record !== 'object' || record === null) return undefined;
  const value: unknown = Object.getOwnPropertyDescriptor(record, key)?.value;
  return typeof value === 'number' ? value : undefined;
}

/** A number the frames cannot do without: a missing one fails the test by its name. */
export function requiredNumber(record: unknown, key: string): number {
  const value = numberAt(record, key);
  if (value === undefined) throw new Error(`no numeric ${key} in ${JSON.stringify(record)}`);
  return value;
}

export function terminalTop(): number {
  return (StyleSheet.flatten(screen.getByTestId('terminal-view').props.style)?.top ?? 0) + 0;
}

beforeEach(() => {
  jest.useFakeTimers();
  nativeAnimationsReportTheirEnd();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  Object.assign(mockSafeArea, PORTRAIT_INSETS);
  keyboard.setScreen(WINDOW.width, WINDOW.height);
  mockNative.focusTerminal.mockImplementation(() => Promise.resolve(true));
  mockPickAndSend.mockClear();
  mockPickImageAndSend.mockClear();
  mockSelectionHaptic.mockClear();
  mockImpactHaptic.mockClear();
  navigation.navigate.mockClear();
  useSettingsStore.setState({ settings: { ...initialSettings, commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS] } });
  useTerminalStore.setState({ sessionViewModeBySessionKey: {} });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** The ring's buttons; the keyboard button's name follows the keyboard. */
export const RING: (string | RegExp)[] = ['Keys', 'Agent hotkeys', 'Text editor', /^(Show|Hide) keyboard$/];

export type Frame = { left: number; top: number; right: number; bottom: number };

/** The press event of an accessibility activation: no touches (Pressability's non-pointer click). */
export const ACCESSIBILITY_ACTIVATION = { nativeEvent: { target: 1 } };

/** Lays out the terminal area: `area` big, its top `y` below the screen's top (0: as the older tests have it). */
export async function layOutArea(area: Area = AREA, y = 0): Promise<void> {
  await fireEvent(parentOf(screen.getByTestId('terminal-view')), 'layout', {
    nativeEvent: { layout: { x: 0, y, ...area } },
  });
}

/** The translation of everything that carries `instance` (the pad's drag and snap; 0 when nothing moves it). */
export function translationOf(instance: TestInstance): { x: number; y: number } {
  let node: TestInstance | null = instance;
  const offset = { x: 0, y: 0 };
  while (node !== null) {
    const transform: unknown = StyleSheet.flatten(node.props.style)?.transform;
    if (Array.isArray(transform)) {
      for (const entry of transform) {
        offset.x += numberAt(entry, 'translateX') ?? 0;
        offset.y += numberAt(entry, 'translateY') ?? 0;
      }
    }
    node = node.parent;
  }
  return offset;
}

/**
 * Where a pad control is drawn in the terminal area `area` (origin top left), from its own frame and what moves it.
 * A control on the left edge is placed from that edge, one on the right edge from the right.
 */
export function frameOf(label: string | RegExp, area: Area = AREA): Frame {
  const element = screen.getByLabelText(label);
  const style = StyleSheet.flatten(element.props.style);
  const width = requiredNumber(style, 'width');
  const height = requiredNumber(style, 'height');
  const offset = translationOf(element);
  const left = (numberAt(style, 'left') ?? area.width - requiredNumber(style, 'right') - width) + offset.x;
  const bottom = area.height - requiredNumber(style, 'bottom') + offset.y;
  return { left, top: bottom - height, right: left + width, bottom };
}

/** The open pad's extent: toggle and ring (the 3x3 field lies inside it). */
export function padFrame(area: Area = AREA): Frame {
  const frames = [TOGGLE, ...RING].map((label) => frameOf(label, area));
  return {
    left: Math.min(...frames.map((frame) => frame.left)),
    top: Math.min(...frames.map((frame) => frame.top)),
    right: Math.max(...frames.map((frame) => frame.right)),
    bottom: Math.max(...frames.map((frame) => frame.bottom)),
  };
}

/** An iPhone 17 turned to landscape: its window, safe area, and the terminal area below the 44 pt header. */
export const LANDSCAPE = { width: 874, height: 402 };
export const LANDSCAPE_INSETS = { top: 0, bottom: 21, left: 62, right: 62 };
export const LANDSCAPE_HEADER = 44;
export const LANDSCAPE_AREA: Area = {
  width: 874,
  height: LANDSCAPE.height - LANDSCAPE_HEADER - LANDSCAPE_INSETS.bottom,
};
/** Its keyboard: 200 pt tall, so 179 pt of the terminal area are covered; the open pad would need 515 pt. */
export const LANDSCAPE_KEYBOARD = { top: 202, height: 200 };

/** A layer's own close button, there only while the layer stands in for the open pad. */
export const CLOSE_LAYER = 'Close';

/**
 * A pose of the device: its window and safe area, the terminal area in it, the keyboard's height there, and whether
 * the open pad has room above the keyboard there, with or without the text editor on it, reaching over the header if
 * it must (it needs 336 pt above a cover).
 */
export type Pose = {
  name: string;
  window: Area;
  insets: typeof PORTRAIT_INSETS;
  area: Area & { x: number; y: number };
  keyboard: number;
  roomAboveKeyboard: boolean;
};

/** The header above the terminal area on an iPhone. */
const IPHONE_HEADER = 44;
export const IPHONE_UPRIGHT: Pose = {
  name: 'iPhone upright',
  window: WINDOW,
  insets: PORTRAIT_INSETS,
  area: {
    x: 0,
    y: PORTRAIT_INSETS.top + IPHONE_HEADER,
    width: WINDOW.width,
    height: WINDOW.height - PORTRAIT_INSETS.top - IPHONE_HEADER - PORTRAIT_INSETS.bottom,
  },
  keyboard: KEYBOARD.height,
  roomAboveKeyboard: true,
};
export const IPHONE_TURNED: Pose = {
  name: 'iPhone in landscape',
  window: LANDSCAPE,
  insets: LANDSCAPE_INSETS,
  area: { x: 0, y: LANDSCAPE_INSETS.top + IPHONE_HEADER, ...LANDSCAPE_AREA },
  keyboard: LANDSCAPE_KEYBOARD.height,
  roomAboveKeyboard: false,
};
/**
 * The iPhone Duo unfolded in landscape, its side bar on the right: the terminal area 52 pt below the safe area's top,
 * a keyboard that covers 221 pt of it (277 pt with the text editor on it).
 */
export const DUO_UNFOLDED: Pose = {
  name: 'iPhone Duo unfolded in landscape',
  window: { width: 951, height: 669 },
  insets: { top: 10, bottom: 20, left: 0, right: 81 },
  area: { x: 0, y: 62, width: 870, height: 587 },
  keyboard: 241,
  roomAboveKeyboard: true,
};
/** The same screen turned upright. Not measured: the window and safe area of its bar layout, a 320 pt keyboard. */
export const DUO_UNFOLDED_UPRIGHT: Pose = {
  name: 'iPhone Duo unfolded upright',
  window: { width: 669, height: 951 },
  insets: { top: 80, bottom: 20, left: 0, right: 0 },
  area: { x: 0, y: 132, width: 669, height: 799 },
  keyboard: 320,
  roomAboveKeyboard: true,
};
/** The Duo folded, its outer screen upright with the side bar on the right; a keyboard covering 245 pt of the area. */
export const DUO_FOLDED: Pose = {
  name: 'iPhone Duo folded',
  window: { width: 466, height: 678 },
  insets: { top: 0, bottom: 20, left: 0, right: 84 },
  area: { x: 0, y: 52, width: 382, height: 606 },
  keyboard: 265,
  roomAboveKeyboard: true,
};

type LayerShown = 'none' | 'Keys' | 'Agent';
/** `standing in`: the pad is open but drawn closed, its layer showing its own close button. */
type PadShown = 'closed' | 'open' | 'standing in';
export type Shown = { keyboard: boolean; editor: boolean; layer: LayerShown; pad: PadShown };
export type Action = 'keyboard away' | 'toggle' | 'pen' | 'Keys' | 'Agent';

/** The pose the screen is in and whether the system shows the keyboard: the test's own record, not the app's. */
let simulatedPose: Pose = IPHONE_UPRIGHT;
let keyboardUp = false;

/** The pose the test last put the device in. */
export function poseNow(): Pose {
  return simulatedPose;
}

/** Whether the simulated system shows the keyboard. */
export function keyboardShownNow(): boolean {
  return keyboardUp;
}

/** The system shows the keyboard as it is in `pose`, or gives it that frame while it is up. */
async function reportKeyboardIn(pose: Pose): Promise<void> {
  const { window, keyboard: height } = pose;
  const top = window.height - height;
  if (keyboardUp) {
    await act(() => keyboard.changeFrame(top, height, 250));
  } else {
    await act(() => keyboard.show(top, height, 250));
  }
  keyboardUp = true;
}

export async function keyboardComesUp(): Promise<void> {
  await reportKeyboardIn(simulatedPose);
}

async function keyboardGoesDown(): Promise<void> {
  await act(() => keyboard.hide(250));
  keyboardUp = false;
}

export async function renderPose(pose: Pose): Promise<void> {
  simulatedPose = pose;
  keyboardUp = false;
  Object.assign(mockSafeArea, pose.insets);
  keyboard.setScreen(pose.window.width, pose.window.height);
  useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
  await renderScreen(AGENT_TAB, pose.window);
  await layOutArea(pose.area, pose.area.y);
}

/**
 * The four reports a turn, fold or resize arrives as, each on its own and in any order: the window's new size, its
 * safe area, the keyboard's new frame (only while the keyboard is up) and the terminal area's new layout.
 */
export type PoseReport = 'window' | 'safe area' | 'keyboard frame' | 'terminal layout';
export const WINDOW_FIRST: readonly PoseReport[] = ['window', 'safe area', 'terminal layout', 'keyboard frame'];
export const FRAME_FIRST: readonly PoseReport[] = ['keyboard frame', 'window', 'safe area', 'terminal layout'];

/** Every order `reports` can arrive in. */
export function everyOrder(reports: readonly PoseReport[]): PoseReport[][] {
  if (reports.length <= 1) return [[...reports]];
  return reports.flatMap((first, index) =>
    everyOrder([...reports.slice(0, index), ...reports.slice(index + 1)]).map((rest) => [first, ...rest]),
  );
}

/** One report of the device's change to `next`; the keyboard's report shows it, or gives it its frame while up. */
export async function reportPose(next: Pose, report: PoseReport): Promise<void> {
  if (report === 'window') {
    await setWindow(next.window);
  } else if (report === 'safe area') {
    await setSafeArea(next.insets);
  } else if (report === 'terminal layout') {
    await layOutArea(next.area, next.area.y);
  } else {
    keyboard.setScreen(next.window.width, next.window.height);
    await reportKeyboardIn(next);
  }
}

/** Turns, folds or resizes the device to `next`, its reports arriving in `order`; the keyboard reports while up. */
export async function changePose(next: Pose, order: readonly PoseReport[]): Promise<void> {
  keyboard.setScreen(next.window.width, next.window.height);
  for (const report of order) {
    if (report !== 'keyboard frame' || keyboardUp) await reportPose(next, report);
  }
  simulatedPose = next;
}

function editorShownNow(): boolean {
  return screen.queryByLabelText(EDITOR) !== null;
}

/** The shown layer's panel (the view that reports its height), or null. */
export function layerPanel(): TestInstance | null {
  const title = screen.queryByText('More keys') ?? screen.queryByText('Claude Code');
  let panel: TestInstance | null = title;
  while (panel !== null && panel.props.onLayout === undefined) panel = panel.parent;
  return panel;
}

function lastCallAfter(mock: { mock: { invocationCallOrder: number[] } }, after: number): number {
  return Math.max(0, ...mock.mock.invocationCallOrder.filter((order) => order > after));
}

function lastNativeCall(): number {
  return Math.max(lastCallAfter(mockNative.focusTerminal, 0), lastCallAfter(mockNative.blurTerminal, 0));
}

/**
 * One step of the user or the system, and what the system does with the app's requests in it: a terminal focus, or
 * the text editor appearing (it takes the focus), brings the keyboard up; a blur takes it down. Then the motions and
 * the layer's wait for the keyboard run out, and a layer without the keyboard's height in this window is laid out as
 * tall as the keyboard here.
 */
export async function matrixStep(action: () => Promise<void>): Promise<void> {
  let since = lastNativeCall();
  let editorBefore = editorShownNow();
  await action();
  for (let round = 0; round < 3; round += 1) {
    await act(async () => undefined);
    const focus = lastCallAfter(mockNative.focusTerminal, since);
    const blur = lastCallAfter(mockNative.blurTerminal, since);
    const editorNow = editorShownNow();
    let wanted = keyboardUp;
    if (focus > blur) wanted = true;
    if (blur > focus) wanted = false;
    if (editorNow && !editorBefore) wanted = true;
    since = lastNativeCall();
    editorBefore = editorNow;
    if (wanted === keyboardUp) break;
    if (wanted) await keyboardComesUp();
    else await keyboardGoesDown();
  }
  await act(() => jest.advanceTimersByTime(2000));
  await act(async () => undefined);
  const panel = layerPanel();
  if (panel !== null && numberAt(StyleSheet.flatten(panel.props.style), 'height') === undefined) {
    await fireEvent(panel, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: simulatedPose.window.width, height: simulatedPose.keyboard } },
    });
  }
}

export async function press(label: string | RegExp): Promise<void> {
  await fireEvent.press(screen.getByLabelText(label));
}

export const ACTIONS: Record<Action, () => Promise<void>> = {
  // The keyboard goes away by the system (the user lowered it), not by the pad.
  'keyboard away': keyboardGoesDown,
  toggle: () => press(TOGGLE),
  pen: () => press('Text editor'),
  Keys: () => press('Keys'),
  Agent: () => press('Agent hotkeys'),
};

export function shownNow(): Shown {
  const layer: LayerShown =
    screen.queryByText('More keys') !== null ? 'Keys' : screen.queryByText('Claude Code') !== null ? 'Agent' : 'none';
  const expanded = screen.getByLabelText(TOGGLE).props.accessibilityState?.expanded === true;
  const pad: PadShown = screen.queryByLabelText(CLOSE_LAYER) !== null ? 'standing in' : expanded ? 'open' : 'closed';
  return { keyboard: keyboardUp, editor: editorShownNow(), layer, pad };
}

export type KeyboardAndPad = Pick<Shown, 'keyboard' | 'layer' | 'pad'>;

export function keyboardAndPadNow(): KeyboardAndPad {
  const { keyboard, layer, pad } = shownNow();
  return { keyboard, layer, pad };
}
