/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Too little room for the open command pad on the real terminal screen. Where it fits
 * by reaching over the header, it does, inside the safe area and with every control at its full size. Where it does
 * not fit even then (a phone in landscape with the keyboard up), opening it lowers the keyboard and closing it brings
 * the keyboard back. A Keys or Agent layer that leaves the open pad no room takes the pad's place with its own close
 * button, whether the pad holds the keyboard down or the keyboard was down before the pad opened. The keyboard coming
 * up, by any route, where the open pad has no room above it closes the pad at once, also while an update of the
 * terminal area is still settling. Turns, folds and resizes: `TerminalScreen.commandPadTurns.rntl.tsx`.
 */
import {
  AGENT_TAB,
  AREA,
  CLOSE_LAYER,
  DEFAULT_LABELS,
  EDITOR,
  KEYBOARD,
  LANDSCAPE,
  LANDSCAPE_AREA,
  LANDSCAPE_HEADER,
  LANDSCAPE_INSETS,
  LANDSCAPE_KEYBOARD,
  PORTRAIT_INSETS,
  RING,
  SHELL_TAB,
  TOGGLE,
  WINDOW,
  frameOf,
  keyboard,
  keyboardWillHide,
  keyboardWillShow,
  layOutArea,
  mockNative,
  mockSafeArea,
  numberAt,
  openPad,
  padFrame,
  press,
  renderScreen,
  setWindow,
  type Area,
} from './TerminalScreen.commandPadHarness';

import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { PAD_ROOM_SETTLE_MS } from '../components/terminal/useCommandPad';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';

/** The terminal screen in landscape with the keyboard up, laid out and left alone until its room has settled. */
async function renderLandscapeWithKeyboard(tab: TerminalTab = SHELL_TAB): Promise<void> {
  Object.assign(mockSafeArea, LANDSCAPE_INSETS);
  keyboard.setScreen(LANDSCAPE.width, LANDSCAPE.height);
  await renderScreen(tab, LANDSCAPE);
  await layOutArea(LANDSCAPE_AREA, LANDSCAPE_INSETS.top + LANDSCAPE_HEADER);
  await act(() => jest.advanceTimersByTime(PAD_ROOM_SETTLE_MS));
  await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
}

/**
 * The highest point (terminal area coordinates) at which the control named `label` is still drawn and touchable:
 * the top of every view above it that cuts off what lies outside it. `areaTop` is the terminal area's top on screen.
 */
function drawnFrom(label: string | RegExp, areaTop: number): number {
  const terminalArea = screen.getByTestId('terminal-view').parent;
  let node = screen.getByLabelText(label).parent;
  let from = Number.NEGATIVE_INFINITY;
  while (node !== null) {
    const style = StyleSheet.flatten(node.props.style);
    if (style?.overflow === 'hidden') {
      const top = numberAt(style, 'top');
      if (node === terminalArea) from = Math.max(from, 0);
      else if (top !== undefined) from = Math.max(from, top - areaTop);
      else throw new Error(`a view of unknown place cuts off ${String(label)}`);
    }
    node = node.parent;
  }
  return from;
}

/** Every pad control's own size: none is made smaller than the 44 pt touch target to fit. */
function expectFullSizeControls(): void {
  for (const label of [TOGGLE, ...RING, ...DEFAULT_LABELS]) {
    const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
    const [width, height] = [numberAt(style, 'width') ?? 0, numberAt(style, 'height') ?? 0];
    expect({ label, width: width >= 44, height: height >= 44 }).toEqual({
      label,
      width: true,
      height: true,
    });
  }
}

