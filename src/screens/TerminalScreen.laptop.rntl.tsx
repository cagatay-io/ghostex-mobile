/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The terminal screen in the iPhone Duo's laptop pose, rendered under the real
 * `VerticalBarArea` with the system's bar layout coming from a stand-in for the native module, so the fold reaches
 * the screen the way it does on the device (`BarLayout.divisions` → `laptopFoldOf` → `useLaptopFold`).
 * Covered: with the keyboard or a layer up the output ends at the fold (the cover from the fold's top down and the
 * slide, also with the cursor near the top); the Befehlspad in the upper half above the fold at its default place,
 * at a stored and at a dragged place, unmoved by the keyboard and by the Keys and Agent layers, which open below the
 * fold in the keyboard's place; no key row; the text editor above the fold, and the pad giving way to it where the
 * upper half is too short for both (Send or the toggle bring the pad back); an upper half too short for the open pad
 * even reaching over the header: the open pad reaching below the fold by what is missing, the keyboard staying up, a
 * layer clear of it and a layer reaching into its room; the same keys and functions flat; the round buttons with the
 * pad switched off; and the negative cases flat and in the book pose.
 *
 * The device's window frames are asked of the styles the screen sets (the cover's height from the terminal area's
 * bottom, the terminal's `top`, the pad room's frame and each control's place in it), which give window frames only
 * under the assumption the screen itself makes: the screen's root starts at the window's top. Mocked are the
 * boundaries only: the native module, haptics, storage, the safe area, navigation focus, the chat screen, the voice
 * button and the file picker. Frames of the iPhone Duo's inner display in the laptop pose, as the simulator reports
 * them: window 669 x 951, division `[0, 455.5, 669, 40]`, safe area top 80, home indicator inset 20; the terminal area
 * from y 82 (the header stands in the status band) and the keyboard's top at 555 are assumed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { TEXT_EDITOR_HEIGHT } from '../components/terminal/TerminalTextEditor';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';
import TerminalScreen from './TerminalScreen';

const mockNative = {
  sendKey: jest.fn((_sessionKey: string, _key: string, _mods?: object) => Promise.resolve()),
  sendText: jest.fn((_sessionKey: string, _text: string) => Promise.resolve()),
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
};
let mockBarLayout: BarLayout | null = null;
let mockReport: ((layout: BarLayout) => void) | null = null;

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
      sendKey: (...args: [string, string, object?]) => mockNative.sendKey(...args),
      sendText: (...args: [string, string]) => mockNative.sendText(...args),
      setKeyModifiers: () => Promise.resolve(),
      pasteFromClipboard: () => Promise.resolve(),
      focusTerminal: (sessionKey: string) => mockNative.focusTerminal(sessionKey),
      blurTerminal: (sessionKey: string) => mockNative.blurTerminal(sessionKey),
    },
    GhostexTerminalView: (props: object) => React.createElement(MockView, { testID: 'terminal-view', ...props }),
  };
});
jest.mock('../components/terminal/uploads', () => ({
  ...jest.requireActual('../components/terminal/uploads'),
  pickAndSendAttachment: () => Promise.resolve('sent'),
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
}));

type Window = { width: number; height: number };
type Frame = { left: number; top: number; right: number; bottom: number };

const PORTRAIT: Window = { width: 669, height: 951 };
const LANDSCAPE: Window = { width: 951, height: 669 };
const HOME = 20;
const AREA_TOP = 82;
const AREA_BOTTOM = PORTRAIT.height - HOME;
const LAPTOP_DIVISION: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FLAT_DIVISION: FoldDivision = { ...LAPTOP_DIVISION, active: false };
const BOOK_DIVISION: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
/**
 * A fold placed lower, so the upper half has room for the open pad above the text editor (it needs 404 pt there: the
 * editor 12 pt above the fold, the pad 12 pt above the editor, 308 pt tall, 16 pt below the area's top).
 */
const LOW_DIVISION: FoldDivision = { ...LAPTOP_DIVISION, y: 520 };
/** The safe area's top, as the stand-in for the safe-area insets reports it. */
const SAFE_TOP = 80;
/** The open pad from its toggle's bottom edge to its highest ring button; with its 16 pt margins it needs 340 pt. */
const OPEN_PAD_HEIGHT = 308;
const OPEN_PAD_NEEDS = 340;
/**
 * Folds placed higher, so the upper half is too short for the open pad even reaching over the header (2 pt there,
 * the area's top less the safe area's top): 40 pt short at y 380, 120 pt short at y 300. At y 420 it fits exactly.
 */
