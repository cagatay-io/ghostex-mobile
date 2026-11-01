/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/wall/SessionWall.rntl.tsx`. The session wall: on the iPhone Duo's inner display
 * (flat or half folded) the Sessions list switches between list and tiles; every tile shows its session's newest lines
 * and a status badge; a tap opens the session as its list row does. Folded there are no tiles and no switch. The real
 * Sessions screen renders under the real `VerticalBarArea`, the system's bar layout coming from a stand-in for the
 * native module, with the real settings, terminal, machine, inventory and collapse stores. Mocked are the boundaries
 * only: the native module, the computer's screen read (`tailClient.ts`), storage, haptics, the safe area, navigation
 * focus, the voice button and notifications.
 *
 * Device-only, not shown here: the frames the device reports, the look against the design, the real
 * computer's answer and what the reads cost on the network.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Dimensions, StyleSheet, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../../modules/ghostex-native/src/GhostexNative.types';
import { useBarGeometryStore } from '../../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../../components/common/verticalBar/VerticalBarArea';
import { useCollapseStore } from '../../components/sessions/collapseStore';
import { parseMobileSummary } from '../../contract/mobileSummary';
import { useInventoryStore, type MachineInventory } from '../../inventory/store';
import { useMachinesStore, type MachineRecord } from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { useUnifiedListStore } from '../sessions-screen/use-unified-list';
import { EMPTY_UNIFIED_FILTER } from '../../contract/unified/build';
import { attachSessionKey, useTerminalStore } from '../../terminal/sessions';
import SessionsScreen from '../SessionsScreen';
import type { Preview } from './previews';
import { useWallPreviewStore } from './previews';

/** The computer's screen read: two lines naming the session. */
const readLines = (_machine: { id: string }, _projectId: string, sessionId: string): Promise<Preview> =>
  Promise.resolve({ kind: 'lines', lines: [`${sessionId} first line`, `${sessionId} newest line`] });
const mockRead = jest.fn(readLines);
let mockBarLayout: BarLayout | null = null;
let mockReport: ((layout: BarLayout) => void) | null = null;
let mockFocused = true;

jest.mock('./tailClient', () => ({
  readSessionTail: (...args: [{ id: string }, string, string]) => mockRead(...args),
}));
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: new Proxy(
    {
      addListener: (event: string, listener: (layout: BarLayout) => void) => {
        if (event === 'onBarLayoutChange') mockReport = listener;
        return { remove: () => undefined };
      },
      observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
      isTailscaleConnected: () => Promise.resolve(true),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => Promise.resolve()) },
  ),
  GhostexTerminalView: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('expo-notifications', () => ({}));
// The screen also holds the Unified list (on in the Unified tests below), whose swipe rows need Reanimated's native
// runtime: a plain row.
jest.mock('../machines-screen/SwipeRevealRow', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, SWIPE_REVEAL_WIDTH: 176 };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }), SafeAreaView: View };
});
jest.mock('../../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => mockFocused,
  useFocusEffect: () => undefined,
}));

type Window = { width: number; height: number };

const UPRIGHT: Window = { width: 669, height: 951 };
const TURNED: Window = { width: 951, height: 669 };
const FOLDED_WINDOW: Window = { width: 466, height: 678 };
/** Unfolded flat, upright: the fold across the inner display, not bent. */
const FLAT_UPRIGHT: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: false };
/** Unfolded flat, turned: the fold down the middle. */
const FLAT_TURNED: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: false };
/** Half folded like a laptop. */
const LAPTOP: FoldDivision = { ...FLAT_UPRIGHT, active: true };
/** Where a list that stays above the fold ends half folded like a laptop: 8 pt above the fold's top. */
const ABOVE_FOLD = LAPTOP.y - 8;
/** Where a list running across the fold ends half folded like a laptop: at the fold's top, its copy below the band. */
const UPPER_END = LAPTOP.y;

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Studio Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

function wireSession(sessionId: string, title: string, overrides: object = {}) {
  return {
    sessionId,
    projectId: 'p1',
    title,
    agentIcon: 'claude',
    agentName: 'Claude',
    status: 'running',
    activity: 'idle',
    isLive: true,
    provider: 'zmx',
    ...overrides,
  };
}

const SUMMARY = parseMobileSummary(
  JSON.stringify({
    ok: true,
    projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
    sessions: [
      wireSession('a', 'Alpha', { activity: 'working' }),
      wireSession('b', 'Beta', { activity: 'attention' }),
      wireSession('c', 'Gamma', { pendingQuestionCount: 1 }),
    ],
  }),
);

const navigation = { navigate: jest.fn(), setOptions: () => undefined };
const initialSettings = useSettingsStore.getState().settings;
const appStateListeners: ((state: AppStateStatus) => void)[] = [];
const realAttachSession = useTerminalStore.getState().attachSession;
/** The jest preset's `measureInWindow`, which answers nothing unless a test says what. */
const measureInWindow = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default.measureInWindow;

/** Turned, the system stands its bar at the trailing edge and the header goes into it (the side bar). */
const RAIL_TURNED: BarLayout = {
  windowWidth: 951,
  windowHeight: 669,
  safeTop: 10,
  safeLeft: 0,
  safeRight: 81,
  marginTop: 18,
  edge: 'trailing',
  sideBar: { x: 880, y: 116, width: 46, height: 520 },
  topBar: { x: 0, y: 10, width: 870, height: 44 },
  divisions: [FLAT_TURNED],
};

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

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

/** The scroll view of the list that holds the row named `testID`. */
function listOf(testID: string | RegExp): TestInstance {
  let node: TestInstance | null = screen.getByTestId(testID) as TestInstance;
  while (node !== null && node.type !== 'RCTScrollView') node = node.parent;
  if (node === null) throw new Error(`${String(testID)} is in no scroll view`);
  return node;
}

/**
 * The window y where the list holding `testID` ends, its frame measured as the whole `window`: the frame's bottom less
 * the room the frame keeps below its scroll view (the scroll view clips its rows there).
 */
function visibleBottomOf(testID: string | RegExp, window: Window): number {
  const padding = StyleSheet.flatten(listOf(testID).parent?.props.style)?.paddingBottom;
  return window.height - (typeof padding === 'number' ? padding : 0);
}

/** The list holding `testID` reports a scroll. */
async function scrollList(testID: string | RegExp): Promise<void> {
  await fireEvent.scroll(listOf(testID), {
    nativeEvent: {
      contentOffset: { x: 0, y: 300 },
      contentSize: { width: 640, height: 1600 },
      layoutMeasurement: { width: 640, height: ABOVE_FOLD },
    },
  });
  await settle();
}

/** The list holding `testID` reports its content's height, as the platform does once its rows are laid out. */
async function reportContent(testID: string | RegExp): Promise<void> {
  await fireEvent(listOf(testID), 'contentSizeChange', 640, 1600);
  await settle();
}

/** How often the row named `testID` is drawn: once, or twice with the list's copy below the fold (hidden). */
function drawn(testID: string | RegExp): number {
  return screen.queryAllByTestId(testID, { includeHiddenElements: true }).length;
}

async function renderScreen(
  window: Window,
  divisions: FoldDivision[],
  layout: BarLayout = barLayout(window, divisions),
): Promise<void> {
  mockBarLayout = layout;
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await render(
    <VerticalBarArea>
      <SessionsScreen navigation={navigation as never} route={{ key: 'sessions', name: 'Sessions' } as never} />
    </VerticalBarArea>,
  );
  await settle();
}

/** The device folded, unfolded or turned: the window's new size, then the bar layout's report. */
async function changeWindow(window: Window, divisions: FoldDivision[]): Promise<void> {
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await act(async () => {
    mockReport?.(barLayout(window, divisions));
  });
  await settle();
}

async function press(label: string | RegExp): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
  await settle();
}

const tile = (label: RegExp) => screen.queryByLabelText(label);
const readSessions = () => mockRead.mock.calls.map(([, , sessionId]) => sessionId);
/** The sessions that hold a thumbnail. */
const previewKeys = () => Object.keys(useWallPreviewStore.getState().previews).sort();
const storedView = async () => JSON.parse((await AsyncStorage.getItem('settings.v1')) ?? '{}').sessionListView;

beforeEach(async () => {
  jest.useFakeTimers();
  mockRead.mockReset().mockImplementation(readLines);
  navigation.navigate.mockClear();
  mockFocused = true;
  mockReport = null;
  appStateListeners.length = 0;
  // The preset's AppState has no state of its own; the app starts in front.
  const appState = AppState as { currentState: AppStateStatus };
  appState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    const subscription: NativeEventSubscription = { remove: () => undefined };
    return subscription;
  });
  await AsyncStorage.clear();
  useSettingsStore.setState({ hydrated: true, settings: { ...initialSettings, sessionListView: 'list' } });
  useWallPreviewStore.setState({ previews: {} });
  useMachinesStore.setState({ machines: [MACHINE], selectedMachineId: 'm1' });
  useInventoryStore.setState({
    inventoriesByMachineId: {
      m1: {
        summary: SUMMARY,
        serverSummary: SUMMARY,
        lastError: null,
        lastErrorCode: null,
        hasLoaded: true,
        refreshing: false,
        retrying: false,
        fingerprint: null,
        loadedAt: 0,
      } as MachineInventory,
    },
  });
  useCollapseStore.setState({ expandedProjectsByMachine: { m1: ['id:p1'] } });
  useTerminalStore.setState({
    tabs: [],
    selectedSessionKey: null,
    sessionViewModeBySessionKey: {},
    attachSession: realAttachSession,
  });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  measureInWindow.mockReset();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the switch between list and tiles', () => {
  test('unfolded upright: the header offers list and tiles, the list shows, nothing is read', async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    expect(screen.getByLabelText('Show as list').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Show as tiles').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(tile(/^Alpha, /)).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
  });

  test('tiles chosen: every session of the open project is a tile with its badge; the choice is kept', async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    expect(screen.getByLabelText('Show as tiles').props.accessibilityState).toMatchObject({ selected: true });
    expect(tile(/^Alpha, Working$/)).toBeTruthy();
    expect(tile(/^Beta, Waiting$/)).toBeTruthy();
    expect(tile(/^Gamma, Has a question$/)).toBeTruthy();
    // The project header with its controls stays above its tiles, the computer's tab above the list.
    expect(screen.getByText('ghostex-mobile')).toBeTruthy();
    expect(screen.getByText('Studio Mac')).toBeTruthy();
    expect(await storedView()).toBe('tiles');
    // Back to the list.
    await press('Show as list');
    expect(tile(/^Alpha, /)).toBeNull();
    expect(await storedView()).toBe('list');
  });

  test.each([true, false])('an open question card follows its computer capability in the tile (%s)', async (announced) => {
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        capabilities: announced ? { awaitingAnswer: true } : {},
        projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
        sessions: [
          wireSession('omp', 'Omp', {
            agent: 'omp',
            agentName: 'OMP',
            activity: 'attention',
            awaitingAnswer: true,
            pendingQuestionCount: 0,
          }),
          wireSession('asked', 'Asked', { activity: 'attention', pendingQuestionCount: 1 }),
        ],
      }),
    );
    expect(summary?.sessions).toHaveLength(2);
    const inventory = useInventoryStore.getState().inventoriesByMachineId.m1;
    useInventoryStore.setState({ inventoriesByMachineId: { m1: { ...inventory, summary, serverSummary: summary } } });
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    expect(screen.getByRole('button', { name: `Omp, ${announced ? 'Has a question' : 'Waiting'}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Asked, Has a question' })).toBeTruthy();
    if (!announced) expect(screen.queryByRole('button', { name: 'Omp, Has a question' })).toBeNull();
  });

  test('a worktree session its parent project lists keeps its branch in the tile, as its row has it, also for VoiceOver', async () => {
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        worktreeSessionsInProject: true,
        projects: [
          { projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' },
          {
            projectId: 'wt',
            name: 'ghostex-mobile-review',
            path: '/work/ghostex-mobile-review',
            worktree: { parentProjectId: 'p1', name: 'review', branch: 'feature/review' },
          },
        ],
        sessions: [
          wireSession('a', 'Alpha', { activity: 'working' }),
          wireSession('w', 'Review', { projectId: 'wt', activity: 'working' }),
        ],
      }),
    );
    const inventory = useInventoryStore.getState().inventoriesByMachineId.m1;
    useInventoryStore.setState({ inventoriesByMachineId: { m1: { ...inventory, summary, serverSummary: summary } } });
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    // The list's row under the parent project names the branch.
    expect(screen.getByLabelText('In worktree feature/review')).toBeTruthy();
    await press('Show as tiles');
    expect(tile(/^Review, Working, In worktree feature\/review$/)).toBeTruthy();
    expect(screen.getByText('feature/review')).toBeTruthy();
    // A session in the parent project itself names no worktree.
    expect(tile(/^Alpha, Working$/)).toBeTruthy();
  });

  test('half folded like a laptop the switch is offered too', async () => {
    await renderScreen(UPRIGHT, [LAPTOP]);
    expect(screen.getByLabelText('Show as tiles')).toBeTruthy();
  });

  test('turned, with the header in the side bar, list and tiles stand there as switches', async () => {
    await renderScreen(TURNED, [FLAT_TURNED], RAIL_TURNED);
    const tiles = screen.getByLabelText('Show as tiles');
    expect(tiles.props.accessibilityRole).toBe('switch');
    expect(tiles.props.accessibilityState).toMatchObject({ checked: false });
    // A side bar button reports its window frame with the press (for a menu it opens).
    measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) => onFrame(880, 116, 46, 46));
    await press('Show as tiles');
    expect(screen.getByLabelText('Show as tiles').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('Show as list').props.accessibilityState).toMatchObject({ checked: false });
    expect(tile(/^Alpha, Working$/)).toBeTruthy();
  });

  test('folded: no switch and no tiles, even with tiles chosen; unfolding shows the tiles again', async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, sessionListView: 'tiles' } });
    await renderScreen(FOLDED_WINDOW, []);
    expect(screen.queryByLabelText('Show as tiles')).toBeNull();
    expect(screen.queryByLabelText('Show as list')).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(tile(/^Alpha, /)).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    // No tile read: every read of the wall's own lands in its preview store. The folded triage reads the two
    // screen lines of the waiting "Beta" for its short-reply card through the same read; that one is not the wall's.
    expect(useWallPreviewStore.getState().previews).toEqual({});
    expect(readSessions()).toEqual(['b']);
    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    expect(tile(/^Alpha, Working$/)).toBeTruthy();
  });
});

