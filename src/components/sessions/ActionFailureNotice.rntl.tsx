/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. An Action start failure uses the same bottom notice as other messages:
 * its title and the phone's failure copy (a refusal it does not recognise reads as a plain sentence; the computer's
 * own words go to the app log) stay for six seconds, with an alert and an iOS announcement.
 * A later notice replaces it. These tests check the announcement request, not speech on a device.
 */

import { act, cleanup, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import NoticeToast, { type Notice } from '../common/NoticeToast';

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  announce.mockClear();
});

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const failure: Notice = {
  id: 1,
  title: "Couldn't start Tests",
  message: 'Quick action is not configured for this project.',
  error: true,
  durationMs: 6000,
  announce: true,
};

test('shows the action and the message as an accessible alert, without catching taps', async () => {
  await render(<NoticeToast notice={failure} bottom={16} />);
  expect(screen.getByText("Couldn't start Tests")).toBeTruthy();
  expect(screen.getByText('Quick action is not configured for this project.')).toBeTruthy();
  const card = screen.getByRole('alert');
  expect(card.props.accessibilityLiveRegion).toBe('polite');
  expect(card.props.pointerEvents).toBe('none');
});

test('stays 6 seconds, then goes', async () => {
  await render(<NoticeToast notice={failure} bottom={16} />);
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
  const view = await render(<NoticeToast notice={failure} bottom={16} />);
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  await view.rerender(
    <NoticeToast
      notice={{
        ...failure,
        id: 2,
        title: "Couldn't start Git Status",
        message: 'Global quick action is not configured.',
      }}
      bottom={16}
    />,
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
  await render(<NoticeToast notice={null} bottom={16} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('asks iOS to announce each notice once, with its title and message', async () => {
  const view = await render(<NoticeToast notice={failure} bottom={16} />);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith("Couldn't start Tests. Quick action is not configured for this project.");
  await view.rerender(<NoticeToast notice={failure} bottom={16} />);
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(announce).toHaveBeenCalledTimes(1);
  await view.rerender(<NoticeToast notice={{ ...failure, id: 2 }} bottom={16} />);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenLastCalledWith("Couldn't start Tests. Quick action is not configured for this project.");
});

test('nothing is announced without a failure', async () => {
  await render(<NoticeToast notice={null} bottom={16} />);
  expect(announce).not.toHaveBeenCalled();
});

test('an ordinary notice replaces the failure and owns its reading time', async () => {
  const view = await render(<NoticeToast notice={failure} bottom={16} />);
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  await view.rerender(
    <NoticeToast notice={{ id: 2, message: 'Link copied', error: false, durationMs: 6000 }} bottom={16} />,
  );
  expect(screen.queryByText("Couldn't start Tests")).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Link copied')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(screen.getByText('Link copied')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(screen.queryByText('Link copied')).toBeNull();
  expect(announce).toHaveBeenCalledTimes(1);
});

test('a failure replaces an ordinary notice without inheriting its timeout', async () => {
  const view = await render(<NoticeToast notice={{ id: 1, message: 'Link copied', error: false }} bottom={16} />);
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await view.rerender(<NoticeToast notice={{ ...failure, id: 2 }} bottom={16} />);
  expect(screen.queryByText('Link copied')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(3200);
  });
  expect(screen.getByRole('alert')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(2800);
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Android keeps the alert and polite live region without requesting an iOS announcement', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await render(<NoticeToast notice={failure} bottom={16} />);
  expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('polite');
  expect(announce).not.toHaveBeenCalled();
});

test('clearing or unmounting cancels the notice timeout', async () => {
  const timeout = jest.spyOn(global, 'setTimeout');
  const clear = jest.spyOn(global, 'clearTimeout');
  const view = await render(<NoticeToast notice={failure} bottom={16} />);
  const timer = timeout.mock.results[timeout.mock.calls.findIndex(([, delay]) => delay === 6000)]?.value;
  expect(timer).toBeDefined();
  await view.rerender(<NoticeToast notice={null} bottom={16} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(clear).toHaveBeenCalledWith(timer);
  timeout.mockClear();
  clear.mockClear();
  await view.rerender(<NoticeToast notice={{ ...failure, id: 2 }} bottom={16} />);
  const nextTimer = timeout.mock.results[timeout.mock.calls.findIndex(([, delay]) => delay === 6000)]?.value;
  expect(nextTimer).toBeDefined();
  await view.unmount();
  expect(clear).toHaveBeenCalledWith(nextTimer);
});