const SHORT_DIVISION: FoldDivision = { ...LAPTOP_DIVISION, y: 380 };
const SHORTER_DIVISION: FoldDivision = { ...LAPTOP_DIVISION, y: 300 };
const SNUG_DIVISION: FoldDivision = { ...LAPTOP_DIVISION, y: 420 };
const KEYBOARD_TOP = 555;
const HIDDEN_TOO = { hidden: true };
const TOGGLE = 'Command pad';
const EDITOR = 'Terminal text editor';
const SEND = 'Send Enter to terminal';
/** The nine default keys by name, in their places row by row. */
const KEY_LABELS = ['Esc', 'Up', 'Ctrl+C', 'Left', 'Enter', 'Right', 'Tab', 'Down', 'Upload'];
const RING: (string | RegExp)[] = ['Keys', 'Agent hotkeys', 'Text editor', /^(Show|Hide) keyboard$/];

const navigation = { setOptions: () => undefined, popTo: () => undefined, navigate: jest.fn() };
const SHELL_TAB: TerminalTab = { sessionKey: 'shell-1', machineId: 'm1', title: 'shell', kind: 'shell', state: 'open' };
const keyboard = keyboardFixture(PORTRAIT);
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

async function renderScreen(
  window: Window = PORTRAIT,
  divisions: FoldDivision[] = [LAPTOP_DIVISION],
  tab: TerminalTab = SHELL_TAB,
): Promise<void> {
  mockBarLayout = barLayout(window, divisions);
  await act(() => {
    keyboard.setScreen(window.width, window.height);
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  useTerminalStore.setState({ tabs: [tab], selectedSessionKey: tab.sessionKey });
  await render(
    <VerticalBarArea>
      <TerminalScreen
        navigation={navigation as never}
        route={{ key: 'terminal', name: 'Terminal', params: { sessionKey: tab.sessionKey, machineId: 'm1' } }}
      />
    </VerticalBarArea>,
  );
  await act(async () => undefined);
  // The terminal area's frame, as its layout reports it (the slide and the pad's room need a laid-out area).
  await fireEvent(screen.getByTestId('terminal-view').parent as TestInstance, 'layout', {
    nativeEvent: { layout: { x: 0, y: AREA_TOP, width: window.width, height: window.height - HOME - AREA_TOP } },
  });
}

/** The system reports a new bar layout: the device folded or unfolded. */
async function reportDivisions(divisions: FoldDivision[]): Promise<void> {
  await act(async () => {
    mockReport?.(barLayout(PORTRAIT, divisions));
  });
}

async function keyboardWillShow(top = KEYBOARD_TOP): Promise<void> {
  await act(() => keyboard.show(top, PORTRAIT.height - top, 250));
}

async function keyboardWillHide(): Promise<void> {
  await act(() => keyboard.hide(250));
}

async function press(label: string | RegExp): Promise<void> {
  await fireEvent.press(screen.getByLabelText(label));
}

/** Lets the editor's hand-over of the keyboard to the terminal answer, and the motions run out. */
async function settle(): Promise<void> {
  await act(async () => undefined);
  await act(() => jest.advanceTimersByTime(2000));
  await act(async () => undefined);
}

function style(instance: TestInstance): Record<string, unknown> {
  return StyleSheet.flatten(instance.props.style) ?? {};
}

function num(instance: TestInstance, key: string): number | undefined {
  const value = style(instance)[key];
  return typeof value === 'number' ? value : undefined;
}

function required(instance: TestInstance, key: string): number {
  const value = num(instance, key);
  if (value === undefined) throw new Error(`no numeric ${key} in ${JSON.stringify(style(instance))}`);
  return value;
}

/** The translation of everything that carries `instance` (the pad's drag and snap). */
function translationOf(instance: TestInstance): { x: number; y: number } {
  const offset = { x: 0, y: 0 };
  for (let node: TestInstance | null = instance; node !== null; node = node.parent) {
    const transform = style(node).transform;
    if (!Array.isArray(transform)) continue;
    for (const entry of transform) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { translateX, translateY } = entry as Record<string, unknown>;
      if (typeof translateX === 'number') offset.x += translateX;
      if (typeof translateY === 'number') offset.y += translateY;
    }
  }
  return offset;
}

/** The pad's room in the window: the nearest view around `instance` with its own top and height. */
function roomOf(instance: TestInstance): Frame {
  for (let node = instance.parent; node !== null; node = node.parent) {
    const top = num(node, 'top');
    const height = num(node, 'height');
    if (top === undefined || height === undefined) continue;
    const left = required(node, 'left');
    return { left, top, right: left + required(node, 'width'), bottom: top + height };
  }
  throw new Error('no pad room');
}

/** Where a pad control is drawn in the window. */
function windowFrameOf(label: string | RegExp): Frame {
  const element = screen.getByLabelText(label);
  const room = roomOf(element);
  const width = required(element, 'width');
  const height = required(element, 'height');
  const offset = translationOf(element);
  const left = room.left + (num(element, 'left') ?? room.right - room.left - required(element, 'right') - width);
  const bottom = room.bottom - required(element, 'bottom') + offset.y;
  return { left: left + offset.x, top: bottom - height, right: left + offset.x + width, bottom };
}

/** The open pad's extent in the window: toggle and ring (the 3x3 field lies inside it). */
function padFrame(): Frame {
  const frames = [TOGGLE, ...RING].map(windowFrameOf);
  return {
    left: Math.min(...frames.map((frame) => frame.left)),
    top: Math.min(...frames.map((frame) => frame.top)),
    right: Math.max(...frames.map((frame) => frame.right)),
    bottom: Math.max(...frames.map((frame) => frame.bottom)),
  };
}

function padOpen(): boolean {
  return screen.getByLabelText(TOGGLE).props.accessibilityState?.expanded === true;
}

function terminalTop(): number {
  // `top: -0` while nothing is covered; +0 reads it as 0.
  return (num(screen.getByTestId('terminal-view'), 'top') ?? 0) + 0;
}

function coverHeight(): number | null {
  const cover = screen.queryByTestId('laptop-cover');
  return cover === null ? null : required(cover, 'height');
}

/** The view at or around `element` with a `bottom` of its own (the editor's dock, a layer's dock, the button stack). */
function bottomCarrier(element: TestInstance): TestInstance {
  for (let node: TestInstance | null = element; node !== null; node = node.parent) {
    if (num(node, 'bottom') !== undefined) return node;
  }
  throw new Error('nothing places it');
}

/** The shown layer's panel (the view that reports its height), found from a text in it. */
function layerPanel(text = 'More keys'): TestInstance {
  let panel: TestInstance | null = screen.getByText(text);
  while (panel !== null && panel.props.onLayout === undefined) panel = panel.parent;
  if (panel === null) throw new Error('no layer panel');
  return panel;
}

/** The upper half: from the terminal area's top to the fold's top. */
function expectInUpperHalf(frame: Frame, fold = FOLD): void {
  expect(frame.top).toBeGreaterThanOrEqual(AREA_TOP);
  expect(frame.bottom).toBeLessThanOrEqual(fold.top);
  expect(frame.left).toBeGreaterThanOrEqual(0);
  expect(frame.right).toBeLessThanOrEqual(PORTRAIT.width);
}

/** A finger at a point, as React Native's responder and touch events carry it. */
function touch(pageX: number, pageY: number, down = true) {
  const point = { pageX, pageY, locationX: 0, locationY: 0, identifier: 0, target: 1 };
  return {
    persist: () => undefined,
    nativeEvent: { pageX, pageY, identifier: 0, touches: down ? [point] : [], changedTouches: [point] },
  };
}

/** Holds the toggle for 0.3 s, drags it by (dx, dy), lets go and lets the snap finish. */
async function dragPad(dx: number, dy: number): Promise<void> {
  const frame = windowFrameOf(TOGGLE);
  const start = { x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 };
  const measure = (callback: (...values: number[]) => void) =>
    callback(0, 0, frame.right - frame.left, frame.bottom - frame.top, frame.left, frame.top);
  const toggle = screen.getByLabelText(TOGGLE);
  await fireEvent(toggle, 'responderGrant', { ...touch(start.x, start.y), currentTarget: { measure } });
  await act(() => jest.advanceTimersByTime(300));
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderMove', touch(start.x + dx, start.y + dy));
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderRelease', touch(start.x + dx, start.y + dy, false));
  await fireEvent(screen.getByLabelText(TOGGLE), 'touchEnd', touch(start.x + dx, start.y + dy, false));
  await act(() => jest.advanceTimersByTime(2000));
}

beforeEach(async () => {
  jest.useFakeTimers();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  mockNative.focusTerminal.mockImplementation(() => Promise.resolve(true));
  mockReport = null;
  useSettingsStore.setState({
    settings: {
      ...initialSettings,
      extraKeysToolbarVisible: true,
      commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS],
      commandPadPosition: {},
    },
  });
  useTerminalStore.setState({ sessionViewModeBySessionKey: {} });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  await AsyncStorage.clear();
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('with the keyboard up the output ends at the fold', () => {
  test('the terminal keeps its size and slides by everything below the fold; that part is covered', async () => {
    await renderScreen();
    expect(coverHeight()).toBeNull();
    await keyboardWillShow();
    const covered = AREA_BOTTOM - FOLD.top;
    expect(coverHeight()).toBe(covered);
    // No cursor reported: the bottom row stands at the fold's top, so the view's bottom edge is the fold's top.
    expect(terminalTop()).toBe(-covered);
    expect(AREA_BOTTOM + terminalTop()).toBe(FOLD.top);
  });

  test('cursor near the top (the cursor row wins): the view slides less and what it has below the fold is covered', async () => {
    await renderScreen();
    await fireEvent(screen.getByTestId('terminal-view'), 'caretChange', { nativeEvent: { top: 100 } });
    await keyboardWillShow();
    // The cursor row stands at the area's top edge, above the fold.
    expect(terminalTop()).toBe(-100);
    expect(AREA_TOP + terminalTop() + 100).toBeLessThan(FOLD.top);
    // Everything of the view below the fold's top is covered.
    expect(AREA_BOTTOM - (coverHeight() ?? 0)).toBe(FOLD.top);
  });

  test('without the keyboard and a layer: no cover, the terminal does not move', async () => {
    await renderScreen();
    await keyboardWillShow();
    await keyboardWillHide();
    expect(coverHeight()).toBeNull();
    expect(terminalTop()).toBe(0);
  });

  test('Reconnect of a closed session stands above the fold', async () => {
    await renderScreen(PORTRAIT, [LAPTOP_DIVISION], { ...SHELL_TAB, state: 'closed' });
    let overlay: TestInstance | null = screen.getByText('Reconnect');
    while (overlay !== null && num(overlay, 'paddingBottom') === undefined) overlay = overlay.parent;
    expect(overlay === null ? undefined : num(overlay, 'paddingBottom')).toBe(AREA_BOTTOM - FOLD.top);
  });
});

describe('the pad stands in the upper half above the fold', () => {
  test('its default place: bottom right, 16 pt above the fold, inside the upper half; no key row', async () => {
    await renderScreen();
    await press(TOGGLE);
    const frame = padFrame();
    expect(frame.right).toBe(PORTRAIT.width - 16);
    expect(frame.bottom).toBe(FOLD.top - 16);
    expectInUpperHalf(frame);
    // The nine keys in the 3x3 field and the ring, nothing else.
    for (const label of KEY_LABELS) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.queryByLabelText('More pad functions', HIDDEN_TOO)).toBeNull();
    expect(
      screen.queryAllByLabelText(TOGGLE).filter((element) => element.props.accessibilityRole === 'toolbar'),
    ).toEqual([]);
  });

  test('the keyboard coming up and going down does not move it', async () => {
    await renderScreen();
    await press(TOGGLE);
    const before = padFrame();
    await keyboardWillShow();
    expect(padOpen()).toBe(true);
    expect(padFrame()).toEqual(before);
    await keyboardWillHide();
    expect(padFrame()).toEqual(before);
  });

  test('a stored laptop place is used and stays inside the upper half; the flat place is not', async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        commandPadPosition: { laptop: { side: 'left', height: 0 }, flat: { side: 'right', height: 1 } },
      },
    });
    await renderScreen();
    await press(TOGGLE);
    await keyboardWillShow();
    const frame = padFrame();
    // Mirrored on the left edge, its toggle 32 pt in from it, at the top of its room: 16 pt below the area's top.
    expect(windowFrameOf(TOGGLE).left).toBe(32);
    expect(frame.left).toBe(32);
    expect(frame.top).toBe(AREA_TOP + 16);
    expectInUpperHalf(frame);
  });

  test('a drag snaps to a side edge with its height clamped to the upper half, stored as the laptop place', async () => {
    await renderScreen();
    await press(TOGGLE);
    await keyboardWillShow();
    // Down and left, far past the fold: it stays above the fold.
    await dragPad(-400, 300);
    const frame = padFrame();
    expect(frame.left).toBe(32);
    expect(frame.bottom).toBe(FOLD.top - 16);
    expectInUpperHalf(frame);
    expect(useSettingsStore.getState().settings.commandPadPosition.laptop).toEqual({ side: 'left', height: 1 });
    expect(useSettingsStore.getState().settings.commandPadPosition.flat).toBeUndefined();
    // Up past the area's top: 16 pt below it.
    await dragPad(0, -400);
    expect(padFrame().top).toBe(AREA_TOP + 16);
    expect(useSettingsStore.getState().settings.commandPadPosition.laptop).toEqual({ side: 'left', height: 0 });
  });

  test('Keys: the keyboard goes down, the layer lies below the fold in its place, the pad does not move', async () => {
    await renderScreen();
    await press(TOGGLE);
    await keyboardWillShow();
    const before = padFrame();
    await press('Keys');
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillHide();
    expect(screen.getByText('More keys')).toBeTruthy();
    // The keyboard was reported 396 pt tall: the layer has that height, from the window's bottom edge.
    const panel = layerPanel();
    const height = required(panel, 'height');
    expect(height).toBe(PORTRAIT.height - KEYBOARD_TOP);
    expect(num(bottomCarrier(panel), 'bottom')).toBe(0);
    expect(PORTRAIT.height - height).toBeGreaterThanOrEqual(FOLD.bottom);
    // Cross and ring stay where they stood, open; the output still ends at the fold.
    expect(padOpen()).toBe(true);
    expect(padFrame()).toEqual(before);
    expect(coverHeight()).toBe(AREA_BOTTOM - FOLD.top);
    expect(screen.queryByLabelText('Close', HIDDEN_TOO)).toBeNull();
  });

  test('Agent: the keyboard goes down, the layer lies below the fold in its place, the pad does not move; a hotkey sends its steps 120 ms apart', async () => {
    const agentTab: TerminalTab = {
      ...SHELL_TAB,
      sessionKey: 'agent-1',
      kind: 'attach',
      ghostexSessionId: 's1',
      ghostexProjectId: 'p1',
      ghostexAgentId: 'claude',
    };
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
    await renderScreen(PORTRAIT, [LAPTOP_DIVISION], agentTab);
    await press(TOGGLE);
    await keyboardWillShow();
    const before = padFrame();
    await press('Agent hotkeys');
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('agent-1');
    await keyboardWillHide();
    // The keyboard was reported 396 pt tall: the layer has that height, from the window's bottom edge.
    const panel = layerPanel('Claude Code');
    const height = required(panel, 'height');
    expect(height).toBe(PORTRAIT.height - KEYBOARD_TOP);
    expect(num(bottomCarrier(panel), 'bottom')).toBe(0);
    expect(PORTRAIT.height - height).toBeGreaterThanOrEqual(FOLD.bottom);
    // Cross and ring stay where they stood, open; the output still ends at the fold.
    expect(padOpen()).toBe(true);
    expect(padFrame()).toEqual(before);
    expect(coverHeight()).toBe(AREA_BOTTOM - FOLD.top);
    // Claude Code's exit: Ctrl+C, and 120 ms later Ctrl+C again.
    mockNative.sendKey.mockClear();
    await press('Ctrl+C then Ctrl+C · EXIT');
    expect(mockNative.sendKey).toHaveBeenCalledTimes(1);
    expect(mockNative.sendKey).toHaveBeenLastCalledWith('agent-1', 'c', { ctrl: true });
    await act(() => jest.advanceTimersByTime(119));
    expect(mockNative.sendKey).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTime(1));
    expect(mockNative.sendKey).toHaveBeenCalledTimes(2);
    expect(mockNative.sendKey).toHaveBeenLastCalledWith('agent-1', 'c', { ctrl: true });
    expect(padFrame()).toEqual(before);
  });

  test('a keyboard reported from the fold top: the layer stops 8 pt below the fold', async () => {
    await renderScreen();
    await press(TOGGLE);
    await keyboardWillShow(FOLD.top);
    const before = padFrame();
    await press('Keys');
    await keyboardWillHide();
    expect(PORTRAIT.height - required(layerPanel(), 'height')).toBe(FOLD.bottom + 8);
    expect(padFrame()).toEqual(before);
  });

  test('the same nine keys and four functions as flat', async () => {
    const reachable = (): string[] =>
      [...KEY_LABELS, 'Keys', 'Agent hotkeys', 'Text editor', 'Show keyboard', 'Hide keyboard'].filter(
        (label) => screen.queryByLabelText(label) !== null,
      );
    await renderScreen();
    await keyboardWillShow();
    await press(TOGGLE);
    const laptop = reachable();
    await screen.unmount();
    await act(() => keyboard.hide(0));
    await renderScreen(PORTRAIT, [FLAT_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    expect(reachable()).toEqual(laptop);
    expect(laptop).toEqual([...KEY_LABELS, 'Keys', 'Agent hotkeys', 'Text editor', 'Hide keyboard']);
  });

  test('folding from flat to the laptop pose moves the open pad from above the keyboard into the upper half', async () => {
    await renderScreen(PORTRAIT, [FLAT_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    // Flat: 12 pt above the keyboard.
    expect(padFrame().bottom).toBe(KEYBOARD_TOP - 12);
    await reportDivisions([LAPTOP_DIVISION]);
    await act(() => jest.advanceTimersByTime(300));
    expect(padOpen()).toBe(true);
    expect(padFrame().bottom).toBe(FOLD.top - 16);
    await reportDivisions([FLAT_DIVISION]);
    await act(() => jest.advanceTimersByTime(300));
    expect(padOpen()).toBe(true);
    expect(padFrame().bottom).toBe(KEYBOARD_TOP - 12);
  });
});

describe('the text editor above the fold, and the pad giving way to it where the upper half is too short', () => {
  /** Opens the pad, brings the keyboard and opens the editor from the ring. */
  async function openEditor(): Promise<void> {
    await press(TOGGLE);
    await keyboardWillShow();
    await press('Text editor');
    await settle();
  }

  test('the editor stands 12 pt above the fold and the terminal ends at its top', async () => {
    await renderScreen();
    await openEditor();
    expect(PORTRAIT.height - required(bottomCarrier(screen.getByLabelText(EDITOR)), 'bottom')).toBe(FOLD.top - 12);
    expect(coverHeight()).toBe(AREA_BOTTOM - FOLD.top + 12 + TEXT_EDITOR_HEIGHT);
    expect(AREA_BOTTOM + terminalTop()).toBe(FOLD.top - 12 - TEXT_EDITOR_HEIGHT);
  });

  test('too short: opening the editor closes the pad; its toggle stands 12 pt above the editor', async () => {
    await renderScreen();
    await openEditor();
    expect(screen.getByLabelText(EDITOR)).toBeTruthy();
    expect(padOpen()).toBe(false);
    expect(windowFrameOf(TOGGLE).bottom).toBe(FOLD.top - 12 - TEXT_EDITOR_HEIGHT - 12);
  });

  test('too short: Send sends, closes the editor with the keyboard handed back to the terminal, and opens the pad', async () => {
    await renderScreen();
    await openEditor();
    mockNative.focusTerminal.mockClear();
    await press(SEND);
    expect(mockNative.sendKey).toHaveBeenCalledWith('shell-1', 'enter', {});
    await settle();
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(EDITOR)).toBeNull();
    expect(padOpen()).toBe(true);
    expect(padFrame().bottom).toBe(FOLD.top - 16);
  });

  test('too short: a tap on the toggle opens the pad and closes the editor; the keyboard stays', async () => {
    await renderScreen();
    await openEditor();
    mockNative.focusTerminal.mockClear();
    await press(TOGGLE);
    await settle();
    expect(screen.queryByLabelText(EDITOR)).toBeNull();
    expect(padOpen()).toBe(true);
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hide keyboard')).toBeTruthy();
  });

  test('room enough: the pad stays open 12 pt above the editor, and Send leaves pad and editor as they are', async () => {
    await renderScreen(PORTRAIT, [LOW_DIVISION]);
    await openEditor();
    expect(padOpen()).toBe(true);
    expect(padFrame().bottom).toBe(LOW_DIVISION.y - 12 - TEXT_EDITOR_HEIGHT - 12);
    expectInUpperHalf(padFrame(), { top: LOW_DIVISION.y, bottom: LOW_DIVISION.y + 40 });
    await press(SEND);
    await settle();
    expect(screen.getByLabelText(EDITOR)).toBeTruthy();
    expect(padOpen()).toBe(true);
  });
});

describe('an upper half too short for the open pad even over the header: the open pad reaches below the fold', () => {
  /** What the upper half and the header together lack for the open pad (its margins included). */
  function missing(division: FoldDivision): number {
    return OPEN_PAD_NEEDS - (division.y - SAFE_TOP);
  }

  /**
   * The open pad drawn whole: as high as reaching over the header allows (16 pt below the safe area's top), so it
   * reaches below the fold only by what is missing, less its own bottom margin.
   */
  function expectBelowFold(division: FoldDivision): void {
    const frame = padFrame();
    expect(frame.top).toBe(SAFE_TOP + 16);
    expect(frame.bottom - frame.top).toBe(OPEN_PAD_HEIGHT);
    expect(frame.bottom).toBe(division.y + missing(division) - 16);
    expect(frame.bottom).toBeGreaterThan(division.y);
    // Nothing of it is cut off: the room it is drawn in, which cuts off what lies outside it, holds all of it.
    const room = roomOf(screen.getByLabelText(TOGGLE));
    expect(room.top).toBeLessThanOrEqual(frame.top);
    expect(room.bottom).toBeGreaterThanOrEqual(frame.bottom);
  }

  test('keyboard up: opening the pad leaves the keyboard up and draws the pad whole below the fold; closing it puts the toggle back above the fold', async () => {
    await renderScreen(PORTRAIT, [SHORT_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    expect(padOpen()).toBe(true);
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hide keyboard')).toBeTruthy();
    expectBelowFold(SHORT_DIVISION);
    // Once the room has settled it stays so.
    await act(() => jest.advanceTimersByTime(300));
    expect(padOpen()).toBe(true);
    expectBelowFold(SHORT_DIVISION);
    mockNative.focusTerminal.mockClear();
    await press(TOGGLE);
    expect(padOpen()).toBe(false);
    expect(windowFrameOf(TOGGLE).bottom).toBe(SHORT_DIVISION.y - 16);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('keyboard down: the same; the keyboard coming up afterwards neither closes nor moves the pad', async () => {
    await renderScreen(PORTRAIT, [SHORT_DIVISION]);
    await press(TOGGLE);
    expectBelowFold(SHORT_DIVISION);
    const before = padFrame();
    await keyboardWillShow();
    await act(() => jest.advanceTimersByTime(300));
    expect(padOpen()).toBe(true);
    expect(padFrame()).toEqual(before);
  });

  test('folding into it with the keyboard and the open pad up: the pad stays open and whole below the fold, the keyboard stays', async () => {
    await renderScreen(PORTRAIT, [FLAT_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    await reportDivisions([SHORT_DIVISION]);
    await act(() => jest.advanceTimersByTime(300));
    expect(padOpen()).toBe(true);
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
    expectBelowFold(SHORT_DIVISION);
  });

  test('room enough when reaching over the header: the pad stays above the fold', async () => {
    await renderScreen(PORTRAIT, [SNUG_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    const frame = padFrame();
    expect(frame.top).toBe(SAFE_TOP + 16);
    expect(frame.bottom).toBe(SNUG_DIVISION.y - 16);
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
  });

  test('a Keys layer clear of it: the layer lies below the fold in the keyboard place and the pad stays as it is', async () => {
    await renderScreen(PORTRAIT, [SHORT_DIVISION]);
    await keyboardWillShow();
    await press(TOGGLE);
    const before = padFrame();
    await press('Keys');
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillHide();
    const height = required(layerPanel(), 'height');
    expect(height).toBe(PORTRAIT.height - KEYBOARD_TOP);
    expect(PORTRAIT.height - height).toBeGreaterThanOrEqual(before.bottom + 12);
    expect(padOpen()).toBe(true);
    expect(padFrame()).toEqual(before);
    expect(screen.queryByLabelText('Close', HIDDEN_TOO)).toBeNull();
  });

  test('a Keys layer reaching into its room: the layer takes the place with its own close button, the toggle above the fold; closing the layer shows the pad again, the keyboard staying down', async () => {
    await renderScreen(PORTRAIT, [SHORTER_DIVISION]);
    await press(TOGGLE);
    expectBelowFold(SHORTER_DIVISION);
    await press('Keys');
    // No keyboard seen yet: the layer takes the lower half up to 8 pt below the fold, above the open pad's lower edge.
    expect(PORTRAIT.height - required(layerPanel(), 'height')).toBe(SHORTER_DIVISION.y + 40 + 8);
    expect(padOpen()).toBe(false);
    expect(windowFrameOf(TOGGLE).bottom).toBe(SHORTER_DIVISION.y - 16);
    mockNative.focusTerminal.mockClear();
    await fireEvent.press(screen.getByLabelText('Close', HIDDEN_TOO));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(padOpen()).toBe(true);
    expectBelowFold(SHORTER_DIVISION);
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('the text editor keeps its rule: the pad is closed while it is open; Send brings the pad back below the fold', async () => {
    await renderScreen(PORTRAIT, [SHORT_DIVISION]);
    await press(TOGGLE);
    await keyboardWillShow();
    await press('Text editor');
    await settle();
    expect(padOpen()).toBe(false);
    expect(windowFrameOf(TOGGLE).bottom).toBe(SHORT_DIVISION.y - 12 - TEXT_EDITOR_HEIGHT - 12);
    await press(SEND);
    await settle();
    expect(screen.queryByLabelText(EDITOR)).toBeNull();
    expect(padOpen()).toBe(true);
    expectBelowFold(SHORT_DIVISION);
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
  });
});

describe('the round buttons with the pad switched off', () => {
  test('with the keyboard up they stand above the fold, not on it', async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        extraKeysToolbarVisible: false,
        keyboardButtonVisible: true,
      },
    });
    await renderScreen();
    await keyboardWillShow();
    const stack = bottomCarrier(screen.getByLabelText('Dismiss keyboard'));
    expect(AREA_BOTTOM - required(stack, 'bottom')).toBe(FOLD.top - 16);
  });
});

describe('only the active division across the window is the laptop pose', () => {
  async function expectFlatPad(keyboardHeight: number): Promise<void> {
    expect(coverHeight()).toBeNull();
    await press(TOGGLE);
    // The pad 12 pt above the keyboard; the terminal slides by the keyboard as on every iPhone.
    expect(screen.getByLabelText('Hide keyboard')).toBeTruthy();
    expect(terminalTop()).toBe(-(keyboardHeight - HOME));
  }

  test('flat (inactive division)', async () => {
    await renderScreen(PORTRAIT, [FLAT_DIVISION]);
    await keyboardWillShow();
    await expectFlatPad(PORTRAIT.height - KEYBOARD_TOP);
    expect(padFrame().bottom).toBe(KEYBOARD_TOP - 12);
  });

  test('book pose (an active division along the height): no layout of its own', async () => {
    await renderScreen(LANDSCAPE, [BOOK_DIVISION]);
    await act(() => keyboard.show(669 - 300, 300, 250));
    await expectFlatPad(300);
  });

  test('flat, Send in the editor leaves the pad and the editor as they are', async () => {
    await renderScreen(PORTRAIT, [FLAT_DIVISION]);
    await press(TOGGLE);
    await keyboardWillShow();
    await press('Text editor');
    await settle();
    const open = padOpen();
    await press(SEND);
    await settle();
    expect(screen.getByLabelText(EDITOR)).toBeTruthy();
    expect(padOpen()).toBe(open);
  });
});