describe('the live thumbnails', () => {
  test("each tile shows its session's newest lines; a working session is read again while shown", async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    expect(readSessions().sort()).toEqual(['a', 'b', 'c']);
    expect(mockRead.mock.calls[0]?.[0]).toMatchObject({ id: 'm1' });
    expect(screen.getByText('a newest line')).toBeTruthy();
    expect(screen.getByText('b first line')).toBeTruthy();
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(readSessions()).toEqual(['a']);
  });

  test('a screen the computer cannot read shows "No preview"', async () => {
    mockRead.mockImplementation(() => Promise.resolve({ kind: 'unavailable' }));
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    expect(screen.getAllByText('No preview')).toHaveLength(3);
  });

  test('a thumbnail goes with its tile: a closed session, the list shown again, the screen gone', async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    expect(previewKeys()).toEqual(['m1:a', 'm1:b', 'm1:c']);
    // Gamma closed on the computer.
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
        sessions: [
          wireSession('a', 'Alpha', { activity: 'working' }),
          wireSession('b', 'Beta', { activity: 'attention' }),
        ],
      }),
    );
    const inventory = useInventoryStore.getState().inventoriesByMachineId.m1;
    await act(async () => {
      useInventoryStore.setState({ inventoriesByMachineId: { m1: { ...inventory, summary, serverSummary: summary } } });
    });
    await settle();
    expect(previewKeys()).toEqual(['m1:a', 'm1:b']);
    // Another screen in front keeps the thumbnails of the tiles it will show again.
    mockFocused = false;
    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    expect(previewKeys()).toEqual(['m1:a', 'm1:b']);
    mockFocused = true;
    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    // Back to the list: no tile, no thumbnail.
    await press('Show as list');
    expect(previewKeys()).toEqual([]);
    await press('Show as tiles');
    expect(previewKeys()).toEqual(['m1:a', 'm1:b']);
    await act(async () => screen.unmount());
    expect(previewKeys()).toEqual([]);
  });

  test('another screen in front, or the app in the background, stops the reads; back in front they resume', async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    mockRead.mockClear();
    // The app goes to the background.
    await act(async () => appStateListeners.forEach((listener) => listener('background')));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    await settle();
    expect(readSessions().sort()).toEqual(['a', 'b', 'c']);
    // A screen pushed over Sessions (the terminal) takes the focus.
    mockRead.mockClear();
    mockFocused = false;
    await changeWindow(UPRIGHT, [FLAT_UPRIGHT]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
  });
});

