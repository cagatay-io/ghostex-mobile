/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Moving the command pad on the real terminal screen: holding its toggle for 0.3 s and
 * dragging it, the snap to the nearer side edge at the released height, the tap that still opens and closes it, the
 * place that only a drag stores, the keyboard and the layers moving it only to keep it above them, Reduce Motion
 * (also turned on while it springs or is lifted), the toggle's accessibility actions, the pick-up and drop haptics,
 * the pad drawn mirrored on the left edge, and the toggle keeping its touch from the first moment (no responder
 * hand-over and no responder of the screen above it, the swipe back kept from starting until the finger is up, only
 * its own finger moving the lifted pad, a cancelled touch storing nothing). The toggle's real hold timer and React
 * Native's responder and touch events drive the drag, in the order the device sends them: a finger's end reaches the
 * responder first, then the toggle's own touch event. That the iOS back swipe really does not start, and what a
 * second finger or the system's cancel does on the device, stays with the end test on the iPhone.
 */
import {
  ACCESSIBILITY_ACTIVATION,
  AGENT_TAB,
  AREA,
  DEFAULT_LABELS,
  LANDSCAPE,
  LANDSCAPE_AREA,
  LANDSCAPE_HEADER,
  LANDSCAPE_INSETS,
  RING,
  SHELL_TAB,
  TOGGLE,
  frameOf,
  keyboard,
  keyboardWillHide,
  keyboardWillShow,
  layOutArea,
  mockImpactHaptic,
  mockSafeArea,
  mockSelectionHaptic,
  navigation,
  numberAt,
  openPad,
  padFrame,
  parentOf,
  renderScreen,
  requiredNumber,
  setSettings,
  translationOf,
} from './TerminalScreen.commandPadHarness';

import { AccessibilityInfo, Animated, NativeModules, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../settings/store';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';

/** The screen's options while a finger is on the toggle: no swipe back for new touches and none to begin anywhere. */
const SWIPE_OFF = {
  gestureEnabled: false,
  gestureResponseDistance: {
    asymmetricMatch: (band: { start?: number; end?: number } | undefined): boolean =>
      band?.start !== undefined && band.end !== undefined && band.start > band.end,
    toAsymmetricMatcher: (): string => 'a band whose start lies past its end',
  },
};
/** The screen's options once the finger is up: the stack's own swipe back again. */
const SWIPE_ON = { gestureEnabled: undefined, gestureResponseDistance: undefined };
/**
 * How far the pad stands in from the area's left edge on that side: farther than the 16 pt on the right, so a finger
 * on the toggle stays clear of the system's swipe back from the screen's left edge.
 */
const LEFT_EDGE = 32;

/** Every view from the toggle up to the root, without the toggle itself. */
function ancestorsOf(instance: TestInstance): TestInstance[] {
  const chain: TestInstance[] = [];
  for (let view = instance.parent; view !== null; view = view.parent) chain.push(view);
  return chain;
}

/** The props through which a view asks React Native for a touch it does not hold. */
const CLAIMS = [
  'onStartShouldSetResponder',
  'onStartShouldSetResponderCapture',
  'onMoveShouldSetResponder',
  'onMoveShouldSetResponderCapture',
] as const;

/** A finger (`identifier`) at a point of the terminal area, as React Native's responder and touch events carry it. */
function touch(pageX: number, pageY: number, down = true, identifier = 0) {
  const point = { pageX, pageY, locationX: 0, locationY: 0, identifier, target: 1 };
  return {
    persist: () => undefined,
    nativeEvent: { pageX, pageY, identifier, touches: down ? [point] : [], changedTouches: [point] },
  };
}

/** Puts a finger on the toggle's centre: the responder's grant, whose touch-down the press timers start from. */
async function fingerDown(): Promise<{ x: number; y: number }> {
  const frame = frameOf(TOGGLE);
  const start = { x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 };
  const measure = (callback: (...values: number[]) => void) =>
    callback(0, 0, frame.right - frame.left, frame.bottom - frame.top, frame.left, frame.top);
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderGrant', {
    ...touch(start.x, start.y),
    currentTarget: { measure },
  });
  return start;
}

/** Puts a finger on the toggle's centre and keeps it there for `ms` (the toggle's own press timers run). */
async function holdToggle(ms: number): Promise<{ x: number; y: number }> {
  const start = await fingerDown();
  await act(() => jest.advanceTimersByTime(ms));
  return start;
}

