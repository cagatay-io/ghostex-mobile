/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Sheets, dialogs and full-screen views off the fold in the laptop pose,
 * through the shared carriers, rendered under the real `VerticalBarArea` with the system's bar layout from a
 * stand-in for the native module: a bottom sheet starts 8 pt below the fold (`useFoldSheetMaxHeight`), a centred
 * card stands below the fold when it fits there and above it otherwise (`useFoldCardPlacement`), and with the
 * keyboard up the keyboard-avoiding layer treats the fold's top as the cover's top (`laptopCoverTop`). A centred card
 * is held to its band, and what it says beyond that scrolls while its buttons stay in it. Carriers: BottomSheet,
 * ConfirmDialog, ContextMenu (centred), and the sites laid out on them: ExportTranscriptSheet, the session search
 * panel, the chat's rewind confirmation, the progress card, the chat's account-switch card (a centred card in the
 * chat's own frame, not the window's: `useFoldCardPlacement` with `measuresLayer`) and the page sheet (the computer's
 * web page ends above the fold, `foldUpperHalfInset`). Negative cases: flat (inactive division) and the book pose (no
 * layout of its own) keep every value they had. Window frames of the iPhone Duo's inner display as the simulator
 * reports them: 669 x 951 in the laptop pose, division `[0, 455.5, 669, 40]`, safe area top 80, bottom 20; the
 * keyboard's top at 555.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../../modules/ghostex-native/src/GhostexNative.types';
import { AccountSwitchCard } from '../../chat/native/cards/AccountSwitchCard';
import { PageSheet } from '../../chat/native/cards/PageSheet';
import { RewindDialog } from '../../chat/native/transcript/RewindDialog';
import type { RustChat } from '../../chat/rust/useRustChat';
import ContextMenu from '../sessions/ContextMenu';
import SessionSearchSheet from '../sessions/SessionSearchSheet';
import ExportTranscriptSheet from '../terminal/ExportTranscriptSheet';
import BottomSheet from './BottomSheet';
import ConfirmDialog from './ConfirmDialog';
import { keyboardFixture } from './keyboard/keyboardEventFixtures';
import ProgressOverlay from './ProgressOverlay';
import { useBarGeometryStore } from './verticalBar/barGeometry';
import VerticalBarArea from './verticalBar/VerticalBarArea';

/** The native methods React Native's Jest preset gives every View (`measureInWindow` measures nothing). */
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
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }),
}));
// The page sheet's boundaries: the computer's forward (answered here, or refused) and the web view itself.
let mockForward: () => Promise<{ localPort: number; gxserver: boolean }> = () => Promise.withResolvers<never>().promise;
jest.mock('../../webPreview/machineLinks', () => ({
  openComputerForward: () => mockForward(),
  holdComputerForward: () => undefined,
  releaseComputerForward: () => Promise.resolve(),
  withPageTheme: (path: string) => path,
}));
jest.mock('../../chat/rust/machine-link', () => ({
  chatMachineLink: () => ({ route: () => Promise.resolve('legacy') }),
}));
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return { WebView: () => React.createElement(View, { testID: 'page-webview' }) };
});
// The picture viewer the page opens over itself (Reanimated, whose worklets runtime does not load under Jest).
jest.mock('../../chat/native/cards/ImageViewer', () => ({ ImageViewerModal: () => null }));
// The chat transcript (its cards load Reanimated too); the rewind confirmation reads only its theme from it.
jest.mock('../../chat/native/transcript/Transcript', () => ({
  useTranscriptTheme: jest.requireActual('../../chat/native/transcript/theme').useTranscriptTheme,
}));