describe('opening a session from a tile', () => {
  test('a tap opens the session exactly as its list row does (chat view here)', async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await act(async () => {
      fireEvent.press(screen.getByText('Beta'));
    });
    await settle();
    const fromRow = navigation.navigate.mock.calls.slice();
    const tabsFromRow = useTerminalStore.getState().tabs;
    expect(fromRow).toEqual([
      ['Terminal', { sessionKey: attachSessionKey('m1', 'b'), machineId: 'm1', title: 'Beta' }],
    ]);

    useTerminalStore.setState({ tabs: [], selectedSessionKey: null });
    navigation.navigate.mockClear();
    await press('Show as tiles');
    await press(/^Beta(, |$)/);
    expect(navigation.navigate.mock.calls).toEqual(fromRow);
    expect(useTerminalStore.getState().tabs).toEqual(tabsFromRow);
  });

  test('a session set to its terminal attaches first, then opens, from a tile as from a row', async () => {
    const attachSession = jest.fn(() => Promise.resolve(attachSessionKey('m1', 'a')));
    useTerminalStore.setState({
      attachSession,
      sessionViewModeBySessionKey: { [attachSessionKey('m1', 'a')]: 'terminal' },
    });
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    await press(/^Alpha, Working$/);
    expect(attachSession).toHaveBeenCalledWith(MACHINE, { sessionId: 'a', projectId: 'p1', title: 'Alpha' });
    expect(navigation.navigate).toHaveBeenCalledWith('Terminal', {
      sessionKey: attachSessionKey('m1', 'a'),
      machineId: 'm1',
      title: 'Alpha',
    });
  });

  test("a long press opens the session's menu, as on its row", async () => {
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Show as tiles');
    measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) => onFrame(12, 300, 300, 260));
    await act(async () => {
      fireEvent(screen.getByLabelText(/^Beta, Waiting$/), 'longPress');
    });
    await settle();
    // The row's menu: titled with the session, its first command Rename.
    expect(screen.getByLabelText('Close menu')).toBeTruthy();
    expect(screen.getAllByText('Beta')).toHaveLength(2);
    expect(screen.getByText('Rename')).toBeTruthy();
  });
});