async function moveFinger(x: number, y: number, identifier = 0): Promise<void> {
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderMove', touch(x, y, true, identifier));
}

async function liftFinger(x: number, y: number): Promise<void> {
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderRelease', touch(x, y, false));
  await fireEvent(screen.getByLabelText(TOGGLE), 'touchEnd', touch(x, y, false));
}

/** The system cancels the finger's touch: the responder is terminated, then the toggle's own touch is cancelled. */
async function cancelFinger(x: number, y: number): Promise<void> {
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderTerminate', touch(x, y, false));
  await fireEvent(screen.getByLabelText(TOGGLE), 'touchCancel', touch(x, y, false));
}

/** Long enough for the snap's spring to come to rest from anywhere in the area. */
const SNAP_SETTLED_MS = 2000;

/** Holds the toggle for 0.3 s, drags it by (dx, dy), lets go and lets the snap finish. */
async function dragPad(dx: number, dy: number): Promise<void> {
  const start = await holdToggle(300);
  await moveFinger(start.x + dx, start.y + dy);
  await liftFinger(start.x + dx, start.y + dy);
  await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
}

/** The stored flat position; read with `?.` so the criterion fails by assertion where nothing stores it. */
function storedFlatPosition(): unknown {
  return useSettingsStore.getState().settings.commandPadPosition?.flat;
}

/** The 3x3 field: where it lies across `AREA`, how it lays out its keys, and their names in that order. */
function fieldLayout(): { left: number; right: number; bottom: number; direction: unknown; labels: unknown[] } {
  const view = parentOf(screen.getByLabelText('Up'));
  const style = StyleSheet.flatten(view.props.style);
  const width = requiredNumber(style, 'width');
  const left = numberAt(style, 'left') ?? AREA.width - requiredNumber(style, 'right') - width;
  const labels = view.children
    .filter((child): child is TestInstance => typeof child !== 'string')
    .map((child) => child.props.accessibilityLabel);
  return {
    left,
    right: left + width,
    bottom: AREA.height - requiredNumber(style, 'bottom'),
    direction: style?.flexDirection,
    labels,
  };
}

