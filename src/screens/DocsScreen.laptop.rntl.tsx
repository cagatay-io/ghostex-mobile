/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The project file browser's list (`DocsScreen`) under the app's list fold gap (nothing
 * on the fold in lists; the laptop pose only, `components/common/foldGap.tsx`), measured as `foldGap.rntl.tsx`
 * measures the Settings, Sessions and work-link lists: the list's frame comes from the jest preset's
 * `measureInWindow`, the whole 669 x 951 window of the iPhone Duo in the laptop pose, whose fold's band is
 * 455.5-495.5; a held row measures at its own frame (rows 44 pt tall, 8 pt apart from y 100, by the name they show);
 * the list's content height and its scrolls are the platform's events, fired here. Expected, by the laptop-pose
 * decision for lists (a list whose rows take their state from the screen runs across the fold, and the Files rows do):
 * the list ends at the fold's top and a copy of it, hidden from accessibility and without pull to refresh, fills the
 * frame from the fold's bottom, starting where the list ends and following its scroll, before and after a scroll; no
 * row or section title carries a gap of its own; flat (inactive division) and in the book pose the list keeps its
 * whole frame, with no copy. An open row menu stays at its row while the device folds into or out of the laptop
 * pose, because the gap moves no row. The real screen, tree and rows under the real `VerticalBarArea`; stand-ins:
 * gxserver's `runProjectDocsAction` and the native chrome.
 *
 * Not reached here: the scroll views' clipping and native scrolling (the jest preset's scroll view records `scrollTo`
 * and moves nothing) and the device's real frames.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isValidElement } from 'react';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DocsCopy } from '../copy';
import type { RootStackParamList } from '../navigation/types';
import DocsScreen from './DocsScreen';

const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;
let mockBarLayout: BarLayout | null = null;
/** The native bar layout listener: a later report is the device folding or unfolding with the screen open. */
let mockReport: ((layout: BarLayout) => void) | undefined;

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: (name: string, listener: (layout: BarLayout) => void) => {
      if (name === 'onBarLayoutChange') mockReport = listener;
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
  return { useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }), SafeAreaView: View };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useRoute: () => ({ key: 'docs' }) }));

/** The project's top level: twelve files. */
const FILES = Array.from({ length: 12 }, (_, index) => `note-${String(index).padStart(2, '0')}.txt`);
/** Folders listed before the files at the top level (none unless a test sets them). */
let mockFolders: string[] = [];
/** The Docs listing's Markdown files, newest first in Recently changed (empty unless a test sets it). */
let mockRecent: { path: string; name: string; kind: 'file'; modifiedAt: string; size: number }[] = [];
const mockRpc = (_method: string, params: Record<string, unknown>) => {
  // The project-scope listing of a folder (`src/files/`).
  if (params.action === 'list' && typeof params.path === 'string') {
    const entries =
      params.path === ''
        ? [
            ...mockFolders.map((name) => ({ path: name, name, kind: 'directory' })),
            ...FILES.map((name) => ({ path: name, name, kind: 'file', size: 100 })),
          ]
        : [];
    return Promise.resolve({ result: { action: 'list', progressive: true, entries }, error: null });
  }
  // The Docs listing behind Recently changed (`docs/client.ts` `listProjectDocs`).
  if (params.action === 'list') return Promise.resolve({ result: { entries: mockRecent }, error: null });
  return Promise.resolve({ result: { entries: [] }, error: null });
};
jest.mock('../files/machine', () => ({
  currentMachine: (id: string) => ({ id }),
  useProjectDocsRpc: () => mockRpc,
}));
jest.mock('../chat/rust/transport', () => ({
  sessionChatRpc: (_machine: unknown, method: string, params: Record<string, unknown>) => mockRpc(method, params),
}));
jest.mock('../components/sessions/cli', () => ({ runGhostexCli: () => Promise.reject(new Error('no cli')) }));

const PORTRAIT = { width: 669, height: 951 };
const LANDSCAPE = { width: 951, height: 669 };
const LAPTOP: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FLAT: FoldDivision = { ...LAPTOP, active: false };
const BOOK: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
/** Where the list's visible part ends in the laptop pose: at the fold's top, its copy continuing below the band. */
const UPPER_END = FOLD.top;
const OTHER_POSES: [string, FoldDivision, { width: number; height: number }][] = [
  ['flat', FLAT, PORTRAIT],
  ['book pose', BOOK, LANDSCAPE],
];
/** The window frame `measureInWindow` answers for the list: the whole window unless a test moves it. */
let listFrame = { top: 0, height: PORTRAIT.height };
/** The scroll command the jest preset's scroll view records (one function for every scroll view). */
const nativeScrollTo = jest.mocked(ScrollView.prototype.scrollTo);
/** Window frames of rows by the name they show: 44 pt tall, 8 pt apart from y 100. */
const frames = new Map<string, { top: number; height: number }>();
const rowFrames = (labels: string[]) =>
  labels.forEach((label, index) => frames.set(label, { top: 100 + index * 52, height: 44 }));

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