describe('half folded like a laptop', () => {
  test('the list of tiles runs across the fold, also scrolled, and no row of tiles carries a gap', async () => {
    // The list's frame in the window is the whole upright window; the fold's band is 455.5-495.5. The list's item
    // keys end in the session id. The classic list's rows take their state from the screen, so by the laptop-pose
    // decision for lists it ends at the fold's top and its copy below the band, hidden from accessibility, goes on.
    measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
      onFrame(0, 0, UPRIGHT.width, UPRIGHT.height),
    );
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, sessionListView: 'tiles' } });
    await renderScreen(UPRIGHT, [LAPTOP]);
    await settle();
    const row = (session: string) => new RegExp(`^wall-row-session:.*:${session}$`);
    const marginTops = () =>
      ['a', 'b', 'c'].map(
        (session) => StyleSheet.flatten((screen.getByTestId(row(session)) as TestInstance).props.style)?.marginTop,
      );
    await reportContent(row('a'));
    expect(visibleBottomOf(row('a'), UPRIGHT)).toBe(UPPER_END);
    expect(drawn(row('a'))).toBe(2);
    expect(marginTops()).toEqual([undefined, undefined, undefined]);
    await scrollList(row('a'));
    expect(visibleBottomOf(row('a'), UPRIGHT)).toBe(UPPER_END);
    expect(marginTops()).toEqual([undefined, undefined, undefined]);
  });
});