describe('the pad moves by a drag on its toggle', () => {
  test('held 0.3 s and dragged, toggle, cross and ring follow the finger; let go, the pad snaps to the nearest side edge at the released height', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    // The default position: bottom right, 16 pt from the area's edges.
    expect(before.right).toBe(AREA.width - 16);
    expect(before.bottom).toBe(AREA.height - 16);
    const fieldBefore = translationOf(screen.getByLabelText('Up'));

    const start = await holdToggle(300);
    await moveFinger(start.x - 120, start.y - 200);
    expect(padFrame()).toEqual({
      left: before.left - 120,
      top: before.top - 200,
      right: before.right - 120,
      bottom: before.bottom - 200,
    });
    expect(translationOf(screen.getByLabelText('Up'))).toEqual({ x: fieldBefore.x - 120, y: fieldBefore.y - 200 });

    await liftFinger(start.x - 120, start.y - 200);
    // The snap starts where the finger let go...
    expect(frameOf(TOGGLE).right).toBe(before.right - 120);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    // ...and ends at the nearer side edge (the pad's middle was left of the area's middle), at the released height.
    const after = padFrame();
    expect(after.left).toBe(LEFT_EDGE);
    expect(after.bottom).toBe(before.bottom - 200);
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    expect(storedFlatPosition()).toMatchObject({ side: 'left' });
    // Still open: the hold moved the pad, it did not toggle it.
    expect(screen.getByLabelText('Up')).toBeTruthy();
  });

  test('the snap runs on the native animation driver from where the finger let go; a later drag still moves the pad', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const nativeValues = NativeModules.NativeAnimatedModule.setAnimatedNodeValue as jest.Mock;
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    let start = await holdToggle(300);
    await moveFinger(start.x - 120, start.y - 200);
    await liftFinger(start.x - 120, start.y - 200);
    expect(spring.mock.calls.map(([, config]) => config)).toEqual([
      expect.objectContaining({ toValue: { x: 0, y: 0 }, useNativeDriver: true }),
    ]);
    // The snap starts where the finger let go and ends at the nearer side edge.
    expect(frameOf(TOGGLE).right).toBe(before.right - 120);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: before.bottom - 200 });

    // The offset now lives on the native side: the finger's next drag sets it there (on the device that moves the
    // view; the test renderer draws only what JavaScript flushes), and its drop snaps from there.
    nativeValues.mockClear();
    start = await holdToggle(300);
    await moveFinger(start.x + 40, start.y + 30);
    expect(nativeValues.mock.calls.slice(-2).map(([, value]) => value)).toEqual([40, 30]);
    await liftFinger(start.x + 40, start.y + 30);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: before.bottom - 200 + 30 });
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
  });

  test('let go beyond the allowed area, the pad stays inside it, 16 pt from the area edges, 32 pt on the left (never under the header or the home indicator)', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    await dragPad(300, -900);
    expect(padFrame()).toMatchObject({ top: 16, right: AREA.width - 16 });
    await dragPad(-500, 900);
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: AREA.height - 16 });
  });

  test('a tap shorter than the hold opens and closes the pad as before and does not move it', async () => {
    await renderScreen();
    await layOutArea();
    const before = frameOf(TOGGLE);
    let start = await holdToggle(200);
    await liftFinger(start.x, start.y);
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(frameOf(TOGGLE)).toEqual(before);

    start = await holdToggle(200);
    await liftFinger(start.x, start.y);
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(frameOf(TOGGLE)).toEqual(before);
    expect(storedFlatPosition()).toBeUndefined();
    expect(mockImpactHaptic).not.toHaveBeenCalled();
  });

  test('a moved pad keeps its frame when the keyboard comes and goes and a Keys or Agent layer opens, switches or closes', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
    await renderScreen(AGENT_TAB);
    await layOutArea();
    await openPad();
    await dragPad(-200, -600);
    const moved = padFrame();
    expect(moved).toMatchObject({ left: LEFT_EDGE, top: 16 });

    await keyboardWillShow();
    expect(padFrame()).toEqual(moved);
    await fireEvent.press(screen.getByLabelText('Keys'));
    await keyboardWillHide();
    expect(screen.getByText('More keys')).toBeTruthy();
    expect(padFrame()).toEqual(moved);
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    expect(padFrame()).toEqual(moved);
    // The same layer button again brings the keyboard back in its place.
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    await keyboardWillShow();
    expect(padFrame()).toEqual(moved);
    await keyboardWillHide();
    expect(padFrame()).toEqual(moved);
  });

  test('only to stay inside the allowed area does it move: at the bottom it stands above the keyboard while that is up and goes back after', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    await dragPad(-250, 0);
    const moved = frameOf(TOGGLE);
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: AREA.height - 16 });

    await keyboardWillShow();
    // 336 - 34 of the terminal area covered, 12 above it: the area above the keyboard.
    expect(frameOf(TOGGLE)).toMatchObject({ left: moved.left, bottom: AREA.height - 314 });
    await keyboardWillHide();
    expect(frameOf(TOGGLE)).toEqual(moved);
  });

  test('with Reduce Motion on, the released pad is placed at once without a snap animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    spring.mockClear();
    timing.mockClear();

    const start = await holdToggle(300);
    await moveFinger(start.x - 150, start.y - 100);
    await liftFinger(start.x - 150, start.y - 100);
    // No time passes: it is already at the left edge, at the released height.
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: before.bottom - 100 });
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  test('the toggle offers "Move to the left side" and "Move to the right side"; each moves the pad there and stores it', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const actions = (screen.getByLabelText(TOGGLE).props.accessibilityActions ?? []) as {
      name: string;
      label: string;
    }[];
    const named = (label: string): string => actions.find((action) => action.label === label)?.name ?? '';
    expect(actions.map((action) => action.label)).toEqual(
      expect.arrayContaining(['Move to the left side', 'Move to the right side']),
    );

    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', {
      nativeEvent: { actionName: named('Move to the left side') },
    });
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: AREA.height - 16 });
    expect(storedFlatPosition()).toEqual({ side: 'left', height: 1 });

    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', {
      nativeEvent: { actionName: named('Move to the right side') },
    });
    expect(padFrame()).toMatchObject({ right: AREA.width - 16, bottom: AREA.height - 16 });
    expect(storedFlatPosition()).toEqual({ side: 'right', height: 1 });

    // Activating the toggle still opens and closes it.
    await fireEvent(screen.getByLabelText(TOGGLE), 'press', ACCESSIBILITY_ACTIVATION);
    expect(screen.queryByLabelText('Up')).toBeNull();
  });

  test('picking the pad up and dropping it give a haptic each, only with Key vibration on', async () => {
    await renderScreen();
    await layOutArea();
    let start = await holdToggle(300);
    expect(mockImpactHaptic).toHaveBeenCalledTimes(1);
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
    await liftFinger(start.x, start.y);
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    // A hold let go without moving drops the pad where it is; it does not open it.
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(frameOf(TOGGLE)).toMatchObject({ right: AREA.width - 16, bottom: AREA.height - 16 });

    await setSettings({ keyBarHapticsEnabled: false });
    start = await holdToggle(300);
    await liftFinger(start.x, start.y);
    expect(mockImpactHaptic).toHaveBeenCalledTimes(1);
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
  });
});

