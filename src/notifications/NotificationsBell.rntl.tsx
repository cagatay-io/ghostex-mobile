/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The attention list's entry with the approved mockup `notifications` (state
 * list-entry): the bell on the Sessions screen carries the number of unread attention-list rows as a figure,
 * not as a colour alone, counted across every computer's feed; with nothing unread it shows no number. The
 * probe composes the bell exactly as `SessionsScreen` does: `useAttentionUnreadCount` into `bellLabel` and
 * `BellWithCount`. Rows are fed through the attention store, as the feed source does.
 */

import { Pressable } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import type { FeedRow } from './feedContract';
import { useAttentionFeedStore } from './feedStore';
import { bellLabel, BellWithCount, useAttentionUnreadCount } from './NotificationsBell';

// Boundaries only: the native module and expo-notifications (nothing here calls them) and storage.
jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** The badge is drawn for the eye; VoiceOver reads the count from the button's label, so it is hidden there. */
const SHOWN = { includeHiddenElements: true };

function row(id: string, read: boolean): FeedRow {
  return {
    id,
    projectId: 'p1',
    sessionId: `s-${id}`,
    kind: 'finished',
    title: 'Session',
    subtitle: 'ghostex-mobile',
    agentName: 'claude',
    createdAt: '2026-10-29T10:00:00.000Z',
    read,
  };
}

function SessionsBell() {
  const unread = useAttentionUnreadCount();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={bellLabel(unread)}>
      <BellWithCount size={22} color="white" unread={unread} />
    </Pressable>
  );
}

beforeEach(() => {
  useAttentionFeedStore.setState({ feeds: {}, permission: null });
});

test('mockup list-entry: the bell counts the unread rows of every computer as a figure', async () => {
  useAttentionFeedStore.setState({
    feeds: {
      m1: { status: 'ready', rows: [row('a', false), row('b', true), row('c', false)] },
      m2: { status: 'ready', rows: [row('d', false), row('e', true)] },
    },
  });
  await render(<SessionsBell />);
  expect(screen.getByRole('button').props.accessibilityLabel).toBe('Notifications, 3 unread');
  expect(screen.getByText('3', SHOWN)).toBeTruthy();
});

test('mockup list-entry: with every row read the bell shows no number', async () => {
  useAttentionFeedStore.setState({
    feeds: { m1: { status: 'ready', rows: [row('a', true), row('b', true)] } },
  });
  await render(<SessionsBell />);
  expect(screen.getByRole('button').props.accessibilityLabel).toBe('Notifications');
  expect(screen.queryByText(/^\d+\+?$/, SHOWN)).toBeNull();
});

test('the number follows the shared read state (a row read on the computer leaves the count)', async () => {
  useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: [row('a', false), row('b', false)] } } });
  await render(<SessionsBell />);
  expect(screen.getByText('2', SHOWN)).toBeTruthy();
  await act(() => {
    useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: [row('a', true), row('b', false)] } } });
  });
  expect(screen.getByText('1', SHOWN)).toBeTruthy();
  expect(screen.getByRole('button').props.accessibilityLabel).toBe('Notifications, 1 unread');
});