/** The text an element tree shows: strings, and the name of the file or folder a row component takes. */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isValidElement<{ children?: unknown; file?: { name?: unknown }; folder?: { name?: unknown } }>(node)) return '';
  const named = node.props.file?.name ?? node.props.folder?.name;
  return textOf(node.props.children) + (typeof named === 'string' ? named : '');
}

async function advance(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

type Props = NativeStackScreenProps<RootStackParamList, 'Docs'>;
let browserCount = 0;

/** The browser (a project of its own each time: the screen keeps each project's top level between visits). */
async function openBrowser(
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
): Promise<void> {
  mockBarLayout = barLayout(division, window);
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  browserCount += 1;
  const route: Props['route'] = {
    key: `docs-${browserCount}`,
    name: 'Docs',
    params: {
      machineId: 'machine-1',
      projectId: `project-${browserCount}`,
      projectName: 'ghostex-mobile',
      projectPath: '/Users/me/ghostex-mobile',
    },
  };
  // Of the navigator only `setOptions` (header) is called here; the stand-in is cast.
  const navigation = { setOptions: jest.fn(), push: jest.fn() } as unknown as Props['navigation'];
  await render(
    <VerticalBarArea>
      <DocsScreen navigation={navigation} route={route} />
    </VerticalBarArea>,
  );
  await screen.findByText(FILES[0] ?? '');
  await advance();
}

/** The device folds into (or out of) the laptop pose with the browser open. */
async function reportPose(division: FoldDivision): Promise<void> {
  await act(async () => {
    mockReport?.(barLayout(division, PORTRAIT));
    await jest.advanceTimersByTimeAsync(50);
  });
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
      layoutMeasurement: { width: 640, height: UPPER_END },
    },
  });
  await advance();
}

/** The list holding `text` reports its content's height, as the platform does once its rows are laid out. */
async function reportContent(text: string): Promise<void> {
  await fireEvent(scrollViewOf(text), 'contentSizeChange', 640, 1600);
  await advance();
}

/** The scroll view of the list's copy below the fold's band (hidden from accessibility), or null without a copy. */
function copyOf(text: string): TestInstance | null {
  const list = scrollViewOf(text);
  for (const row of screen.queryAllByText(text, { includeHiddenElements: true })) {
    let node: TestInstance | null = row;
    while (node !== null && node.type !== 'RCTScrollView') node = node.parent;
    if (node !== null && node !== list) return node;
  }
  return null;
}

/**
 * A top margin of fold-gap size (the band's 40 pt or more) on the list's unit showing `text` or a view around it (the
 * first match: a held row's lifted copy, drawn after the list, shows the same name).
 */
function gapAbove(text: string): number {
  const [unit] = screen.getAllByText(text);
  for (let node: TestInstance | null = unit ?? null; node !== null; node = node.parent) {
    if (node.type === 'RCTScrollView') return 0;
    const marginTop = StyleSheet.flatten(node.props.style)?.marginTop;
    if (typeof marginTop === 'number' && marginTop >= 40) return marginTop;
  }
  return 0;
}

/**
 * In the laptop pose, at rest and scrolled: the list ends at the fold's top and its copy, hidden from accessibility
 * and without pull to refresh, fills the frame from the fold's bottom at the offset where the list ends, so the rows
 * continue below the band and none is drawn on it; none of `texts` carries a gap.
 */
