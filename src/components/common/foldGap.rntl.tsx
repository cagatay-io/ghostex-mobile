/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Nothing on the fold in lists (the designs: "half folded, nothing on the fold in
 * lists"; the laptop pose only, the book pose has no layout of its own): in the laptop pose a list's scroll view ends
 * above the fold, so no row is drawn on it, at rest or scrolled; flat and in the book pose nothing changes. Real lists
 * under the real `VerticalBarArea`: a Settings page (`SettingsPageScrollView` with its shared row controls), the
 * Sessions screen's classic list (`DrawerBlockView` project cards) and Unified list (`useUnifiedList`'s cards) in the
 * screen's own `SessionList`, the switch between the two, and the work-link picker's list. The list's frame comes
 * from the jest preset's `measureInWindow`: the whole 669 x 951 window of the iPhone Duo in the laptop pose, whose
 * fold's band is 455.5-495.5. Expected: the scroll view's visible part ends 8 pt above the fold's top (447.5), before
 * and after a scroll.
 *
 * Not reached here: the rest of `SessionsScreen` (the screen needs a computer's inventory to render; its list is
 * `SessionList`, rendered here), the scroll view's clipping of its rows (the platform's) and the device's real frames.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../../modules/ghostex-native/src/GhostexNative.types';
import type { ProjectHeaderItem } from '../../contract/grouping';
import { parseMobileSummary } from '../../contract/mobileSummary';
import type { MachineInventory } from '../../inventory/store';
import type { MachineRecord } from '../../machines/store';
import type { DrawerBlock } from '../sessions/drawerModel';
import DrawerBlockView, { type DrawerBlockActions } from '../../screens/sessions-screen/DrawerBlockView';
import WorkLinkPicker, { type WorkLinkCandidates } from '../../screens/sessions-screen/work-link-picker';
import { SessionList } from '../../screens/sessions-screen/session-list';
import { useUnifiedList } from '../../screens/sessions-screen/use-unified-list';
import { Caption, SettingsPageScrollView } from '../../screens/settings/SettingsControls';
import { FoldListFrame } from './foldGap';
import { useBarGeometryStore } from './verticalBar/barGeometry';
import VerticalBarArea from './verticalBar/VerticalBarArea';

const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;
let mockBarLayout: BarLayout | null = null;
/** The system's bar layout reports after the first answer (a fold, an unfold, a turn). */
let mockReport: ((layout: BarLayout) => void) | null = null;

jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: (_event: string, listener: (layout: BarLayout) => void) => {
      mockReport = listener;
      return { remove: () => undefined };
    },
    observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
    stopObservingBarLayout: () => Promise.resolve(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }),
    SafeAreaView: View,
  };
});
// The Unified cards' swipe (gesture handler and Reanimated, not set up under jest) is not what is measured here: the
// row shows its card as a plain View.
jest.mock('../../screens/machines-screen/SwipeRevealRow', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: ({ children }: { children?: ReactNode }) => createElement(View, null, children) };
});

const PORTRAIT = { width: 669, height: 951 };
const LANDSCAPE = { width: 951, height: 669 };
const LAPTOP: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FLAT: FoldDivision = { ...LAPTOP, active: false };
const BOOK: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
/** Where the list's visible part must end in the laptop pose: 8 pt above the fold's top. */
const ABOVE_FOLD = FOLD.top - 8;
/** The window frame `measureInWindow` answers: the whole window unless a test moves it. */
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

function setWindow(window: { width: number; height: number }): void {
  Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
}

async function renderIn(
  content: ReactNode,
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
): Promise<void> {
  mockBarLayout = barLayout(division, window);
  await act(() => setWindow(window));
  await render(<VerticalBarArea>{content}</VerticalBarArea>);
  await advance();
}