describe('only a drag stores a place; Reduce Motion followed live', () => {
  test('a hold without a drag over the keyboard keeps the resting place; the pad goes back when the keyboard hides', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const resting = frameOf(TOGGLE);
    await keyboardWillShow();
    expect(frameOf(TOGGLE).bottom).toBe(AREA.height - 314);
    const start = await holdToggle(300);
    expect(mockImpactHaptic).toHaveBeenCalledTimes(1);
    await liftFinger(start.x, start.y);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(storedFlatPosition()).toBeUndefined();
    await keyboardWillHide();
    expect(frameOf(TOGGLE)).toEqual(resting);
  });

  test('a held finger drifting up to 10 pt is no drag; a moved pad keeps its stored place under the keyboard and after it', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    await dragPad(-250, -200);
    const moved = frameOf(TOGGLE);
    const stored = storedFlatPosition();
    expect(stored).toMatchObject({ side: 'left' });

    await keyboardWillShow();
    expect(frameOf(TOGGLE).bottom).toBe(AREA.height - 314);
    const start = await holdToggle(300);
    // Pressability's own allowance for a held finger: 10 pt from where it went down.
    await moveFinger(start.x + 6, start.y - 8);
    await liftFinger(start.x + 6, start.y - 8);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(frameOf(TOGGLE).bottom).toBe(AREA.height - 314);
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    expect(storedFlatPosition()).toEqual(stored);
    await keyboardWillHide();
    expect(frameOf(TOGGLE)).toEqual(moved);
  });

  function followReduceMotion(): ((enabled: boolean) => void)[] {
    const listeners: ((enabled: boolean) => void)[] = [];
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      name: string,
      listener: (enabled: boolean) => void,
    ) => {
      if (name === 'reduceMotionChanged') listeners.push(listener);
      return { remove: () => undefined };
    }) as never);
    return listeners;
  }

  test('Reduce Motion turned on during a snap ends it and places the pad at once', async () => {
    const listeners = followReduceMotion();
    const spring = jest.spyOn(Animated, 'spring');
    const native = NativeModules.NativeAnimatedModule as Record<string, jest.Mock>;
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    const start = await holdToggle(300);
    await moveFinger(start.x - 195, start.y - 100);
    native.startAnimatingNode.mockClear();
    await liftFinger(start.x - 195, start.y - 100);
    // The snap is running: the pad is still near where the finger let go.
    expect(padFrame().left).not.toBe(LEFT_EDGE);
    expect(listeners.length).toBeGreaterThan(0);
    // The pad's offset (across, down) on the native side: the two nodes the snap animates.
    const padNodes = native.startAnimatingNode.mock.calls.map(([, nodeTag]) => nodeTag);
    expect(padNodes).toHaveLength(2);
    const padValues = () =>
      native.setAnimatedNodeValue.mock.calls
        .filter(([nodeTag]) => padNodes.includes(nodeTag))
        .map(([, value]) => value);
    native.setAnimatedNodeValue.mockClear();
    native.stopAnimation.mockClear();
    await act(() => listeners.forEach((listener) => listener(true)));
    // The snap runs on the native driver: it is stopped there and the pad's offset set to none at once, which on the
    // device draws it at its place (the test renderer draws only what JavaScript flushes, so the place is read here
    // without the offset).
    expect(native.stopAnimation).toHaveBeenCalled();
    expect(padValues()).toEqual([0, 0]);
    const shift = translationOf(screen.getByLabelText(TOGGLE));
    const placed = padFrame();
    expect({ left: placed.left - shift.x, bottom: placed.bottom - shift.y }).toEqual({
      left: LEFT_EDGE,
      bottom: before.bottom - 100,
    });
    // Nothing springs afterwards.
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(spring).toHaveBeenCalledTimes(1);
    expect(padValues()).toEqual([0, 0]);
  });

  test('Reduce Motion turned on while the pad is lifted leaves it under the finger', async () => {
    const listeners = followReduceMotion();
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    const start = await holdToggle(300);
    await moveFinger(start.x - 120, start.y - 200);
    await act(() => listeners.forEach((listener) => listener(true)));
    expect(padFrame()).toMatchObject({ left: before.left - 120, top: before.top - 200 });
    await liftFinger(start.x - 120, start.y - 200);
    // Let go with Reduce Motion on: placed at once at the nearer side edge.
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: before.bottom - 200 });
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
  });
});

