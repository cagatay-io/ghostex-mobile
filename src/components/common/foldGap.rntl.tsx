/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The list fold gap (the approved mockups: "half folded, nothing on the fold in lists";
 * the laptop pose only) measured in real lists under the real `VerticalBarArea`: a Settings page
 * (`SettingsPageScrollView` with its shared row controls), the Sessions list's blocks (`DrawerBlockView` project
 * cards in a list wired like `SessionsScreen`'s: provider, `onScroll`, `scrollEventThrottle`), the Unified sessions
 * list (`useUnifiedList`'s cards and headers in the screen's own `SessionList`), the switch between the classic and
 * the Unified list after scrolling (`SessionList`) and the work-link picker's list. Each
 * unit's window frame comes from the jest preset's `measureInWindow`, answered per unit from the
 * text it shows: rows 44 pt tall, 8 pt apart from y 100, so the seventh (412-456) touches the fold's band
 * (455.5-495.5 in the iPhone Duo's 669 x 951 laptop window). Expected: that unit (or the heading right above it)
 * starts 4 pt below the band; flat (inactive division) and the book pose nothing moves. Leaving the laptop pose for
 * flat or the book pose while a measurement is queued or still waiting for its native frames leaves no gap behind,
 * and back in the laptop pose the gap is placed again (the system's bar layout reports the new pose).
 *
 * Not reached here: the rest of `SessionsScreen` (the screen needs a computer's inventory to render; its list is
 * `SessionList`, rendered here), scrolling beyond the scroll event the list reports (the gap is measured at the
 * list's top only) and the device's real frames.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import { Dimensions, FlatList, StyleSheet, Text } from 'react-native';
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
import { Caption, SectionHeader, SettingsPageScrollView } from '../../screens/settings/SettingsControls';
import { FoldGapProvider, FoldGapView, useFoldGapList } from './foldGap';
import { useBarGeometryStore } from './verticalBar/barGeometry';
import { useLaptopFold } from './verticalBar/laptopFold';
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
/** Window frames by the text a unit shows: rows 44 pt tall, 8 pt apart from y 100. */
const frames = new Map<string, { top: number; height: number }>();
const rowFrames = (labels: string[]) =>
  labels.forEach((label, index) => frames.set(label, { top: 100 + index * 52, height: 44 }));
/** While set, the native frame reads are held here unanswered (a measurement still running). */
let heldFrames: (() => void)[] | null = null;

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

/** The text an element tree shows (strings, the `title` or `label` a row component takes, a Unified card's title). */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isValidElement(node)) return '';
  const props = node.props as {
    children?: unknown;
    title?: unknown;
    label?: unknown;
    row?: { session?: { source?: { displayTitle?: unknown } } };
  };
  const cardTitle = props.row?.session?.source?.displayTitle;
  return (
    textOf(props.children) +
    (typeof props.title === 'string' ? props.title : '') +
    (typeof props.label === 'string' ? props.label : '') +
    (typeof cardTitle === 'string' ? cardTitle : '')
  );
}

async function renderIn(
  content: ReactNode,
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
  { settle = true }: { settle?: boolean } = {},
): Promise<void> {
  mockBarLayout = barLayout(division, window);
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await render(<VerticalBarArea>{content}</VerticalBarArea>);
  // The units register, then measure after the next frame (`settle: false` leaves that frame queued).
  await act(async () => undefined);
  if (settle) await advance();
}

async function advance(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

/** The system reports a new pose: React Native's window first, then the bar layout with its division. */
async function reportPose(division: FoldDivision, window: { width: number; height: number }): Promise<void> {
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
    mockReport?.(barLayout(division, window));
  });
}

const LEAVING: [string, FoldDivision, { width: number; height: number }][] = [
  ['flat', FLAT, PORTRAIT],
  ['book pose', BOOK, LANDSCAPE],
];