async function advance(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

/** The system reports a new pose: React Native's window first, then the bar layout with its division. */
async function reportPose(division: FoldDivision, window: { width: number; height: number }): Promise<void> {
  await act(() => {
    setWindow(window);
    mockReport?.(barLayout(division, window));
  });
  await advance();
}

/** The scroll view a row showing `text` scrolls in. */
function scrollViewOf(text: string): TestInstance {
  let node: TestInstance | null = screen.getByText(text);
  while (node !== null && node.type !== 'RCTScrollView') node = node.parent;
  if (node === null) throw new Error(`${text} is in no scroll view`);
  return node;
}

/**
 * The window y where the scroll view holding `text` ends: its frame's bottom less the room the frame keeps below it
 * (the scroll view clips its rows there).
 */
function visibleBottom(text: string): number {
  const frame = scrollViewOf(text).parent;
  const padding = frame === null ? undefined : StyleSheet.flatten(frame.props.style)?.paddingBottom;
  return listFrame.top + listFrame.height - (typeof padding === 'number' ? padding : 0);
}

/** The list's scroll view reports a scroll to `y`. */
async function scrollTo(text: string, y: number): Promise<void> {
  await fireEvent.scroll(scrollViewOf(text), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 640, height: 1600 },
      layoutMeasurement: { width: 640, height: ABOVE_FOLD },
    },
  });
  await advance();
}

/** In the laptop pose, at rest and scrolled: the list ends above the fold, so no row is drawn on it. */
async function expectEndsAboveFold(text: string): Promise<void> {
  expect(visibleBottom(text)).toBe(ABOVE_FOLD);
  await scrollTo(text, 300);
  expect(visibleBottom(text)).toBe(ABOVE_FOLD);
}

const OTHER_POSES: [string, FoldDivision, { width: number; height: number }][] = [
  ['flat', FLAT, PORTRAIT],
  ['book pose', BOOK, LANDSCAPE],
];

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

describe('Settings (SettingsPageScrollView and the shared row controls)', () => {
  const LABELS = Array.from({ length: 30 }, (_, index) => `Setting ${index}`);
  const page = (
    <SettingsPageScrollView>
      {LABELS.map((label) => (
        <Caption key={label}>{label}</Caption>
      ))}
    </SettingsPageScrollView>
  );

  test('laptop pose: the page ends above the fold, also scrolled', async () => {
    await renderIn(page);
    await expectEndsAboveFold('Setting 0');
  });

  test.each(OTHER_POSES)('%s: the page keeps its whole frame and nothing is measured', async (_pose, division, window) => {
    listFrame = { top: 0, height: window.height };
    await renderIn(page, division, window);
    expect(visibleBottom('Setting 0')).toBe(window.height);
    expect(mockNativeMethods.measureInWindow).not.toHaveBeenCalled();
  });

  test.each(OTHER_POSES)('leaving the laptop pose for %s gives the page its whole frame, coming back ends it above the fold', async (_pose, division, window) => {
    await renderIn(page);
    expect(visibleBottom('Setting 0')).toBe(ABOVE_FOLD);
    listFrame = { top: 0, height: window.height };
    await reportPose(division, window);
    expect(visibleBottom('Setting 0')).toBe(window.height);
    listFrame = { top: 0, height: PORTRAIT.height };
    await reportPose(LAPTOP, PORTRAIT);
    expect(visibleBottom('Setting 0')).toBe(ABOVE_FOLD);
  });
});