async function expectRunsAcross(texts: string[]): Promise<void> {
  const first = texts[0] ?? '';
  const upper = FOLD.top - listFrame.top;
  nativeScrollTo.mockClear();
  await reportContent(first);
  expect(visibleBottom(first)).toBe(UPPER_END);
  const copy = copyOf(first);
  if (copy === null) throw new Error('no copy below the fold');
  const place = copy.parent;
  expect(place?.props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  const placed = StyleSheet.flatten(place?.props.style);
  expect(listFrame.top + Number(placed?.top)).toBe(FOLD.bottom);
  expect(listFrame.top + Number(placed?.top) + Number(placed?.height)).toBe(listFrame.top + listFrame.height);
  expect(scrollViewOf(first).props.refreshControl).toBeDefined();
  expect(copy.props.refreshControl).toBeUndefined();
  expect(nativeScrollTo).toHaveBeenLastCalledWith({ animated: false, y: upper });
  for (const text of texts) expect(gapAbove(text)).toBe(0);
  await scrollTo(first, 300);
  expect(nativeScrollTo).toHaveBeenLastCalledWith({ animated: false, y: 300 + upper });
  expect(visibleBottom(first)).toBe(UPPER_END);
  for (const text of texts) expect(gapAbove(text)).toBe(0);
}

/** The window top of the held row's copy lifted above the dimmed screen (the one button named `label` with a top). */
function liftedTop(label: string): unknown {
  const tops = screen
    .getAllByRole('button', { name: label })
    .map((node) => StyleSheet.flatten(node.props.style)?.top)
    .filter((top) => top !== undefined);
  expect(tops).toHaveLength(1);
  return tops[0];
}

beforeEach(async () => {
  jest.useFakeTimers();
  nativeScrollTo.mockClear();
  frames.clear();
  mockRecent = [];
  mockFolders = [];
  listFrame = { top: 0, height: PORTRAIT.height };
  mockNativeMethods.measureInWindow.mockImplementation(function (
    this: { props: { children?: unknown } },
    onFrame: (...frame: number[]) => void,
  ) {
    const frame = frames.get(textOf(this.props.children));
    if (frame === undefined) onFrame(0, listFrame.top, PORTRAIT.width, listFrame.height);
    else onFrame(12, frame.top, 640, frame.height);
  });
  await AsyncStorage.clear();
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
  jest.useRealTimers();
});

describe('Files (the project file browser list)', () => {
  test('laptop pose: the list runs across the fold, also scrolled, and no file row carries a gap', async () => {
    await openBrowser();
    await expectRunsAcross(FILES);
  });

  test('laptop pose: with Recently changed the list runs across the fold, and no section title carries a gap', async () => {
    mockRecent = [
      { path: 'docs/plan.md', name: 'plan.md', kind: 'file', modifiedAt: new Date().toISOString(), size: 100 },
    ];
    await openBrowser();
    await screen.findByText('plan.md');
    await advance();
    await expectRunsAcross([DocsCopy.recentSection, 'plan.md', DocsCopy.foldersSection, ...FILES]);
  });

  test.each(OTHER_POSES)('%s: the list keeps its whole frame, with no copy', async (_pose, division, window) => {
    listFrame = { top: 0, height: window.height };
    await openBrowser(division, window);
    await reportContent(FILES[0] ?? '');
    expect(visibleBottom(FILES[0] ?? '')).toBe(window.height);
    expect(copyOf(FILES[0] ?? '')).toBeNull();
    for (const name of FILES) expect(gapAbove(name)).toBe(0);
  });

  test('leaving the laptop pose gives the list its whole frame with no copy, coming back runs it across the fold again', async () => {
    await openBrowser();
    await reportContent(FILES[0] ?? '');
    expect(visibleBottom(FILES[0] ?? '')).toBe(UPPER_END);
    expect(copyOf(FILES[0] ?? '')).not.toBeNull();
    await reportPose(FLAT);
    expect(visibleBottom(FILES[0] ?? '')).toBe(PORTRAIT.height);
    expect(copyOf(FILES[0] ?? '')).toBeNull();
    await reportPose(LAPTOP);
    expect(visibleBottom(FILES[0] ?? '')).toBe(UPPER_END);
    expect(copyOf(FILES[0] ?? '')).not.toBeNull();
  });
});

describe('an open row menu while the device folds', () => {
  test('a held file row: folding into the laptop pose moves no row, the lifted row stays at it', async () => {
    rowFrames(FILES);
    await openBrowser(FLAT);
    await fireEvent(screen.getByRole('button', { name: 'note-06.txt' }), 'longPress');
    expect(liftedTop(DocsCopy.openFile('note-06.txt'))).toBe(412);
    await reportPose(LAPTOP);
    expect(gapAbove('note-06.txt')).toBe(0);
    expect(liftedTop(DocsCopy.openFile('note-06.txt'))).toBe(412);
  });

  test('a held folder row: unfolding moves no row, the lifted row stays at it', async () => {
    mockFolders = Array.from({ length: 12 }, (_, index) => `dir-${String(index).padStart(2, '0')}`);
    rowFrames([...mockFolders, ...FILES]);
    await openBrowser(LAPTOP);
    await fireEvent(screen.getByRole('button', { name: 'dir-07' }), 'longPress');
    expect(liftedTop('dir-07')).toBe(464);
    await reportPose(FLAT);
    expect(gapAbove('dir-07')).toBe(0);
    expect(liftedTop('dir-07')).toBe(464);
  });
});