const PORTRAIT = { width: 669, height: 951 };
const LANDSCAPE = { width: 951, height: 669 };
const LAPTOP: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FLAT: FoldDivision = { ...LAPTOP, active: false };
const BOOK: FoldDivision = { x: 455.5, y: 0, width: 40, height: 669, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
const KEYBOARD_TOP = 555;
/** A centred card's bands in the laptop pose: below from 8 pt under the fold to 24 pt over the window's bottom. */
const BELOW_BAND = PORTRAIT.height - 24 - (FOLD.bottom + 8);
/** Above: from 8 pt under the safe area's top (80) to 8 pt over the fold. */
const ABOVE_BAND = FOLD.top - 8 - (80 + 8);
/** What a card says that is taller than either band. */
const LONG_TEXT = 'A line of confirmation text.\n'.repeat(25);
const keyboard = keyboardFixture(PORTRAIT);

async function renderIn(
  content: ReactNode,
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
): Promise<void> {
  mockBarLayout = {
    windowWidth: window.width,
    windowHeight: window.height,
    safeTop: 80,
    safeLeft: 0,
    safeRight: 0,
    marginTop: 88,
    topBar: { x: 0, y: 26, width: 466, height: 44 },
    divisions: [division],
  };
  await act(() => {
    keyboard.setScreen(window.width, window.height);
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  await render(<VerticalBarArea>{content}</VerticalBarArea>);
  await act(async () => undefined);
}

function style(instance: TestInstance | null): Record<string, unknown> {
  return (instance === null ? undefined : StyleSheet.flatten(instance.props.style)) ?? {};
}

/** The nearest view at or above `instance` whose style sets `key`. */
function withStyle(instance: TestInstance, key: string): TestInstance | null {
  let node: TestInstance | null = instance;
  while (node !== null && style(node)[key] === undefined) node = node.parent;
  return node;
}

async function cardLayout(card: TestInstance, height: number): Promise<void> {
  await fireEvent(card, 'layout', { nativeEvent: { layout: { x: 24, y: 0, width: 400, height } } });
}

/** The scroll view around `instance`, null where none carries it. */
function scrollAround(instance: TestInstance): TestInstance | null {
  let node = instance.parent;
  while (node !== null && node.type !== 'RCTScrollView') node = node.parent;
  return node;
}

/** Whether `ancestor` carries `instance`. */
function carries(ancestor: TestInstance, instance: TestInstance): boolean {
  for (let node: TestInstance | null = instance; node !== null; node = node.parent) if (node === ancestor) return true;
  return false;
}

/**
 * A card held to its band: what `scrolled` says lies in a scroll view inside the card, and each of `buttons` lies in
 * the card outside that scroll view.
 */
function expectScrollsInside(card: TestInstance, scrolled: TestInstance, buttons: string[]): void {
  const scroll = scrollAround(scrolled);
  expect(scroll).not.toBeNull();
  expect(carries(card, scroll as TestInstance)).toBe(true);
  for (const label of buttons) {
    const button = screen.getByText(label);
    expect(carries(card, button)).toBe(true);
    expect(carries(scroll as TestInstance, button)).toBe(false);
  }
}

beforeEach(async () => {
  // Every keyboard-avoiding layer here fills the window.
  mockNativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
    onFrame(0, 0, PORTRAIT.width, PORTRAIT.height),
  );
  await AsyncStorage.clear();
  await act(() => keyboard.hide(0));
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
});

describe('ConfirmDialog: a centred card below the fold when it fits, else above it', () => {
  const dialog = (
    <ConfirmDialog
      visible
      title="Delete session?"
      confirmLabel="Delete"
      onConfirm={() => undefined}
      onCancel={() => undefined}
    />
  );
  const card = () => screen.getByText('Delete session?').parent as TestInstance;

  test('a card that fits stands in the lower half: its layer centres it between 8 pt below the fold and 24 pt above the bottom', async () => {
    await renderIn(dialog);
    await cardLayout(card(), 200);
    const layer = style(card().parent);
    expect(layer.paddingTop).toBe(FOLD.bottom + 8);
    expect(layer.paddingBottom).toBe(24);
    expect(layer.justifyContent).toBe('center');
    // Held to that band.
    expect(style(card()).maxHeight).toBe(BELOW_BAND);
  });

  test('a card taller than the lower half stands in the upper half, from 8 pt below the safe area to 8 pt above the fold', async () => {
    await renderIn(dialog);
    await cardLayout(card(), 500);
    const layer = style(card().parent);
    expect(layer.paddingTop).toBe(80 + 8);
    expect(layer.paddingBottom).toBe(PORTRAIT.height - (FOLD.top - 8));
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: no fold placement, the layer centres in the whole window as before', async (_pose, division, window) => {
    await renderIn(dialog, division, window);
    await cardLayout(card(), 200);
    expect(style(card().parent).paddingTop).toBeUndefined();
    expect(style(card().parent).paddingBottom).toBeUndefined();
    expect(style(card()).maxHeight).toBeUndefined();
  });

  describe('a card taller than both bands', () => {
    const tall = (
      <ConfirmDialog
        visible
        title="Confirmation"
        body={LONG_TEXT}
        confirmLabel="Confirm"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );
    const tallCard = () => screen.getByText('Confirmation').parent as TestInstance;

    test('it has a containment path inside the band it stands in: it shrinks or is held to that band', async () => {
      await renderIn(tall);
      await cardLayout(tallCard(), 500);
      const layer = style(tallCard().parent);
      const bandHeight = PORTRAIT.height - (layer.paddingTop as number) - (layer.paddingBottom as number);
      // React Native views do not shrink by default: a card 500 pt tall must shrink or be held to the band.
      const card = style(tallCard());
      const shrinks = ((card.flexShrink as number | undefined) ?? 0) > 0;
      const held = typeof card.maxHeight === 'number' && card.maxHeight <= bandHeight;
      expect(shrinks || held).toBe(true);
    });

    test('held to the band above, its body scrolls, Cancel and Confirm stay in the card; held there it stays above', async () => {
      await renderIn(tall);
      await cardLayout(tallCard(), 500);
      expect(style(tallCard().parent).paddingTop).toBe(80 + 8);
      expect(style(tallCard()).maxHeight).toBe(ABOVE_BAND);
      expectScrollsInside(tallCard(), screen.getByText(/A line of confirmation text/), ['Cancel', 'Confirm']);
      // Held to the band it measures the band's height, which does not fit below: it does not swap bands.
      await cardLayout(tallCard(), ABOVE_BAND);
      expect(style(tallCard().parent).paddingTop).toBe(80 + 8);
      expect(style(tallCard()).maxHeight).toBe(ABOVE_BAND);
    });
  });
});

describe('the chat rewind confirmation and the progress card: held to their band, the text scrolls inside', () => {
  const rewindChat = {
    state: { document: { rewind: { preview: LONG_TEXT, description: 'Synthetic description', error: '' } } },
    dispatch: () => undefined,
  };
  const rewind = <RewindDialog chat={rewindChat as unknown as RustChat} />;
  const progress = <ProgressOverlay visible message={LONG_TEXT} />;
  /** The card around a text: the nearest view with a border radius. */
  const cardOf = (text: string | RegExp) => withStyle(screen.getByText(text), 'borderRadius') as TestInstance;

  test('rewind: held to the band above; preview and description scroll, Cancel and Rewind stay in the card', async () => {
    await renderIn(rewind);
    await cardLayout(cardOf('Rewind conversation'), 600);
    const card = cardOf('Rewind conversation');
    expect(style(card.parent).paddingTop).toBe(80 + 8);
    expect(style(card).maxHeight).toBe(ABOVE_BAND);
    expectScrollsInside(card, screen.getByText('Synthetic description'), ['Cancel', 'Rewind']);
  });

  test('progress: held to the band above; the message scrolls inside the card', async () => {
    await renderIn(progress);
    await cardLayout(cardOf(/A line of confirmation text/), 600);
    const card = cardOf(/A line of confirmation text/);
    expect(style(card).maxHeight).toBe(ABOVE_BAND);
    expectScrollsInside(card, screen.getByText(/A line of confirmation text/), []);
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: no band, no height limit, as before', async (_pose, division, window) => {
    await renderIn(rewind, division, window);
    await cardLayout(cardOf('Rewind conversation'), 600);
    expect(style(cardOf('Rewind conversation')).maxHeight).toBeUndefined();
    await screen.unmount();
    await renderIn(progress, division, window);
    await cardLayout(cardOf(/A line of confirmation text/), 600);
    expect(style(cardOf(/A line of confirmation text/)).maxHeight).toBeUndefined();
  });
});

describe('BottomSheet: starts below the fold; with the keyboard up the cover starts at the fold', () => {
  const sheet = (
    <BottomSheet visible onClose={() => undefined}>
      <Text>Paste the code</Text>
    </BottomSheet>
  );
  const panel = () => withStyle(screen.getByText('Paste the code'), 'borderTopLeftRadius') as TestInstance;

  test('keyboard down: at most as tall as the window below the fold, 8 pt clear of it', async () => {
    await renderIn(sheet);
    expect(style(panel()).maxHeight).toBe(PORTRAIT.height - FOLD.bottom - 8);
  });

  test("keyboard up: no fold limit, the keyboard-avoiding layer pads from the fold's top, not the keyboard's", async () => {
    await renderIn(sheet);
    await act(() => keyboard.show(KEYBOARD_TOP, PORTRAIT.height - KEYBOARD_TOP, 250));
    // The sheet's own limit (88 % of the space the layer leaves it).
    expect(style(panel()).maxHeight).toBe('88%');
    // The keyboard-avoiding layer rounds the covered part to whole points.
    expect(style(panel().parent).paddingBottom).toBe(Math.round(PORTRAIT.height - FOLD.top));
  });

  test('flat: its own limit, and the layer pads by the keyboard only', async () => {
    await renderIn(sheet, FLAT);
    expect(style(panel()).maxHeight).toBe('88%');
    await act(() => keyboard.show(KEYBOARD_TOP, PORTRAIT.height - KEYBOARD_TOP, 250));
    expect(style(panel().parent).paddingBottom).toBe(PORTRAIT.height - KEYBOARD_TOP);
  });
});

describe('ContextMenu (centred, no anchor): off the fold like a dialog', () => {
  const menu = (
    <ContextMenu
      visible
      title="Session"
      items={[{ kind: 'item', key: 'rename', label: 'Rename', onPress: () => undefined }]}
      onClose={() => undefined}
    />
  );
  const card = () => withStyle(screen.getByText('Session'), 'maxHeight') as TestInstance;

  test('below the fold, no taller than the lower half', async () => {
    await renderIn(menu);
    await cardLayout(card(), 160);
    expect(style(card()).maxHeight).toBe(PORTRAIT.height - 24 - (FOLD.bottom + 8));
    expect(style(card().parent).paddingTop).toBe(FOLD.bottom + 8);
  });

  test('flat: centred in the whole window as before', async () => {
    await renderIn(menu, FLAT);
    await cardLayout(card(), 160);
    // 78 % of the window between the safe area's top (80) and 20 pt above its bottom.
    expect(style(card()).maxHeight).toBeCloseTo((PORTRAIT.height - 80 - 20) * 0.78);
    expect(style(card().parent).paddingTop).toBeUndefined();
  });
});

describe('sites laid out on the carriers', () => {
  test('ExportTranscriptSheet starts 8 pt below the fold; flat it keeps its 80 % limit', async () => {
    const sheet = (
      <ExportTranscriptSheet
        visible
        sessionTitle="build"
        path="/tmp/transcript.md"
        agentLabel=""
        starting={false}
        error={null}
        onStartNewConversation={() => undefined}
        onClose={() => undefined}
      />
    );
    await renderIn(sheet);
    const panel = () => withStyle(screen.getByText('Transcript Exported'), 'maxHeight') as TestInstance;
    expect(style(panel()).maxHeight).toBe(PORTRAIT.height - FOLD.bottom - 8);
    await screen.unmount();
    await renderIn(sheet, FLAT);
    expect(style(panel()).maxHeight).toBe('80%');
  });

  test('the session search panel stays in the upper half: above the fold with the keyboard down and up', async () => {
    const search = (
      <SessionSearchSheet
        visible
        machines={[]}
        onOpen={() => undefined}
        onRestore={() => Promise.resolve()}
        onClose={() => undefined}
      />
    );
    const layer = () => (screen.getAllByLabelText('Close search')[0].parent as TestInstance) ?? null;
    await renderIn(search);
    // Keyboard down: the panel ends 8 pt above the fold.
    expect(style(layer()).paddingBottom).toBe(PORTRAIT.height - FOLD.top + 8);
    await act(() => keyboard.show(KEYBOARD_TOP, PORTRAIT.height - KEYBOARD_TOP, 250));
    // Keyboard up: 8 pt above the cover, which starts at the fold's top (rounded to whole points by the layer).
    expect(style(layer()).paddingBottom).toBe(8 + Math.round(PORTRAIT.height - FOLD.top));
    await screen.unmount();
    await act(() => keyboard.hide(0));
    await renderIn(search, FLAT);
    expect(style(layer()).paddingBottom).toBe(20 + 8);
  });
});

/**
 * The account-switch card covers the chat (not the window), so it is placed off the fold in the chat's own frame,
 * not centred across the fold. Its band is taken in the chat's frame, here window y 132 to 931 (below the header
 * row, to the home indicator's inset), read with `measureInWindow`.
 */
describe('AccountSwitchCard: off the fold in the chat it covers', () => {
  const CHAT = { top: 132, bottom: 931 };
  const FAILED_SWITCH = {
    id: 'synthetic-switch',
    phase: 'failed',
    heading: 'Switch failed',
    lede: 'Synthetic fixture',
    from: { label: 'Old account' },
    to: { label: 'New account', target: true },
    failure: 'Try again',
    dismissible: true,
    retry: { accountId: 'synthetic', busy: false },
  };
  const chat = { state: { document: { accountSwitchCard: FAILED_SWITCH } }, dispatch: () => undefined };
  const overlay = <AccountSwitchCard chat={chat as unknown as RustChat} />;
  const card = () => screen.getByLabelText('Account switch status');
  // The layer between the backdrop and the scroll view, the one view whose style sets `flex`.
  const layer = () => withStyle(card(), 'flex') as TestInstance;
  /** The scroll view's content container style (the one that pads and centres the card). */
  function scrollContent(): Record<string, unknown> {
    let node: TestInstance | null = card();
    while (node !== null && node.props.contentContainerStyle === undefined) node = node.parent;
    return StyleSheet.flatten(node?.props.contentContainerStyle) ?? {};
  }

  async function placeCard(height: number): Promise<void> {
    mockNativeMethods.measureInWindow.mockImplementation((onFrame: (...frame: number[]) => void) =>
      onFrame(0, CHAT.top, PORTRAIT.width, CHAT.bottom - CHAT.top),
    );
    await fireEvent(layer(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 669, height: 799 } } });
    await cardLayout(card(), height);
  }

  test('a card that fits stands below the fold: its band runs from 8 pt below the fold to 24 pt above the chat bottom', async () => {
    await renderIn(overlay);
    await placeCard(200);
    expect(style(layer()).paddingTop).toBe(FOLD.bottom + 8 - CHAT.top);
    expect(style(layer()).paddingBottom).toBe(24);
    expect(style(layer()).justifyContent).toBe('center');
    // The band carries the margins; the scroll content adds none, so Close and Retry stay inside it.
    expect(scrollContent().paddingVertical).toBe(0);
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.getByText('Retry switch')).toBeTruthy();
  });

  test('a card taller than the lower band stands above the fold, from 8 pt below the chat top to 8 pt over the fold', async () => {
    await renderIn(overlay);
    await placeCard(500);
    expect(style(layer()).paddingTop).toBe(8);
    expect(style(layer()).paddingBottom).toBe(CHAT.bottom - (FOLD.top - 8));
  });

  test('keyboard up: above the fold, whatever its height', async () => {
    await renderIn(overlay);
    await act(() => keyboard.show(KEYBOARD_TOP, PORTRAIT.height - KEYBOARD_TOP, 250));
    await placeCard(200);
    expect(style(layer()).paddingTop).toBe(8);
    expect(style(layer()).paddingBottom).toBe(CHAT.bottom - (FOLD.top - 8));
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: centred in the whole chat as before', async (_pose, division, window) => {
    await renderIn(overlay, division, window);
    await placeCard(200);
    expect(style(layer()).paddingTop).toBeUndefined();
    expect(style(layer()).paddingBottom).toBeUndefined();
    expect(scrollContent().paddingVertical).toBe(24);
  });
});