/**
 * The pose leaves the laptop while the list's measurement is under way, `queued` (its frame has not run yet) or
 * `running` (the native frame reads have not answered yet). Expected (the gap
 * belongs to the laptop pose only): no unit keeps or gets a gap afterwards, and back in the laptop pose the crossing
 * unit gets its gap again. `rowsOnTimer`: the list loads its rows on a timer (the picker), so the queued frame is the
 * one its rows asked for once they are on screen.
 */
async function expectNoGapAfterLeaving(
  race: 'queued' | 'running',
  content: ReactNode,
  labels: string[],
  crossing: string,
  to: FoldDivision,
  window: { width: number; height: number },
  { rowsOnTimer = false }: { rowsOnTimer?: boolean } = {},
): Promise<void> {
  rowFrames(labels);
  if (race === 'running') heldFrames = [];
  await renderIn(content, LAPTOP, PORTRAIT, { settle: race === 'running' });
  if (race === 'queued' && rowsOnTimer) {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  }
  if (race === 'running') {
    // The second frame of a list that loads its rows (the picker) is held as well.
    await advance();
    expect(heldFrames?.length).toBeGreaterThan(0);
  }
  expect(screen.getByText(crossing)).toBeTruthy();
  await reportPose(to, window);
  const answers = heldFrames ?? [];
  heldFrames = null;
  await act(() => answers.forEach((answer) => answer()));
  await advance();
  for (const label of labels) expect(gapAbove(label)).toBe(0);
  await reportPose(LAPTOP, PORTRAIT);
  await advance();
  expect(gapAbove(crossing)).toBe(FOLD.bottom + 4 - 412);
}

/** The extra top margin a unit showing `text` carries (the gap), 0 when none of its views has one. */
function gapAbove(text: string): number {
  let node: TestInstance | null = screen.getByText(text);
  while (node !== null) {
    const marginTop = StyleSheet.flatten(node.props.style)?.marginTop;
    if (typeof marginTop === 'number' && marginTop >= 40) return marginTop;
    node = node.parent;
  }
  return 0;
}

beforeEach(async () => {
  jest.useFakeTimers();
  frames.clear();
  mockNativeMethods.measureInWindow.mockImplementation(function (
    this: { props: { children?: unknown } },
    onFrame: (...frame: number[]) => void,
  ) {
    const frame = frames.get(textOf(this.props.children));
    const answer = () =>
      frame === undefined ? onFrame(0, 0, PORTRAIT.width, PORTRAIT.height) : onFrame(12, frame.top, 640, frame.height);
    if (heldFrames === null) answer();
    else heldFrames.push(answer);
  });
  await AsyncStorage.clear();
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  heldFrames = null;
  mockNativeMethods.measureInWindow.mockReset();
  jest.useRealTimers();
});

describe('Settings (SettingsPageScrollView and the shared row controls)', () => {
  const LABELS = Array.from({ length: 12 }, (_, index) => `Setting ${index}`);
  const page = (
    <SettingsPageScrollView>
      {LABELS.map((label) => (
        <Caption key={label}>{label}</Caption>
      ))}
    </SettingsPageScrollView>
  );

  test('laptop pose: the row that would cross the fold starts 4 pt below it, the rows before it stay', async () => {
    rowFrames(LABELS);
    await renderIn(page);
    expect(gapAbove('Setting 6')).toBe(FOLD.bottom + 4 - 412);
    expect(gapAbove('Setting 5')).toBe(0);
  });

  test('a section title right above that row moves with it', async () => {
    rowFrames(LABELS.slice(0, 6));
    frames.set('Later', { top: 408, height: 20 });
    frames.set('Setting 6', { top: 432, height: 44 });
    await renderIn(
      <SettingsPageScrollView>
        {LABELS.slice(0, 6).map((label) => (
          <Caption key={label}>{label}</Caption>
        ))}
        <SectionHeader title="Later" />
        <Caption>Setting 6</Caption>
      </SettingsPageScrollView>,
    );
    expect(gapAbove('Later')).toBe(FOLD.bottom + 4 - 408);
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: nothing moves', async (_pose, division, window) => {
    rowFrames(LABELS);
    await renderIn(page, division, window);
    for (const label of LABELS) expect(gapAbove(label)).toBe(0);
  });

  describe.each(['queued', 'running'] as const)('leaving the laptop pose with the measurement %s', (race) => {
    test.each(LEAVING)('to %s: no gap stays or comes back late', async (_pose, division, window) => {
      await expectNoGapAfterLeaving(race, page, LABELS, 'Setting 6', division, window);
    });
  });
});

