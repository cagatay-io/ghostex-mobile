/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Settings pages with rows of their own under the app's list fold gap (nothing on
 * the fold in lists; the laptop pose only, `components/common/foldGap.tsx`), measured as `foldGap.rntl.tsx` measures
 * the shared Settings page: Settings › Notifications (its switch rows and the "Blocked in iOS Settings" card) and
 * Settings › Live Activity (its preview card). The page's frame comes from the jest preset's `measureInWindow`: the
 * whole 669 x 951 window of the iPhone Duo in the laptop pose, whose fold's band is 455.5-495.5. Expected: the page's
 * scroll view ends 8 pt above the fold's top (447.5), before and after a scroll, and none of its own rows carries a
 * gap of its own; flat (inactive division) and in the book pose the page keeps its whole frame and its frame measures
 * nothing. The real pages, shared controls and stores under the real `VerticalBarArea`; stand-ins: navigation, the
 * safe area, storage, the native chrome and expo-notifications.
 *
 * Not reached here: the scroll view's clipping of its rows (the platform's) and the device's real frames.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../../modules/ghostex-native/src/GhostexNative.types';
import { useBarGeometryStore } from '../../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../../components/common/verticalBar/VerticalBarArea';
import { LiveActivityCopy, NotificationsCopy } from '../../copy';
import { useInventoryStore } from '../../inventory/store';
import { useMachinesStore } from '../../machines/store';
import { useAttentionFeedStore } from '../../notifications/feedStore';
import { useSettingsStore } from '../../settings/store';
import LiveActivityPage from './LiveActivityPage';
import NotificationsPage from './NotificationsPage';

const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;
let mockBarLayout: BarLayout | null = null;

jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: () => ({ remove: () => undefined }),
    observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
    stopObservingBarLayout: () => Promise.resolve(),
  },
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }), SafeAreaView: View };
});
// The Notifications page reads the iOS permission when it comes into view; the tests set it in the store instead.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: () => undefined }),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));

const PORTRAIT = { width: 669, height: 951 };
const LANDSCAPE = { width: 951, height: 669 };
const LAPTOP: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FLAT: FoldDivision = { ...LAPTOP, active: false };
const BOOK: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
/** Where the page's visible part must end in the laptop pose: 8 pt above the fold's top. */
const ABOVE_FOLD = FOLD.top - 8;
const OTHER_POSES: [string, FoldDivision, { width: number; height: number }][] = [
  ['flat', FLAT, PORTRAIT],
  ['book pose', BOOK, LANDSCAPE],
];
/** The window frame `measureInWindow` answers: the whole window. */
let listFrame = { top: 0, height: PORTRAIT.height };

function barLayout(division: FoldDivision, window: { width: number; height: number }): BarLayout {
  return {
    windowWidth: window.width,
    windowHeight: window.height,
    safeTop: 80,
    safeLeft: 0,
    safeRight: 0,
    marginTop: 88,
    topBar: { x: 0, y: 26, width: 466, height: 44 },
    divisions: [division],
  };
}

async function advance(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

async function renderPage(
  page: ReactNode,
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
): Promise<void> {
  mockBarLayout = barLayout(division, window);
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await render(<VerticalBarArea>{page}</VerticalBarArea>);
  await advance();
}

/** The scroll view `node` scrolls in. */
function scrollViewOf(node: TestInstance): TestInstance {
  let current: TestInstance | null = node;
  while (current !== null && current.type !== 'RCTScrollView') current = current.parent;
  if (current === null) throw new Error('the node is in no scroll view');
  return current;
}

/**
 * The window y where the scroll view holding `node` ends: its frame's bottom less the room the frame keeps below it
 * (the scroll view clips its rows there).
 */
function visibleBottom(node: TestInstance): number {
  const frame = scrollViewOf(node).parent;
  const padding = frame === null ? undefined : StyleSheet.flatten(frame.props.style)?.paddingBottom;
  return listFrame.top + listFrame.height - (typeof padding === 'number' ? padding : 0);
}

/** The page's scroll view reports a scroll to `y`. */
async function scrollTo(node: TestInstance, y: number): Promise<void> {
  await fireEvent.scroll(scrollViewOf(node), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 640, height: 1600 },
      layoutMeasurement: { width: 640, height: ABOVE_FOLD },
    },
  });
  await advance();
}