describe('the pad on the left edge', () => {
  test('moved to the left edge, the toggle sits 32 pt from that edge, the four ring buttons lie mirrored on the cross’s other side, 16 pt farther in, and the cross keeps its order', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const toggleAtRight = frameOf(TOGGLE);
    const ringAtRight = RING.map((label) => frameOf(label));
    const fieldAtRight = fieldLayout();
    const middle = (frame: { left: number; right: number }) => (frame.left + frame.right) / 2;
    for (const button of ringAtRight) expect(middle(button)).toBeLessThan(middle(fieldAtRight));

    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', { nativeEvent: { actionName: 'moveLeft' } });
    expect(storedFlatPosition()).toEqual({ side: 'left', height: 1 });
    expect(frameOf(TOGGLE)).toEqual({
      left: LEFT_EDGE,
      top: toggleAtRight.top,
      right: LEFT_EDGE + toggleAtRight.right - toggleAtRight.left,
      bottom: toggleAtRight.bottom,
    });
    const field = fieldLayout();
    RING.forEach((label, index) => {
      const before = ringAtRight[index];
      const frame = frameOf(label);
      expect({ label, frame }).toEqual({
        label,
        frame: {
          left: AREA.width - before.right + LEFT_EDGE - 16,
          top: before.top,
          right: AREA.width - before.left + LEFT_EDGE - 16,
          bottom: before.bottom,
        },
      });
      expect(middle(frame)).toBeGreaterThan(middle(field));
    });
    // The field stands above the toggle at the edge, laid out as before: Esc, Up, ^C / Left, Enter, Right / ...
    expect(field).toEqual({
      left: LEFT_EDGE,
      right: LEFT_EDGE + fieldAtRight.right - fieldAtRight.left,
      bottom: fieldAtRight.bottom,
      direction: 'row',
      labels: DEFAULT_LABELS,
    });
    expect(fieldAtRight).toMatchObject({ direction: 'row', labels: DEFAULT_LABELS });

    // Back at the right edge, everything is where it was.
    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    expect(frameOf(TOGGLE)).toEqual(toggleAtRight);
    expect(RING.map((label) => frameOf(label))).toEqual(ringAtRight);
    expect(fieldLayout()).toEqual(fieldAtRight);
  });

  test('on the left edge the armed-modifier chip moves to the toggle’s other side with the ring', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', { nativeEvent: { actionName: 'moveLeft' } });
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('CTRL'));
    const chip = StyleSheet.flatten(parentOf(screen.getByText('Ctrl')).props.style);
    const toggle = frameOf(TOGGLE);
    expect(chip?.right).toBeUndefined();
    expect(numberAt(chip, 'left')).toBeGreaterThanOrEqual(toggle.right);
  });

  test('in landscape the toggle stands 32 pt inside the safe area on the left and 16 pt inside it on the right', async () => {
    Object.assign(mockSafeArea, LANDSCAPE_INSETS);
    keyboard.setScreen(LANDSCAPE.width, LANDSCAPE.height);
    await renderScreen(SHELL_TAB, LANDSCAPE);
    await layOutArea(LANDSCAPE_AREA, LANDSCAPE_INSETS.top + LANDSCAPE_HEADER);
    // The toggle's frame across the window: its place in the pad's room plus where that room stands.
    const acrossWindow = (): { left: number; right: number } => {
      let room = parentOf(screen.getByLabelText(TOGGLE));
      while (numberAt(StyleSheet.flatten(room.props.style), 'width') === undefined) room = parentOf(room);
      const style = StyleSheet.flatten(room.props.style);
      const at = requiredNumber(style, 'left');
      const frame = frameOf(TOGGLE, { width: requiredNumber(style, 'width'), height: requiredNumber(style, 'height') });
      return { left: at + frame.left, right: at + frame.right };
    };
    expect(acrossWindow().right).toBe(LANDSCAPE.width - LANDSCAPE_INSETS.right - 16);
    await fireEvent(screen.getByLabelText(TOGGLE), 'accessibilityAction', { nativeEvent: { actionName: 'moveLeft' } });
    expect(acrossWindow().left).toBe(LANDSCAPE_INSETS.left + LEFT_EDGE);
  });
});

