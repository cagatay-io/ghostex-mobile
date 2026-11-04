/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Reduce Motion on the file screens' notice (`NoticeToast`): it follows the system's
 * Reduce Motion setting live, through the app's one carrier of it (`reduceMotion.ts`). With Reduce Motion off a
 * notice fades in and out; switched on while the toast is mounted, the next notice appears and leaves at once,
 * without a fade; switched off again, notices fade again. `AccessibilityInfo` is the stand-in for the system
 * setting and its change event.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import NoticeToast, { type Notice } from './NoticeToast';

const reduceMotion = { enabled: false, listeners: [] as ((enabled: boolean) => void)[] };

beforeEach(() => {
  reduceMotion.enabled = false;
  reduceMotion.listeners = [];
  jest.useFakeTimers();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(() => Promise.resolve(reduceMotion.enabled));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    name: string,
    listener: (enabled: boolean) => void,
  ) => {
    if (name === 'reduceMotionChanged') reduceMotion.listeners.push(listener);
    return { remove: () => undefined };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The system setting changes while the app runs. */
async function setReduceMotion(enabled: boolean): Promise<void> {
  reduceMotion.enabled = enabled;
  await act(async () => {
    for (const listener of reduceMotion.listeners) listener(enabled);
  });
}

/** The toast's opacity as drawn: the style of the absolutely placed row that holds the message. */
function opacityOf(message: string): unknown {
  for (let node: TestInstance | null = screen.getByText(message); node !== null; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style) as { position?: string; opacity?: unknown } | undefined;
    if (style?.position === 'absolute') return style.opacity;
  }
  throw new Error('no toast row');
}

const notice = (id: number, message: string): Notice => ({ id, message, error: false });

test('the notice follows Reduce Motion switched on and off while it is mounted', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const view = await render(<NoticeToast notice={notice(1, 'Path copied')} bottom={16} />);
  // Off: the notice fades in.
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));

  await setReduceMotion(true);
  timing.mockClear();
  await view.rerender(<NoticeToast notice={notice(2, 'Added to Spike')} bottom={16} />);
  // On: it stands at once, fully shown, with no animation.
  expect(timing).not.toHaveBeenCalled();
  expect(opacityOf('Added to Spike')).toBe(1);
  // Its reading time over, it is gone at once, without a fade.
  await act(async () => {
    jest.advanceTimersByTime(3200);
  });
  expect(timing).not.toHaveBeenCalled();
  expect(screen.queryByText('Added to Spike')).toBeNull();

  await setReduceMotion(false);
  await view.rerender(<NoticeToast notice={notice(3, 'Not sent yet')} bottom={16} />);
  // Off again: notices fade again.
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));
});

test('with Reduce Motion on, clearing a lasting notice removes it at once', async () => {
  reduceMotion.enabled = true;
  const timing = jest.spyOn(Animated, 'timing');
  const view = await render(<NoticeToast notice={{ ...notice(1, 'Getting plan.md…'), lasting: true }} bottom={16} />);
  await act(async () => undefined);
  timing.mockClear();
  await view.rerender(<NoticeToast notice={{ ...notice(1, 'Getting plan.md…'), lasting: true }} bottom={16} />);
  await view.rerender(<NoticeToast notice={null} bottom={16} />);
  expect(timing).not.toHaveBeenCalled();
  expect(screen.queryByText('Getting plan.md…')).toBeNull();
});