describe('too little room for the open pad', () => {
  const cases = [
    { name: 'an area 3 pt short with nothing covering it', header: 44, withKeyboard: false, short: 3 },
    { name: 'an area as short as the 44 pt header', header: 44, withKeyboard: false, short: 44 },
    { name: 'the room above the keyboard 31 pt short', header: 44, withKeyboard: true, short: 31 },
    { name: 'the room above the keyboard 62 pt short under a 62 pt header', header: 62, withKeyboard: true, short: 62 },
  ];
  test.each(cases)(
    '$name: the open pad reaches over the header, stays inside the safe area, nothing is cut off, every key keeps its size, the keyboard stays',
    async ({ header, withKeyboard, short }) => {
      const cover = withKeyboard ? KEYBOARD.height - PORTRAIT_INSETS.bottom : 0;
      const needed = (withKeyboard ? cover + 12 : 16) + 308 + 16;
      const area = { width: WINDOW.width, height: needed - short };
      const areaTop = PORTRAIT_INSETS.top + header;
      await renderScreen();
      await layOutArea(area, areaTop);
      if (withKeyboard) await keyboardWillShow();
      await openPad();

      expect(mockNative.blurTerminal).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Up')).toBeTruthy();
      // It stands just above what covers the area and reaches `short` points past the area's 16 pt margin.
      expect(padFrame(area)).toMatchObject({ top: 16 - short, bottom: area.height - (withKeyboard ? cover + 12 : 16) });
      const safeTop = PORTRAIT_INSETS.top - areaTop;
      for (const label of [TOGGLE, ...RING]) {
        const frame = frameOf(label, area);
        expect({ label, insideSafeArea: frame.top >= safeTop }).toEqual({ label, insideSafeArea: true });
        expect({ label, cutOff: frame.top < drawnFrom(label, areaTop) }).toEqual({ label, cutOff: false });
      }
      expectFullSizeControls();
    },
  );

  test('landscape with the keyboard up and too little room even over the header: opening the pad lowers the keyboard and the pad fits; closing it brings the keyboard back', async () => {
    await renderLandscapeWithKeyboard();
    await openPad();
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillHide();

    expect(screen.getByLabelText('Up')).toBeTruthy();
    const areaTop = LANDSCAPE_INSETS.top + LANDSCAPE_HEADER;
    for (const label of [TOGGLE, ...RING]) {
      const frame = frameOf(label, LANDSCAPE_AREA);
      expect({ label, insideSafeArea: frame.top >= LANDSCAPE_INSETS.top - areaTop }).toEqual({
        label,
        insideSafeArea: true,
      });
      expect({ label, cutOff: frame.top < drawnFrom(label, areaTop) }).toEqual({ label, cutOff: false });
      expect(frame.bottom).toBeLessThanOrEqual(LANDSCAPE_AREA.height - 16);
    }
    expectFullSizeControls();

    mockNative.focusTerminal.mockClear();
    await openPad();
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
    expect(screen.queryByLabelText('Up')).toBeNull();
  });

  test('while the pad holds the keyboard down, the ring’s keyboard button closes the pad and brings the keyboard back', async () => {
    await renderLandscapeWithKeyboard();
    await openPad();
    await keyboardWillHide();
    mockNative.focusTerminal.mockClear();

    await fireEvent.press(screen.getByLabelText('Show keyboard'));
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('while the pad holds the keyboard down, the keyboard coming back another way (a tap on the terminal) closes the pad and drops armed modifiers', async () => {
    await renderLandscapeWithKeyboard();
    await openPad();
    await keyboardWillHide();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('CTRL'));
    expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({ ctrl: true });

    await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByText('More keys')).toBeNull();
    expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({ ctrl: false, alt: false, shift: false });
    // Closed this way, it does not ask for the keyboard a second time.
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });
});

/** In landscape, the open pad holding the keyboard down (the two do not fit together); the keyboard gone. */
async function holdKeyboardWithPad(tab: TerminalTab = SHELL_TAB): Promise<void> {
  await renderLandscapeWithKeyboard(tab);
  await openPad();
  await keyboardWillHide();
  mockNative.focusTerminal.mockClear();
  mockNative.blurTerminal.mockClear();
}

/** Turns the device: its window, safe area and keyboard frames, and the terminal area `areaTop` below the top. */
async function turnTo(window: Area, insets: typeof PORTRAIT_INSETS, area: Area, areaTop: number): Promise<void> {
  Object.assign(mockSafeArea, insets);
  keyboard.setScreen(window.width, window.height);
  await setWindow(window);
  await layOutArea(area, areaTop);
}

/** The layers the ring opens, with the session that has each and the title its panel shows. */
const LAYERS = [
  { button: 'Keys', title: 'More keys', tab: SHELL_TAB },
  { button: 'Agent hotkeys', title: 'Claude Code', tab: AGENT_TAB },
];