/**
 * The published page in the page sheet has controls of its own the app cannot move off
 * the knick. In the laptop pose the page area (the web view and its loading and failure states) ends 8 pt above the
 * fold, with the keyboard down and up. The page area's frame: window y 129 (under the safe area and the 49 pt bar)
 * to 931 (the home indicator's inset).
 */
describe('PageSheet: the page stays in the upper half', () => {
  const PAGE = { top: 129, bottom: 931 };
  const machine = { id: 'm1', host: 'synthetic.invalid', username: 'synthetic', port: 22 };
  const sheet = (
    <PageSheet
      chat={{ state: null, dispatch: () => undefined } as unknown as RustChat}
      machine={machine}
      page={{ scheme: 'http', remotePort: 7000, host: '127.0.0.1', path: '/synthetic-page' }}
      onClose={() => undefined}
      onOpenLink={() => undefined}
    />
  );
  const area = () => screen.getByTestId('page-area');

  async function layOutPage(): Promise<void> {
    await fireEvent(area().parent as TestInstance, 'layout', {
      nativeEvent: { layout: { x: 0, y: PAGE.top, width: 669, height: PAGE.bottom - PAGE.top } },
    });
  }

  function inArea(element: TestInstance): boolean {
    for (let node: TestInstance | null = element; node !== null; node = node.parent) if (node === area()) return true;
    return false;
  }

  afterEach(() => {
    mockForward = () => Promise.withResolvers<never>().promise;
  });

  test('the web view and its loading state end 8 pt above the fold, with the keyboard down and up', async () => {
    mockForward = () => Promise.resolve({ localPort: 4100, gxserver: true });
    await renderIn(sheet);
    await layOutPage();
    expect(inArea(screen.getByTestId('page-webview'))).toBe(true);
    expect(style(area()).marginBottom).toBe(PAGE.bottom - (FOLD.top - 8));
    await act(() => keyboard.show(KEYBOARD_TOP, PORTRAIT.height - KEYBOARD_TOP, 250));
    expect(style(area()).marginBottom).toBe(PAGE.bottom - (FOLD.top - 8));
  });

  test('the failure state with Retry centres in the same upper area', async () => {
    mockForward = () => Promise.reject(new Error('synthetic refusal'));
    await renderIn(sheet);
    await layOutPage();
    expect(inArea(screen.getByRole('button', { name: 'Retry' }))).toBe(true);
    expect(style(area()).marginBottom).toBe(PAGE.bottom - (FOLD.top - 8));
  });

  test.each([
    ['flat', FLAT, PORTRAIT],
    ['book pose', BOOK, LANDSCAPE],
  ])('%s: the page fills the sheet below its bar as before', async (_pose, division, window) => {
    mockForward = () => Promise.resolve({ localPort: 4100, gxserver: true });
    await renderIn(sheet, division, window);
    await layOutPage();
    expect(style(area()).marginBottom).toBeUndefined();
  });
});