describe('Sessions (DrawerBlockView blocks in a list wired like SessionsScreen)', () => {
  const PROJECTS = Array.from({ length: 10 }, (_, index) => `Project ${index}`);
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

  function SessionsList() {
    const foldGap = useFoldGapList(useLaptopFold());
    return (
      <FoldGapProvider value={foldGap}>
        <FlatList
          data={blocks}
          keyExtractor={(block) => block.listKey}
          onScroll={foldGap.onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
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
          )}
        />
      </FoldGapProvider>
    );
  }

  test('laptop pose: the project card that would cross the fold starts 4 pt below it', async () => {
    rowFrames(PROJECTS);
    await renderIn(<SessionsList />);
    expect(gapAbove('Project 6')).toBe(FOLD.bottom + 4 - 412);
    expect(gapAbove('Project 5')).toBe(0);
  });

  test('flat: nothing moves', async () => {
    rowFrames(PROJECTS);
    await renderIn(<SessionsList />, FLAT);
    for (const title of PROJECTS) expect(gapAbove(title)).toBe(0);
  });

  describe.each(['queued', 'running'] as const)('leaving the laptop pose with the measurement %s', (race) => {
    test.each(LEAVING)('to %s: no gap stays or comes back late', async (_pose, division, window) => {
      await expectNoGapAfterLeaving(race, <SessionsList />, PROJECTS, 'Project 6', division, window);
    });
  });
});