/** Lays out the shown layer's panel (the one titled `title`) at `height`, as before any keyboard in this window. */
async function layOutLayer(title: string, width: number, height: number): Promise<void> {
  let panel: TestInstance | null = screen.getByText(title);
  while (panel !== null && panel.props.onLayout === undefined) panel = panel.parent;
  if (panel === null) throw new Error('no layer panel');
  await fireEvent(panel, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

/** The pad shown again when a layer that stood in for it closes: at once with Reduce Motion on, else its motion. */
const MOTIONS = [
  { name: 'with Reduce Motion on, the pad is there at once when the layer closes', reduceMotion: true },
  { name: 'without it, the pad fades and grows out of the toggle again', reduceMotion: false },
];

describe('a Keys or Agent layer opened while the pad holds the keyboard down', () => {
  test.each(LAYERS)(
    '$button: the pad closes and the layer shows its own 44 pt close button; that button closes the layer and opens the pad again, the keyboard staying down',
    async ({ button, title, tab }) => {
      useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
      await holdKeyboardWithPad(tab);
      await fireEvent.press(screen.getByLabelText(button));
      expect(screen.queryByLabelText('Up')).toBeNull();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
      // Nothing is covered: the closed toggle stands whole in the terminal area above the layer.
      expect(frameOf(TOGGLE, LANDSCAPE_AREA).top).toBeGreaterThanOrEqual(0);
      expect(screen.queryByText(title)).not.toBeNull();
      const close = screen.queryByLabelText(CLOSE_LAYER);
      expect(close?.props).toMatchObject({
        accessibilityRole: 'button',
        accessibilityHint: 'Opens the command pad again',
      });
      expect(StyleSheet.flatten(close?.props.style)).toMatchObject({ width: 44, height: 44 });

      await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
      expect(screen.queryByText(title)).toBeNull();
      expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
      expect(screen.getByLabelText('Up')).toBeTruthy();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: true });
      expect(mockNative.focusTerminal).not.toHaveBeenCalled();
      // The pad still holds the keyboard: closing it brings the keyboard back.
      await openPad();
      expect(mockNative.focusTerminal).toHaveBeenCalledWith(tab.sessionKey);
    },
  );

  test('where the open pad fits above it, a layer has no close button and the pad stays open above it', async () => {
    await renderScreen();
    await layOutArea();
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await keyboardWillHide();
    expect(screen.getByText('More keys')).toBeTruthy();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
  });

  test('the toggle tapped while such a layer is up closes the layer and opens the pad, the keyboard staying down', async () => {
    await holdKeyboardWithPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();

    await openPad();
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
  });

  test('the keyboard coming back while such a layer is up (a tap on the terminal) ends the layer, leaves the pad closed and drops armed modifiers', async () => {
    await holdKeyboardWithPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    await fireEvent.press(screen.getByLabelText('CTRL'));
    // Armed while the pad is drawn closed, its chip stays beside the toggle.
    expect(screen.getByText('Ctrl')).toBeTruthy();

    await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByText('Ctrl')).toBeNull();
    expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({ ctrl: false, alt: false, shift: false });
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    // Nothing of that state is left: opening the pad again lowers the keyboard as it did at first.
    await openPad();
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('a rotation that makes room shows the pad above the layer without the close button; turning back hands the place to the layer again', async () => {
    await holdKeyboardWithPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    expect(screen.queryByLabelText('Up')).toBeNull();

    await turnTo(WINDOW, PORTRAIT_INSETS, AREA, PORTRAIT_INSETS.top + LANDSCAPE_HEADER);
    // Upright, the layer has its own height until a keyboard is seen in this window.
    await layOutLayer('More keys', WINDOW.width, 300);
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.getByText('More keys')).toBeTruthy();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(padFrame().top).toBeGreaterThanOrEqual(16);

    await turnTo(LANDSCAPE, LANDSCAPE_INSETS, LANDSCAPE_AREA, LANDSCAPE_INSETS.top + LANDSCAPE_HEADER);
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test.each(MOTIONS)('$name', async ({ reduceMotion }) => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
    const timing = jest.spyOn(Animated, 'timing');
    await holdKeyboardWithPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    timing.mockClear();

    await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
    expect(screen.getByLabelText('Up')).toBeTruthy();
    // The pad's 140 ms opening motion: none with Reduce Motion on.
    const openings = timing.mock.calls.filter(([, config]) => config.duration === 140);
    expect(openings).toHaveLength(reduceMotion ? 0 : 1);
  });
});

/**
 * In landscape with the keyboard down before the pad opened (it was up once, so a layer takes its height there): the
 * open pad fits, reaching over the header, but not above a Keys or Agent layer.
 */
async function openPadWithKeyboardDown(tab: TerminalTab = SHELL_TAB): Promise<void> {
  await renderLandscapeWithKeyboard(tab);
  await keyboardWillHide();
  await openPad();
  mockNative.focusTerminal.mockClear();
  mockNative.blurTerminal.mockClear();
}

describe('a Keys or Agent layer that leaves the open pad no room while the keyboard was down', () => {
  test.each(LAYERS)(
    '$button: the pad closes and the layer shows its own 44 pt close button; that button closes the layer and opens the pad again, the keyboard staying down',
    async ({ button, title, tab }) => {
      useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
      await openPadWithKeyboardDown(tab);
      // Without a cover the open pad has its room, so opening it left the keyboard as it was.
      expect(screen.getByLabelText('Up')).toBeTruthy();

      await fireEvent.press(screen.getByLabelText(button));
      expect(screen.queryByText(title)).not.toBeNull();
      expect(screen.queryByLabelText('Up')).toBeNull();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
      // Nothing is covered: the closed toggle stands whole in the terminal area above the layer.
      expect(frameOf(TOGGLE, LANDSCAPE_AREA).top).toBeGreaterThanOrEqual(0);
      const close = screen.queryByLabelText(CLOSE_LAYER);
      expect(close?.props).toMatchObject({
        accessibilityRole: 'button',
        accessibilityHint: 'Opens the command pad again',
      });
      expect(StyleSheet.flatten(close?.props.style)).toMatchObject({ width: 44, height: 44 });

      await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
      expect(screen.queryByText(title)).toBeNull();
      expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
      expect(screen.getByLabelText('Up')).toBeTruthy();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: true });
      expect(mockNative.focusTerminal).not.toHaveBeenCalled();
      expect(mockNative.blurTerminal).not.toHaveBeenCalled();
      // The keyboard was down before the pad opened: closing the pad leaves it down.
      await openPad();
      expect(screen.queryByLabelText('Up')).toBeNull();
      expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    },
  );

  test('the toggle tapped while such a layer is up closes the layer and opens the pad, the keyboard staying down', async () => {
    await openPadWithKeyboardDown();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();

    await openPad();
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    expect(mockNative.blurTerminal).not.toHaveBeenCalled();
  });

  test('the keyboard coming back while such a layer is up (a tap on the terminal) ends the layer, leaves the pad closed and drops armed modifiers', async () => {
    await openPadWithKeyboardDown();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    await fireEvent.press(screen.getByLabelText('CTRL'));
    // Armed while the pad is drawn closed, its chip stays beside the toggle.
    expect(screen.getByText('Ctrl')).toBeTruthy();

    await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByText('Ctrl')).toBeNull();
    expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({ ctrl: false, alt: false, shift: false });
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    // Nothing of that state is left: opening the pad with the keyboard up lowers the keyboard.
    await openPad();
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('a rotation that makes room shows the pad above the layer without the close button; turning back hands the place to the layer again', async () => {
    await openPadWithKeyboardDown();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    expect(screen.queryByLabelText('Up')).toBeNull();

    await turnTo(WINDOW, PORTRAIT_INSETS, AREA, PORTRAIT_INSETS.top + LANDSCAPE_HEADER);
    // Upright, the layer has its own height until a keyboard is seen in this window.
    await layOutLayer('More keys', WINDOW.width, 300);
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();
    expect(screen.getByText('More keys')).toBeTruthy();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(padFrame().top).toBeGreaterThanOrEqual(16);

    await turnTo(LANDSCAPE, LANDSCAPE_INSETS, LANDSCAPE_AREA, LANDSCAPE_INSETS.top + LANDSCAPE_HEADER);
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });

  test('a layer opened upright with the keyboard up, then turned to landscape: the layer takes the room; closing it opens the pad with the keyboard down, and closing the pad brings the keyboard back', async () => {
    await renderScreen();
    await layOutArea();
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await keyboardWillHide();
    // Upright the open pad fits above the layer, which has the keyboard's height.
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(screen.queryByLabelText(CLOSE_LAYER)).toBeNull();

    await turnTo(LANDSCAPE, LANDSCAPE_INSETS, LANDSCAPE_AREA, LANDSCAPE_INSETS.top + LANDSCAPE_HEADER);
    // No keyboard was seen in landscape: the layer has its own height, as tall as the keyboard there.
    await layOutLayer('More keys', LANDSCAPE.width, LANDSCAPE_KEYBOARD.height);
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    mockNative.focusTerminal.mockClear();

    await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(screen.getByLabelText('Up')).toBeTruthy();
    // The open pad and the keyboard do not fit together here: the keyboard stays down while the pad is open.
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
    await openPad();
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
  });

  test.each(MOTIONS)('$name', async ({ reduceMotion }) => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
    const timing = jest.spyOn(Animated, 'timing');
    await openPadWithKeyboardDown();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByLabelText(CLOSE_LAYER)).not.toBeNull();
    timing.mockClear();

    await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
    expect(screen.getByLabelText('Up')).toBeTruthy();
    // The pad's 140 ms opening motion: none with Reduce Motion on.
    const openings = timing.mock.calls.filter(([, config]) => config.duration === 140);
    expect(openings).toHaveLength(reduceMotion ? 0 : 1);
  });
});

