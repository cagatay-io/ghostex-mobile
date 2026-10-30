/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Moving the command pad on the real terminal screen: holding its toggle for 0.3 s and
 * dragging it, the snap to the nearer side edge at the released height, the tap that still opens and closes it, the
 * place that only a drag stores, the keyboard and the layers moving it only to keep it above them, Reduce Motion
 * (also turned on while it springs or is lifted), the toggle's accessibility actions, the pick-up and drop haptics,
 * and the pad drawn mirrored on the left edge. The toggle's real hold timer and React Native's responder events drive
 * the drag.
 */
import {
  ACCESSIBILITY_ACTIVATION,
  AGENT_TAB,
  AREA,
  DEFAULT_LABELS,
  RING,
  TOGGLE,
  frameOf,
  keyboardWillHide,
  keyboardWillShow,
  layOutArea,
  mockImpactHaptic,
  mockSelectionHaptic,
  numberAt,
  openPad,
  padFrame,
  parentOf,
  renderScreen,
  requiredNumber,
  setSettings,
  translationOf,
} from './TerminalScreen.commandPadHarness';

import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../settings/store';
import { useTerminalStore } from '../terminal/sessions';

/** A finger at a point of the terminal area, as React Native's responder events carry it. */
function touch(pageX: number, pageY: number, down = true) {
  const point = { pageX, pageY, locationX: 0, locationY: 0, identifier: 0, target: 1 };
  return {
    persist: () => undefined,
    nativeEvent: { pageX, pageY, touches: down ? [point] : [], changedTouches: [point] },
  };
}

/** Puts a finger on the toggle's centre and keeps it there for `ms` (the toggle's own press timers run). */
async function holdToggle(ms: number): Promise<{ x: number; y: number }> {
  const frame = frameOf(TOGGLE);
  const start = { x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 };
  const measure = (callback: (...values: number[]) => void) =>
    callback(0, 0, frame.right - frame.left, frame.bottom - frame.top, frame.left, frame.top);
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderGrant', {
    ...touch(start.x, start.y),
    currentTarget: { measure },
  });
  await act(() => jest.advanceTimersByTime(ms));
  return start;
}

async function moveFinger(x: number, y: number): Promise<void> {
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderMove', touch(x, y));
}

async function liftFinger(x: number, y: number): Promise<void> {
  await fireEvent(screen.getByLabelText(TOGGLE), 'responderRelease', touch(x, y, false));
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
    expect(after.left).toBe(16);
    expect(after.bottom).toBe(before.bottom - 200);
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    expect(storedFlatPosition()).toMatchObject({ side: 'left' });
    // Still open: the hold moved the pad, it did not toggle it.
    expect(screen.getByLabelText('Up')).toBeTruthy();
  });

  test('let go beyond the allowed area, the pad stays inside it, 16 pt from the area edges (never under the header or the home indicator)', async () => {
    await renderScreen();
    await layOutArea();
    await openPad();
    await dragPad(300, -900);
    expect(padFrame()).toMatchObject({ top: 16, right: AREA.width - 16 });
    await dragPad(-500, 900);
    expect(padFrame()).toMatchObject({ left: 16, bottom: AREA.height - 16 });
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
    expect(moved).toMatchObject({ left: 16, top: 16 });

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
    expect(padFrame()).toMatchObject({ left: 16, bottom: AREA.height - 16 });

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
    expect(padFrame()).toMatchObject({ left: 16, bottom: before.bottom - 100 });
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
    expect(padFrame()).toMatchObject({ left: 16, bottom: AREA.height - 16 });
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
    await renderScreen();
    await layOutArea();
    await openPad();
    const before = padFrame();
    const start = await holdToggle(300);
    await moveFinger(start.x - 195, start.y - 100);
    await liftFinger(start.x - 195, start.y - 100);
    // The snap is running: the pad is still near where the finger let go.
    expect(padFrame().left).not.toBe(16);
    expect(listeners.length).toBeGreaterThan(0);
    await act(() => listeners.forEach((listener) => listener(true)));
    expect(padFrame()).toMatchObject({ left: 16, bottom: before.bottom - 100 });
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
    await act(() => jest.advanceTimersByTime(SNAP_SETTLED_MS));
    expect(padFrame()).toMatchObject({ left: 16, bottom: before.bottom - 100 });
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
    expect(padFrame()).toMatchObject({ left: 16, bottom: before.bottom - 200 });
    expect(translationOf(screen.getByLabelText(TOGGLE))).toEqual({ x: 0, y: 0 });
  });
});

describe('the pad on the left edge', () => {
  test('moved to the left edge, the toggle sits at that edge, the four ring buttons lie mirrored on the cross’s other side, and the cross keeps its order', async () => {
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
      left: 16,
      top: toggleAtRight.top,
      right: 16 + toggleAtRight.right - toggleAtRight.left,
      bottom: toggleAtRight.bottom,
    });
    const field = fieldLayout();
    RING.forEach((label, index) => {
      const before = ringAtRight[index];
      const frame = frameOf(label);
      expect({ label, frame }).toEqual({
        label,
        frame: {
          left: AREA.width - before.right,
          top: before.top,
          right: AREA.width - before.left,
          bottom: before.bottom,
        },
      });
      expect(middle(frame)).toBeGreaterThan(middle(field));
    });
    // The field stands above the toggle at the edge, laid out as before: Esc, Up, ^C / Left, Enter, Right / ...
    expect(field).toEqual({
      left: 16,
      right: 16 + fieldAtRight.right - fieldAtRight.left,
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
});