describe("in the Unified list (the computer's Sidebar set to Unified)", () => {
  /** The same three sessions, with the computer asking for the Unified sidebar. */
  function useUnified(groupByProject: boolean): void {
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        sidebarView: 'unified',
        unifiedGroupByProject: groupByProject,
        projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
        sessions: [
          wireSession('a', 'Alpha', { activity: 'working' }),
          wireSession('b', 'Beta', { activity: 'attention' }),
          wireSession('c', 'Gamma', { pendingQuestionCount: 1 }),
        ],
      }),
    );
    const inventory = useInventoryStore.getState().inventoriesByMachineId.m1;
    useInventoryStore.setState({ inventoriesByMachineId: { m1: { ...inventory, summary, serverSummary: summary } } });
    useUnifiedListStore.setState({
      hydrated: true,
      filter: EMPTY_UNIFIED_FILTER,
      toggledShelves: [],
      foldedGroups: [],
    });
  }

  /** The Unified cards (named by their title alone) in the order the list draws them. */
  const cardTitles = () =>
    screen.queryAllByLabelText(/^(Alpha|Beta|Gamma)$/).map((node) => node.props.accessibilityLabel);
  /** The tiles (named by title and status) in the order the wall draws them. */
  const tileTitles = () =>
    screen.queryAllByLabelText(/^(Alpha|Beta|Gamma), /).map((node) => node.props.accessibilityLabel.split(',')[0]);

  test("tiles chosen: the Unified list's sessions become tiles in its order, under its group and shelf headers", async () => {
    useUnified(true);
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    // The Moving shelf starts folded (upstream's default); opened, every session has its card.
    await press('Moving (1)');
    const listOrder = cardTitles();
    expect(listOrder.slice().sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    await press('Show as tiles');
    expect(cardTitles()).toEqual([]);
    expect(tileTitles()).toEqual(listOrder);
    // The project group's header and the Moving shelf's header stay above their tiles.
    expect(screen.getByLabelText('ghostex-mobile (3)')).toBeTruthy();
    expect(screen.getByLabelText('Moving (1)')).toBeTruthy();
    // Each tile shows its session's newest lines, as in the classic list.
    expect(screen.getByText('a newest line')).toBeTruthy();
    expect(screen.getByText('b first line')).toBeTruthy();
  });

  test("a tile's status is the Unified card's word, so it matches the list", async () => {
    useUnified(false);
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Moving (1)');
    await press('Show as tiles');
    expect(tile(/^Alpha, Working$/)).toBeTruthy();
    expect(tile(/^Beta, Done$/)).toBeTruthy();
    expect(tile(/^Gamma, Question$/)).toBeTruthy();
    // The card's status slot carries the word as its label and draws only the icon (no status word in the sidebar).
    expect(screen.getByLabelText('Done')).toBeTruthy();
    expect(screen.getByLabelText('Question')).toBeTruthy();
  });

  test('only the tiles on screen are read: a folded shelf or group is not, the list is not', async () => {
    useUnified(true);
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
    await press('Show as tiles');
    // The Moving shelf starts folded: Alpha, working, has no tile and is not read.
    expect(readSessions().sort()).toEqual(['b', 'c']);
    expect(tile(/^Alpha, /)).toBeNull();
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
    // The shelf opened: Alpha's tile is read, and again every 5 s while it works.
    await press('Moving (1)');
    expect(readSessions()).toEqual(['a']);
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(readSessions()).toEqual(['a']);
    // The shelf folded again: no more reads.
    await press('Moving (1)');
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
    // The group folded: no tile, no read.
    await press('ghostex-mobile (3)');
    expect(tileTitles()).toEqual([]);
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
    // Back to the list (group open): nothing is read.
    await press('ghostex-mobile (3)');
    await press('Show as list');
    mockRead.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(mockRead).not.toHaveBeenCalled();
  });

  test('a tap opens the session as its Unified card does; a long press opens the Unified menu', async () => {
    useUnified(false);
    await renderScreen(UPRIGHT, [FLAT_UPRIGHT]);
    await press('Beta');
    const fromCard = navigation.navigate.mock.calls.slice();
    const tabsFromCard = useTerminalStore.getState().tabs;
    expect(fromCard).toEqual([
      ['Terminal', { sessionKey: attachSessionKey('m1', 'b'), machineId: 'm1', title: 'Beta' }],
    ]);

    useTerminalStore.setState({ tabs: [], selectedSessionKey: null });
    navigation.navigate.mockClear();
    await press('Show as tiles');
    // Opened, Beta no longer waits, so its tile is named by its title and whatever its card now says.
    await press(/^Beta(, |$)/);
    expect(navigation.navigate.mock.calls).toEqual(fromCard);
    expect(useTerminalStore.getState().tabs).toEqual(tabsFromCard);

    measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) => onFrame(12, 300, 300, 260));
    await act(async () => {
      fireEvent(screen.getByLabelText(/^Beta(, |$)/), 'longPress');
    });
    await settle();
    // The Unified card's menu: Rename, and Snooze, which only the Unified list's menu offers.
    expect(screen.getByLabelText('Close menu')).toBeTruthy();
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Snooze')).toBeTruthy();
  });

  test('half folded like a laptop the Unified list of tiles ends above the fold, also scrolled, and no row of tiles carries a gap', async () => {
    // The list's frame in the window is the whole upright window; the fold's band is 455.5-495.5. A row of tiles is
    // named by its first tile's Unified row id (`<computer>|<session>`).
    measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
      onFrame(0, 0, UPRIGHT.width, UPRIGHT.height),
    );
    useUnified(false);
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, sessionListView: 'tiles' } });
    await renderScreen(UPRIGHT, [LAPTOP]);
    await settle();
    expect(screen.queryAllByTestId(/^wall-row-/).map((row) => row.props.testID)).toEqual([
      'wall-row-m1|b',
      'wall-row-m1|c',
    ]);
    const marginTop = (session: string) =>
      StyleSheet.flatten((screen.getByTestId(`wall-row-m1|${session}`) as TestInstance).props.style)?.marginTop;
    await reportContent('wall-row-m1|b');
    expect(visibleBottomOf('wall-row-m1|b', UPRIGHT)).toBe(ABOVE_FOLD);
    expect(drawn('wall-row-m1|b')).toBe(1);
    expect([marginTop('b'), marginTop('c')]).toEqual([undefined, undefined]);
    await scrollList('wall-row-m1|b');
    expect(visibleBottomOf('wall-row-m1|b', UPRIGHT)).toBe(ABOVE_FOLD);
    expect([marginTop('b'), marginTop('c')]).toEqual([undefined, undefined]);
  });
});