/** The ways the keyboard comes up while the open pad is shown, and how often each asks the terminal for the focus. */
const KEYBOARD_ROUTES = [
  // The terminal takes the focus itself: the app only sees the keyboard come.
  { name: 'a tap on the terminal', run: async () => undefined, focusRequests: 0, editor: false },
  { name: 'the ring’s keyboard button', run: () => press('Show keyboard'), focusRequests: 1, editor: false },
  // The editor's field takes the focus as it appears.
  { name: 'the text editor taking the focus', run: () => press('Text editor'), focusRequests: 0, editor: true },
];

describe('the keyboard coming up where the open pad has no room above it, the keyboard down when the pad opened', () => {
  test.each(KEYBOARD_ROUTES)(
    '$name: the pad closes as the keyboard comes, armed modifiers go, and the keyboard stays',
    async ({ run, focusRequests, editor }) => {
      await openPadWithKeyboardDown();
      // Ctrl armed in the Keys layer, which stands in for the pad here; closing the layer shows the pad again.
      await fireEvent.press(screen.getByLabelText('Keys'));
      await fireEvent.press(screen.getByLabelText('CTRL'));
      await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
      expect(screen.getByLabelText('Up')).toBeTruthy();
      expect(screen.getByText('Ctrl')).toBeTruthy();

      await run();
      await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
      expect(screen.queryByLabelText('Up')).toBeNull();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
      expect(screen.queryByText('Ctrl')).toBeNull();
      expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({
        ctrl: false,
        alt: false,
        shift: false,
      });
      expect(mockNative.focusTerminal).toHaveBeenCalledTimes(focusRequests);
      // Nothing lowers the keyboard again; the text editor stays on it.
      expect(mockNative.blurTerminal).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(EDITOR) !== null).toBe(editor);
    },
  );
});

