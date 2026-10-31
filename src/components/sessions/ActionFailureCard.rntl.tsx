/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. When the computer cannot start an action, the Sessions screen shows a hint card:
 * "Couldn't start <action>" and the computer's message, for 6 seconds, exposed as an accessible alert, never in the
 * way of a tap. On iOS the card asks VoiceOver to announce its text once; these tests check the request, not what
 * VoiceOver says on a device.
 */

import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { ACTION_FAILURE_VISIBLE_MS, ActionFailureCard } from './ActionFailureCard';

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

afterEach(() => {
  announce.mockRestore();
  jest.useRealTimers();
});

const failure = { id: 1, name: 'Tests', message: 'Quick action is not configured for this project.' };

test('shows the action and the message as an accessible alert, without catching taps', async () => {
  await render(<ActionFailureCard failure={failure} />);
  expect(screen.getByText("Couldn't start Tests")).toBeTruthy();
  expect(screen.getByText('Quick action is not configured for this project.')).toBeTruthy();
  const card = screen.getByRole('alert');
  expect(card.props.accessibilityLiveRegion).toBe('polite');
  expect(screen.getByTestId('action-failure-card-row').props.pointerEvents).toBe('none');
});

test('stays 6 seconds, then goes', async () => {
  await render(<ActionFailureCard failure={failure} />);
  expect(ACTION_FAILURE_VISIBLE_MS).toBe(6000);
  await act(async () => {
    jest.advanceTimersByTime(5999);
  });
  expect(screen.queryByText("Couldn't start Tests")).not.toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(screen.queryByText("Couldn't start Tests")).toBeNull();
});

test('a new failure replaces the shown one and starts its own 6 seconds', async () => {
  const view = await render(<ActionFailureCard failure={failure} />);
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  await view.rerender(
    <ActionFailureCard failure={{ id: 2, name: 'Git Status', message: 'Global quick action is not configured.' }} />,
  );
  expect(screen.queryByText("Couldn't start Tests")).toBeNull();
  expect(screen.getByText("Couldn't start Git Status")).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(screen.getByText("Couldn't start Git Status")).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(screen.queryByText("Couldn't start Git Status")).toBeNull();
});

test('nothing is shown without a failure', async () => {
  await render(<ActionFailureCard failure={null} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('asks iOS to announce each card once, with its title and message', async () => {
  const view = await render(<ActionFailureCard failure={failure} />);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith("Couldn't start Tests. Quick action is not configured for this project.");
  await view.rerender(<ActionFailureCard failure={failure} />);
  await act(async () => {
    jest.advanceTimersByTime(ACTION_FAILURE_VISIBLE_MS);
  });
  expect(announce).toHaveBeenCalledTimes(1);
  await view.rerender(<ActionFailureCard failure={{ ...failure, id: 2 }} />);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenLastCalledWith("Couldn't start Tests. Quick action is not configured for this project.");
});

test('nothing is announced without a failure', async () => {
  await render(<ActionFailureCard failure={null} />);
  expect(announce).not.toHaveBeenCalled();
});