describe("the Unified sessions list (useUnifiedList cards and headers in the screen's SessionList)", () => {
  const TITLES = Array.from({ length: 10 }, (_, index) => `Session ${index}`);
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
  /** One computer asking for the Unified sidebar: one project, ten idle sessions, newest first. */
  const inventory = (groupByProject: boolean): MachineInventory => {
    const now = Date.now();
    const summary = parseMobileSummary(
      JSON.stringify({
        ok: true,
        sidebarView: 'unified',
        unifiedGroupByProject: groupByProject,
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
  const INVENTORIES = { listed: { [MACHINE.id]: inventory(false) }, grouped: { [MACHINE.id]: inventory(true) } };

  function UnifiedList({ groupByProject = false }: { groupByProject?: boolean }) {
    const unified = useUnifiedList({
      machines: MACHINES,
      selectedMachine: MACHINE,
      inventoriesByMachineId: groupByProject ? INVENTORIES.grouped : INVENTORIES.listed,
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

  test('laptop pose: the card that would cross the fold starts 4 pt below it, the cards before it stay', async () => {
    rowFrames(TITLES);
    await renderIn(<UnifiedList />);
    expect(gapAbove('Session 6')).toBe(FOLD.bottom + 4 - 412);
    expect(gapAbove('Session 5')).toBe(0);
  });

  test("a project group's header right above that card moves with it", async () => {
    frames.set('Ghostex', { top: 382, height: 30 });
    TITLES.forEach((title, index) => frames.set(title, { top: 412 + index * 52, height: 44 }));
    await renderIn(<UnifiedList groupByProject />);
    expect(gapAbove('Ghostex')).toBe(FOLD.bottom + 4 - 382);
    expect(gapAbove('Session 0')).toBe(0);
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: nothing moves', async (_pose, division, window) => {
    rowFrames(TITLES);
    await renderIn(<UnifiedList />, division, window);
    for (const title of TITLES) expect(gapAbove(title)).toBe(0);
  });

  describe.each(['queued', 'running'] as const)('leaving the laptop pose with the measurement %s', (race) => {
    test.each(LEAVING)('to %s: no gap stays or comes back late', async (_pose, division, window) => {
      await expectNoGapAfterLeaving(race, <UnifiedList />, TITLES, 'Session 6', division, window);
    });
  });
});

describe("switching between the classic and the Unified list (the screen's SessionList)", () => {
  const CLASSIC = Array.from({ length: 10 }, (_, index) => `Project ${index}`);
  const UNIFIED = Array.from({ length: 10 }, (_, index) => `Card ${index}`);
  const unit = ({ item }: { item: string }) => (
    <FoldGapView kind="row">
      <Text>{item}</Text>
    </FoldGapView>
  );
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
    const list = {
      renderItem: unit,
      keyExtractor: (item: string) => item,
      ListHeaderComponent: ListLife,
      testID: 'list',
    };
    return <SessionList unified={on ? { ...list, data: UNIFIED } : null} classic={{ ...list, data: CLASSIC }} />;
  }
  async function switchTo(unified: boolean): Promise<void> {
    await act(() => showUnified?.(unified));
    await advance();
  }
  /** The list reports a scroll to `y` (its scroll view's event). */
  async function scrollTo(y: number): Promise<void> {
    await fireEvent.scroll(screen.getByTestId('list'), {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 640, height: 1000 },
        layoutMeasurement: { width: 640, height: 800 },
      },
    });
    await advance();
  }

  beforeEach(() => {
    lists = { mounted: 0, unmounted: 0 };
  });

  test('flat: a switch mounts the other list, and switching back mounts the first one again', async () => {
    rowFrames(CLASSIC);
    await renderIn(<SwitchingList />, FLAT);
    expect(lists).toEqual({ mounted: 1, unmounted: 0 });
    await switchTo(true);
    expect(lists).toEqual({ mounted: 2, unmounted: 1 });
    await switchTo(false);
    expect(lists).toEqual({ mounted: 3, unmounted: 2 });
  });

  test('laptop pose: after scrolling, the list switched to and the list switched back to each start their crossing row below the fold', async () => {
    rowFrames(CLASSIC);
    rowFrames(UNIFIED);
    await renderIn(<SwitchingList />);
    expect(gapAbove('Project 6')).toBe(FOLD.bottom + 4 - 412);
    await scrollTo(52);
    await switchTo(true);
    expect(gapAbove('Card 6')).toBe(FOLD.bottom + 4 - 412);
    for (const label of UNIFIED.filter((label) => label !== 'Card 6')) expect(gapAbove(label)).toBe(0);
    await scrollTo(52);
    await switchTo(false);
    expect(gapAbove('Project 6')).toBe(FOLD.bottom + 4 - 412);
    for (const label of CLASSIC.filter((label) => label !== 'Project 6')) expect(gapAbove(label)).toBe(0);
  });
});

describe('the work-link picker (a full-screen view with a list)', () => {
  const LABELS = Array.from({ length: 10 }, (_, index) => `#${index + 100}`);
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

  test('laptop pose: the candidate row that would cross the fold starts 4 pt below it', async () => {
    rowFrames(LABELS);
    await renderIn(picker);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(gapAbove('#106')).toBe(FOLD.bottom + 4 - 412);
    expect(gapAbove('#105')).toBe(0);
  });

  test('flat: nothing moves', async () => {
    rowFrames(LABELS);
    await renderIn(picker, FLAT);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    for (const label of LABELS) expect(gapAbove(label)).toBe(0);
  });

  describe.each(['queued', 'running'] as const)('leaving the laptop pose with the measurement %s', (race) => {
    test.each(LEAVING)('to %s: no gap stays or comes back late', async (_pose, division, window) => {
      await expectNoGapAfterLeaving(race, picker, LABELS, '#106', division, window, { rowsOnTimer: true });
    });
  });
});