describe('the keyboard coming up where the open pad has no room above it while a terminal area update is still settling', () => {
  test.each(KEYBOARD_ROUTES)(
    '$name: the pad closes at once as the keyboard comes, armed modifiers go, and the keyboard stays',
    async ({ run, focusRequests, editor }) => {
      await openPadWithKeyboardDown();
      await fireEvent.press(screen.getByLabelText('Keys'));
      await fireEvent.press(screen.getByLabelText('CTRL'));
      await fireEvent.press(screen.getByLabelText(CLOSE_LAYER));
      // The terminal area reported 1 pt shorter: the pad still fits with the keyboard down, and its room now waits to
      // settle while the person brings the keyboard up.
      await layOutArea(
        { ...LANDSCAPE_AREA, height: LANDSCAPE_AREA.height - 1 },
        LANDSCAPE_INSETS.top + LANDSCAPE_HEADER,
      );
      expect(screen.getByLabelText('Up')).toBeTruthy();
      expect(screen.getByText('Ctrl')).toBeTruthy();

      await run();
      await act(() => keyboard.show(LANDSCAPE_KEYBOARD.top, LANDSCAPE_KEYBOARD.height, 250));
      expect(screen.queryByLabelText('Up')).toBeNull();
      expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
      expect(screen.queryByText('Ctrl')).toBeNull();
      expect(mockNative.setKeyModifiers.mock.calls.at(-1)?.[1]).toMatchObject({
        ctrl: false,
        alt: false,
        shift: false,
      });
      expect(mockNative.focusTerminal).toHaveBeenCalledTimes(focusRequests);
      expect(mockNative.blurTerminal).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(EDITOR) !== null).toBe(editor);
    },
  );
});