describe("the Sessions screen's classic list (DrawerBlockView blocks in SessionList)", () => {
  const PROJECTS = Array.from({ length: 20 }, (_, index) => `Project ${index}`);
  const header = (title: string): ProjectHeaderItem => ({
    type: 'PROJECT_HEADER',
    key: `project:${title}`,
    machineId: 'm1',
    projectKey: title,
    projectId: title,
    legacyGroupId: '',
    title,
    projectPath: `/work/${title}`,
    collapsed: true,
    sessionCount: 0,
    workingCount: 0,
    attentionCount: 0,
    questionCount: 0,
    approvalCount: 0,
    backgroundWorkCount: 0,
    sleepingCount: 0,
    awakeCount: 0,
    containsActive: false,
    icon: { imageDataUrl: '', discoveredIconDataUrl: '', glyph: '', glyphColor: '', isWorktree: false },
    themeColor: '',
    agents: [],
    quickActions: [],
  });
  const blocks: DrawerBlock[] = PROJECTS.map((title) => ({
    kind: 'project',
    listKey: title,
    machineId: 'm1',
    card: { header: header(title), children: [] },
  }));
  const noAction = new Proxy({}, { get: () => () => undefined }) as DrawerBlockActions;
  const appearance = {
    background: '#121212',
    foreground: '#ffffff',
    muted: '#888888',
    card: '#1c1c1c',
    cardActive: '#262626',
    border: '#333333',
    projectCard: '#1a1a1a',
    projectBorder: '#2a2a2a',
  };
  const classic = (
    <SessionList
      unified={null}
      classic={{
        data: blocks,
        keyExtractor: (block) => block.listKey,
        renderItem: ({ item }) => (
          <DrawerBlockView
            block={item}
            selectedSessionKey={null}
            appearance={appearance}
            rowSurface="#1c1c1c"
            groupsOpacityPercent={100}
            summary={null}
            voiceCallSessionKey={null}
            primaryAgent={() => null}
            hideStateCard={() => false}
            actions={noAction}
          />
        ),
      }}
    />
  );

  test('laptop pose: the list ends above the fold, also scrolled', async () => {
    await renderIn(classic);
    await expectEndsAboveFold('Project 0');
  });

  test.each(OTHER_POSES)('%s: the list keeps its whole frame', async (_pose, division, window) => {
    listFrame = { top: 0, height: window.height };
    await renderIn(classic, division, window);
    expect(visibleBottom('Project 0')).toBe(window.height);
  });
});

describe("the Unified sessions list (useUnifiedList cards in the screen's SessionList)", () => {
  const TITLES = Array.from({ length: 20 }, (_, index) => `Session ${index}`);
  const MACHINE: MachineRecord = {
    id: 'm1',
    name: 'studio',
    host: 'studio.local',
    username: 'me',
    port: 22,
    savePassword: false,
    lastConnectedAt: null,
  };
  const MACHINES = [MACHINE];
  const NO_WORKSPACES: Record<string, string> = {};
  /** One computer asking for the Unified sidebar: one project, twenty idle sessions, newest first. */
  const inventory = (): MachineInventory => {
    const now = Date.now();
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        sidebarView: 'unified',
        unifiedGroupByProject: false,
        projects: [{ projectId: 'P1', name: 'Ghostex', path: '/work/Ghostex' }],
        sessions: TITLES.map((title, index) => ({
          sessionId: `s${index}`,
          projectId: 'P1',
          title,
          status: 'idle',
          activity: 'idle',
          isLive: true,
          provider: 'zmx',
          createdAt: new Date(now - 86_400_000).toISOString(),
          lastInteractionAt: new Date(now - (index + 1) * 60_000).toISOString(),
        })),
      }),
    );
    return {
      summary,
      serverSummary: summary,
      lastError: null,
      lastErrorCode: null,
      hasLoaded: true,
      refreshing: false,
      retrying: false,
      fingerprint: null,
    };
  };
  /** Built once, so every render reads the same summaries (as the screen's inventory store hands them out). */
  const INVENTORIES = { [MACHINE.id]: inventory() };

  function UnifiedList() {
    const unified = useUnifiedList({
      machines: MACHINES,
      selectedMachine: MACHINE,
      inventoriesByMachineId: INVENTORIES,
      selectedWorkspaceIdByMachine: NO_WORKSPACES,
      selectedSessionKey: null,
      sidebarBackground: '#121212',
      setOverlay: () => undefined,
      attach: () => Promise.resolve(),
      runBulkSessionActions: () => Promise.resolve(),
      snoozeSession: () => Promise.resolve(),
      openAddProject: () => undefined,
    });
    return (
      <SessionList
        unified={{ data: unified.items, keyExtractor: unified.keyExtractor, renderItem: unified.renderItem }}
        classic={{ data: [], renderItem: () => null }}
      />
    );
  }

  test('laptop pose: the list ends above the fold, also scrolled', async () => {
    await renderIn(<UnifiedList />);
    await expectEndsAboveFold('Session 0');
  });

  test.each(OTHER_POSES)('%s: the list keeps its whole frame', async (_pose, division, window) => {
    listFrame = { top: 0, height: window.height };
    await renderIn(<UnifiedList />, division, window);
    expect(visibleBottom('Session 0')).toBe(window.height);
  });
});