describe('the toggle keeps its touch from the first moment', () => {
  test('from the first touch the toggle refuses to hand its press to another responder, held, lifted and let go', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const handsOver = (): unknown => screen.getByLabelText(TOGGLE).props.onResponderTerminationRequest();
    const start = await fingerDown();
    expect(handsOver()).toBe(false);
    await act(() => jest.advanceTimersByTime(200));
    expect(handsOver()).toBe(false);
    await act(() => jest.advanceTimersByTime(100));
    expect(handsOver()).toBe(false);
    await moveFinger(start.x - 120, start.y - 200);
    expect(handsOver()).toBe(false);
    await liftFinger(start.x - 120, start.y - 200);
    expect(handsOver()).toBe(false);
  });

  test('no view above the toggle asks for its touch, so the edge swipe between sessions can never take it', async () => {
    await renderScreen();
    await act(() => useTerminalStore.setState({ tabs: [SHELL_TAB, { ...SHELL_TAB, sessionKey: 'shell-2' }] }));
    await layOutArea();
    const toggle = screen.getByLabelText(TOGGLE);
    const chain = ancestorsOf(toggle);
    // React Native asks only the views above the one holding a touch whether they want it.
    expect(chain.filter((view) => CLAIMS.some((name) => typeof view.props[name] === 'function'))).toEqual([]);
    // The edge strips do ask for horizontal moves, but beside the pad, not above its toggle.
    const root = chain[chain.length - 1];
    const strips = root.queryAll((view) => typeof view.props.onMoveShouldSetResponder === 'function');
    expect(strips.length).toBeGreaterThanOrEqual(2);
    for (const strip of strips) expect(chain).not.toContain(strip);
  });

  test('a horizontal move during the hold keeps the touch on the toggle and switches no session', async () => {
    const setOptions = jest.spyOn(navigation, 'setOptions');
    await renderScreen();
    await act(() => useTerminalStore.setState({ tabs: [SHELL_TAB, { ...SHELL_TAB, sessionKey: 'shell-2' }] }));
    await layOutArea();
    setOptions.mockClear();
    const start = await fingerDown();
    await act(() => jest.advanceTimersByTime(100));
    await moveFinger(start.x - 90, start.y);
    await act(() => jest.advanceTimersByTime(100));
    await moveFinger(start.x - 180, start.y + 5);
    expect(screen.getByLabelText(TOGGLE).props.onResponderTerminationRequest()).toBe(false);
    expect(useTerminalStore.getState().selectedSessionKey).toBe(SHELL_TAB.sessionKey);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF]]);
    await liftFinger(start.x - 180, start.y + 5);
    expect(useTerminalStore.getState().selectedSessionKey).toBe(SHELL_TAB.sessionKey);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON]]);
  });

  test('the swipe back is kept from starting from the first touch, before any move, until the finger is up; a tap still opens and closes the pad', async () => {
    const setOptions = jest.spyOn(navigation, 'setOptions');
    await renderScreen();
    await layOutArea();
    setOptions.mockClear();
    // A tap: off at the touch, on again at the release, and the pad opens as before.
    let start = await fingerDown();
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF]]);
    await act(() => jest.advanceTimersByTime(200));
    await liftFinger(start.x, start.y);
    expect(screen.getByLabelText('Up')).toBeTruthy();
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON]]);
    // A second tap closes it, again turning the swipe off and on.
    start = await fingerDown();
    await liftFinger(start.x, start.y);
    expect(screen.queryByLabelText('Up')).toBeNull();
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON], [SWIPE_OFF], [SWIPE_ON]]);
    // Lifted, moved and dropped: off from the touch through the lift and the drag, on at the drop.
    setOptions.mockClear();
    start = await holdToggle(300);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF]]);
    await moveFinger(start.x - 120, start.y - 200);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF]]);
    await liftFinger(start.x - 120, start.y - 200);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON]]);
  });

  test('a touch the system cancels puts the pad back, stores nothing, gives no drop tick and turns the swipe back on', async () => {
    const setOptions = jest.spyOn(navigation, 'setOptions');
    await renderScreen();
    await layOutArea();
    await openPad();
    mockSelectionHaptic.mockClear();
    const before = padFrame();
    const start = await holdToggle(300);
    await moveFinger(start.x - 120, start.y - 200);
    expect(padFrame()).toMatchObject({ left: before.left - 120, top: before.top - 200 });
    await cancelFinger(start.x - 120, start.y - 200);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(padFrame()).toEqual(before);
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    expect(storedFlatPosition()).toBeUndefined();
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
    expect(setOptions).toHaveBeenLastCalledWith(SWIPE_ON);
    // A touch cancelled during the hold, before any lift, turns the swipe back on as well.
    setOptions.mockClear();
    const held = await holdToggle(100);
    await cancelFinger(held.x, held.y);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON]]);
    // Still open, and the toggle answers a tap again.
    expect(screen.getByLabelText('Up')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(TOGGLE));
    expect(screen.queryByLabelText('Up')).toBeNull();
  });

  test('only the finger that lifted the pad moves it and drops it; another finger neither moves nor drops it', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    const start = await holdToggle(300);
    await moveFinger(start.x - 120, start.y - 200);
    // A second finger moving elsewhere reaches the responder too; the pad stays under the first one.
    await moveFinger(start.x + 150, start.y - 50, 1);
    expect(padFrame()).toMatchObject({ left: before.left - 120, top: before.top - 200 });
    // The second finger's end does not drop it.
    await fireEvent(screen.getByLabelText(TOGGLE), 'touchEnd', touch(start.x + 150, start.y - 50, false, 1));
    await moveFinger(start.x - 130, start.y - 190);
    expect(padFrame()).toMatchObject({ left: before.left - 130, top: before.top - 190 });
    expect(storedFlatPosition()).toBeUndefined();
    await liftFinger(start.x - 130, start.y - 190);
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(padFrame()).toMatchObject({ left: LEFT_EDGE, bottom: before.bottom - 190 });
    expect(storedFlatPosition()).toMatchObject({ side: 'left' });
  });

  test('the first move after the lift does not jump by what the finger drifted during the hold', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    const start = await fingerDown();
    await act(() => jest.advanceTimersByTime(150));
    // 5 pt of drift, inside the hold's 10 pt allowance: the hold goes on and lifts the pad.
    await moveFinger(start.x + 3, start.y - 4);
    await act(() => jest.advanceTimersByTime(150));
    expect(mockImpactHaptic).toHaveBeenCalledTimes(1);
    expect(padFrame()).toEqual(before);
    await moveFinger(start.x + 3 - 120, start.y - 4 - 200);
    expect(padFrame()).toEqual({
      left: before.left - 120,
      top: before.top - 200,
      right: before.right - 120,
      bottom: before.bottom - 200,
    });
  });

  test('a session switch during the hold or the lift turns the swipe back on, and so does leaving the screen', async () => {
    const second: TerminalTab = { ...SHELL_TAB, sessionKey: 'shell-2', title: 'second' };
    const setOptions = jest.spyOn(navigation, 'setOptions');
    await renderScreen();
    await act(() => useTerminalStore.setState({ tabs: [SHELL_TAB, second] }));
    await layOutArea();
    setOptions.mockClear();
    // During the hold, before the lift.
    let start = await holdToggle(100);
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF]]);
    await act(() => useTerminalStore.getState().selectTab('shell-2'));
    expect(setOptions.mock.calls).toEqual([[SWIPE_OFF], [SWIPE_ON]]);
    // The finger lets go in the new session: nothing turns the swipe off again.
    await liftFinger(start.x, start.y);
    expect(setOptions).toHaveBeenCalledTimes(2);
    // While lifted.
    start = await holdToggle(300);
    expect(setOptions).toHaveBeenLastCalledWith(SWIPE_OFF);
    await act(() => useTerminalStore.getState().selectTab(SHELL_TAB.sessionKey));
    expect(setOptions).toHaveBeenLastCalledWith(SWIPE_ON);
    await liftFinger(start.x, start.y);
    expect(setOptions).toHaveBeenCalledTimes(4);
    await holdToggle(300);
    expect(setOptions).toHaveBeenLastCalledWith(SWIPE_OFF);
    await act(() => screen.unmount());
    expect(setOptions).toHaveBeenLastCalledWith(SWIPE_ON);
    expect(setOptions).toHaveBeenCalledTimes(6);
  });
});