/** A top margin of fold-gap size (the band's 40 pt or more) on `node` or a view around it inside its scroll view. */
function gapAbove(node: TestInstance): number {
  for (let current: TestInstance | null = node; current !== null; current = current.parent) {
    if (current.type === 'RCTScrollView') return 0;
    const marginTop = StyleSheet.flatten(current.props.style)?.marginTop;
    if (typeof marginTop === 'number' && marginTop >= 40) return marginTop;
  }
  return 0;
}

/** In the laptop pose, at rest and scrolled: the page ends above the fold, so none of `rows` is drawn on it. */
async function expectEndsAboveFold(rows: () => TestInstance[]): Promise<void> {
  const [first] = rows();
  expect(visibleBottom(first)).toBe(ABOVE_FOLD);
  for (const row of rows()) expect(gapAbove(row)).toBe(0);
  await scrollTo(first, 300);
  expect(visibleBottom(rows()[0])).toBe(ABOVE_FOLD);
  for (const row of rows()) expect(gapAbove(row)).toBe(0);
}

/**
 * How many views other than scroll views were measured: the fold frame is a plain View. The pages' keyboard-aware
 * scroll view measures itself for its own keyboard handling, in every pose.
 */
function measuredViews(): number {
  const scrollView = (context: unknown): boolean => {
    if (typeof context !== 'object' || context === null || !('props' in context)) return false;
    const { props } = context;
    return typeof props === 'object' && props !== null && 'contentContainerStyle' in props;
  };
  return mockNativeMethods.measureInWindow.mock.contexts.filter((context: unknown) => !scrollView(context)).length;
}

beforeEach(async () => {
  jest.useFakeTimers();
  listFrame = { top: 0, height: PORTRAIT.height };
  mockNativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
    onFrame(0, listFrame.top, PORTRAIT.width, listFrame.height),
  );
  await AsyncStorage.clear();
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
  jest.useRealTimers();
});

describe('Settings › Notifications (its switch rows and the blocked card)', () => {
  const copy = NotificationsCopy.settings;
  const SWITCHES = [copy.master, copy.finished, copy.waiting, copy.error];

  function seed(permission: 'granted' | 'denied'): void {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        notifications: { enabled: true, finished: true, waiting: true, error: true, askedAt: new Date().toISOString() },
      },
    }));
    // The measured caption describes a running app: the saved push record has loaded with no accepted computers.
    useAttentionFeedStore.setState({ permission, pushComputers: [] });
  }
  const switchRows = () => SWITCHES.map((name) => screen.getByRole('switch', { name }));

  test('laptop pose: the page ends above the fold, also scrolled, and no switch row carries a gap', async () => {
    seed('granted');
    await renderPage(<NotificationsPage />);
    await expectEndsAboveFold(switchRows);
  });

  test('laptop pose: with the blocked card the page ends above the fold, also scrolled, and the card carries no gap', async () => {
    seed('denied');
    await renderPage(<NotificationsPage />);
    await expectEndsAboveFold(() => [
      screen.getByText(copy.blockedTitle),
      screen.getByRole('button', { name: copy.openSettings }),
      ...switchRows(),
    ]);
  });

  test.each(OTHER_POSES)('%s: the page keeps its whole frame and its frame measures nothing', async (_pose, division, window) => {
    seed('denied');
    listFrame = { top: 0, height: window.height };
    await renderPage(<NotificationsPage />, division, window);
    expect(visibleBottom(screen.getByText(copy.blockedTitle))).toBe(window.height);
    for (const row of switchRows()) expect(gapAbove(row)).toBe(0);
    expect(measuredViews()).toBe(0);
  });
});

describe('Settings › Live Activity (its preview card)', () => {
  beforeEach(() => {
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, liveActivityEnabled: true } }));
    useMachinesStore.setState({ machines: [] });
    useInventoryStore.setState({ inventoriesByMachineId: {} });
  });
  const units = () => [
    screen.getByText(LiveActivityCopy.previewTitle),
    screen.getByLabelText(LiveActivityCopy.previewLabel),
  ];

  test('laptop pose: the page ends above the fold, also scrolled, and the preview carries no gap', async () => {
    await renderPage(<LiveActivityPage />);
    await expectEndsAboveFold(units);
  });

  test.each(OTHER_POSES)('%s: the page keeps its whole frame and its frame measures nothing', async (_pose, division, window) => {
    listFrame = { top: 0, height: window.height };
    await renderPage(<LiveActivityPage />, division, window);
    expect(visibleBottom(screen.getByLabelText(LiveActivityCopy.previewLabel))).toBe(window.height);
    expect(gapAbove(screen.getByLabelText(LiveActivityCopy.previewLabel))).toBe(0);
    expect(measuredViews()).toBe(0);
  });
});