describe("switching between the classic and the Unified list (the screen's SessionList)", () => {
  const CLASSIC = Array.from({ length: 10 }, (_, index) => `Project ${index}`);
  const UNIFIED = Array.from({ length: 10 }, (_, index) => `Card ${index}`);
  const unit = ({ item }: { item: string }) => <Text>{item}</Text>;
  let lists = { mounted: 0, unmounted: 0 };
  /** Mounted with the list it heads, so it counts the list's own mounts. */
  function ListLife() {
    useEffect(() => {
      lists.mounted += 1;
      return () => {
        lists.unmounted += 1;
      };
    }, []);
    return null;
  }
  let showUnified: ((on: boolean) => void) | null = null;
  /** The computer's sidebar setting (or the selected machine tab) switching the screen between its two lists. */
  function SwitchingList() {
    const [on, setOn] = useState(false);
    showUnified = setOn;
    // Keyed by row as the screen's lists are (`listKey`, the Unified row id), so no row stands in for another.
    const list = { renderItem: unit, keyExtractor: (item: string) => item, ListHeaderComponent: ListLife };
    return <SessionList unified={on ? { ...list, data: UNIFIED } : null} classic={{ ...list, data: CLASSIC }} />;
  }
  async function switchTo(unified: boolean): Promise<void> {
    await act(() => showUnified?.(unified));
    await advance();
  }

  beforeEach(() => {
    lists = { mounted: 0, unmounted: 0 };
  });

  test('flat: a switch mounts the other list, and switching back mounts the first one again', async () => {
    await renderIn(<SwitchingList />, FLAT);
    expect(lists).toEqual({ mounted: 1, unmounted: 0 });
    await switchTo(true);
    expect(lists).toEqual({ mounted: 2, unmounted: 1 });
    await switchTo(false);
    expect(lists).toEqual({ mounted: 3, unmounted: 2 });
  });

  test('laptop pose: after scrolling, the list switched to and the list switched back to each end above the fold', async () => {
    await renderIn(<SwitchingList />);
    await expectEndsAboveFold('Project 0');
    await switchTo(true);
    await expectEndsAboveFold('Card 0');
    await switchTo(false);
    await expectEndsAboveFold('Project 0');
  });
});

describe('the work-link picker (a full-screen view with a list)', () => {
  const LABELS = Array.from({ length: 20 }, (_, index) => `#${index + 100}`);
  const candidates: WorkLinkCandidates = {
    multiSelect: false,
    linked: [],
    notice: '',
    candidates: LABELS.map((label) => ({ value: label, label, title: '', detail: '', linked: false })),
  };
  const picker = (
    <WorkLinkPicker
      kind="pullRequest"
      sessionTitle="build"
      load={() => Promise.resolve(candidates)}
      onPick={() => undefined}
      onCancel={() => undefined}
    />
  );

  test('laptop pose: the candidate list ends above the fold, also scrolled', async () => {
    // Below the picker's header and search field.
    listFrame = { top: 150, height: PORTRAIT.height - 170 };
    await renderIn(picker);
    await advance();
    await expectEndsAboveFold('#100');
  });

  test('flat: the candidate list keeps its whole frame', async () => {
    listFrame = { top: 150, height: PORTRAIT.height - 170 };
    await renderIn(picker, FLAT);
    await advance();
    expect(visibleBottom('#100')).toBe(PORTRAIT.height - 20);
  });
});

describe('a window change with the same fold', () => {
  const LABEL = 'Row';
  function FixedFoldList() {
    return (
      <FoldListFrame fold={FOLD}>
        <ScrollView>
          <Text>{LABEL}</Text>
        </ScrollView>
      </FoldListFrame>
    );
  }

  test('a list an ancestor stretched over the fold, without a layout of its own, then ends above it', async () => {
    await act(() => setWindow(PORTRAIT));
    listFrame = { top: 100, height: 300 };
    await render(<FixedFoldList />);
    await advance();
    expect(visibleBottom(LABEL)).toBe(400);
    // The new window stretches the list to 100-600, across the band; its own layout event does not come.
    listFrame = { top: 100, height: 500 };
    await act(() => setWindow({ ...PORTRAIT, height: PORTRAIT.height + 50 }));
    await advance();
    expect(visibleBottom(LABEL)).toBe(ABOVE_FOLD);
  });
});
