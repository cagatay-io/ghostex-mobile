/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The attention list as it is drawn (rows with kind, agent and project, newest first;
 * account rows are rows; opening an unread row marks it read on the computer; a needsInput row of a session with a
 * pending question says "has a question"), with the notifications design: its list state (the desktop's
 * "Unread" and "Read" groups) and state row-menu (a long press opens Open Session, Mark as Read / Unread and Clear at
 * the held row, the row lifted above the dimmed screen; `rowMenuOrigin`). Accessibility: each command, the lifted row
 * and a Close menu button are their own accessibility elements, none grouped into an ancestor that iOS would read as
 * one element.
 *
 * The real `AttentionList`, row model, `ContextMenu` and stores; mocked are the boundaries only: the native
 * module, expo-notifications, storage, the safe area and the computer's feed endpoint (`updateAttentionFeed`,
 * `refreshAttentionFeeds`). The test renderer lays nothing out, so the held row's window frame comes from the
 * native `measureInWindow` and the menu card's height from a fired `onLayout`. Window: an iPhone 17 (402x874).
 */

import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { NotificationsCopy } from '../copy';
import type { GhostexMobileSummary } from '../contract/mobileSummary';
import { useInventoryStore, type MachineInventory } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { SidebarPalette } from '../theme/palette';
import { useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import { resolveAppearance } from '../theme/useAppearance';
import AttentionList from './AttentionList';
import type { FeedRow } from './feedContract';
import { updateAttentionFeed, useAttentionFeedStore } from './feedStore';

/** The native methods React Native's Jest preset gives every View (`measureInWindow` measures nothing). */
const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('./feedStore', () => ({
  ...jest.requireActual('./feedStore'),
  updateAttentionFeed: jest.fn(() => Promise.resolve(true)),
  refreshAttentionFeeds: jest.fn(() => Promise.resolve()),
}));

const update = jest.mocked(updateAttentionFeed);

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac mini',
  host: 'mac-mini.local',
  username: 'owner',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

function feedRow(id: string, minutes: number, fields: Partial<FeedRow>): FeedRow {
  return {
    id,
    projectId: 'p1',
    sessionId: `s-${id}`,
    kind: 'finished',
    title: '',
    subtitle: '',
    agentName: 'claude',
    createdAt: new Date(Date.now() - minutes * 60_000).toISOString(),
    read: false,
    ...fields,
  };
}

/** The feed as the computer sends it, newest first (the design's feed, one row more for each question source). */
const FEED: FeedRow[] = [
  // "Has a question" through the session list: needsInput, its session has two pending questions.
  feedRow('n1', 1, { kind: 'needsInput', sessionId: 's1' }),
  feedRow('n2', 6, { kind: 'failed', sessionId: 's6' }),
  feedRow('n3', 14, {
    kind: 'resetExpiring',
    sessionId: 'account:work',
    accountId: 'work',
    title: 'Claude reset expires in 22 hours',
    subtitle: 'Claude · Work',
    agentName: '',
  }),
  feedRow('n4', 21, { kind: 'finished', sessionId: 's3' }),
  feedRow('n5', 60, { kind: 'finished', sessionId: 's4', read: true }),
  // needsInput of a session without a pending question: "waiting".
  feedRow('n6', 120, { kind: 'needsInput', sessionId: 's2', read: true }),
  // needsInput of a session with an open question card, from a computer that announces that field: "has a question".
  feedRow('n7', 180, { kind: 'needsInput', sessionId: 's9', subtitle: 'ghostex', read: true }),
];

function session(
  sessionId: string,
  agent: string,
  projectName: string,
  displayTitle: string,
  pendingQuestionCount = 0,
  awaitingAnswer = false,
) {
  return {
    sessionId,
    projectId: 'p1',
    projectName,
    displayTitle,
    agent,
    agentName: agent,
    pendingQuestionCount,
    awaitingAnswer,
  };
}

// A partial session list: the cast holds for the fields the attention list shows from it (each session's id,
// agent, project, title and question fields, and the summary's capabilities); the rest stays unset.
const SUMMARY = {
  agents: [],
  capabilities: { awaitingAnswer: true, attentionNotificationId: true },
  sessions: [
    session('s1', 'Claude Code', 'ghostex-mobile', 'Duo layout spike', 2),
    session('s6', 'Codex', 'ghostex-mobile', 'Theme notices'),
    session('s3', 'Claude Code', 'ghostex', 'Feed stream'),
    session('s4', 'Codex', 'ghostex-mobile', 'Key repeat'),
    session('s2', 'Codex', 'ghostex-mobile', 'Pad tests'),
    session('s9', 'Claude Code', 'ghostex', 'Spec notes', 0, true),
  ],
} as unknown as GhostexMobileSummary;

/** The held row's frame in window points: a full-width row 200 pt from the top, 72 pt tall. */
const ROW_FRAME = { x: 0, y: 200, width: 402, height: 72 };

const rowIds = (within: { getAllByTestId: typeof screen.getAllByTestId }) =>
  within.getAllByTestId(/^attention-row-/).map((node) => String(node.props.testID).replace('attention-row-', ''));

/** A group: its header's container. */
const group = (title: string) => {
  const header = screen.getByRole('header', { name: title });
  if (header.parent === null) throw new Error(`no group around ${title}`);
  return header.parent;
};

/**
 * The menu card's position style: the nearest container of a menu command that has a `maxHeight`. A command
 * is a button on iOS (React Native's `menuitem` has no role there; `ContextMenu.tsx`).
 */
function cardStyle(item: string) {
  let card = screen.getByRole('button', { name: item }).parent;
  while (card !== null && StyleSheet.flatten(card.props.style)?.maxHeight === undefined) card = card.parent;
  if (card === null) throw new Error('no menu card');
  return { card, style: StyleSheet.flatten(card.props.style) };
}

/** Ancestors iOS reads as one accessibility element together with `node` (React Native's `accessible`). */
function groupingAncestors(node: TestInstance) {
  const grouping: string[] = [];
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    if (parent.props.accessible === true) grouping.push(String(parent.props.accessibilityLabel ?? parent.type));
  }
  return grouping;
}

/** The open menu's commands in order: the buttons in the card beside "Close menu". */
function menuLabels() {
  const card = screen
    .getByRole('button', { name: 'Close menu' })
    .parent?.children.find(
      (child) => typeof child !== 'string' && StyleSheet.flatten(child.props.style)?.maxHeight !== undefined,
    );
  if (card === undefined || typeof card === 'string') throw new Error('no menu card');
  return within(card)
    .getAllByRole('button')
    .map((command) => String(within(command).getByText(/./).props.children));
}

let opened: { machineId: string; sessionId: string; question: boolean }[] = [];

async function renderList() {
  opened = [];
  await render(<AttentionList onOpenSession={(target) => opened.push(target)} />);
}

beforeEach(async () => {
  update.mockClear();
  // Test-only: the window React Native reports, read by the menu through `useWindowDimensions`; no code under
  // test reads `Dimensions`.
  await act(() => {
    Dimensions.set({
      window: { width: 402, height: 874, scale: 3, fontScale: 1 },
      screen: { width: 402, height: 874, scale: 3, fontScale: 1 },
    });
  });
  mockNativeMethods.measureInWindow.mockImplementation(
    (onFrame: (x: number, y: number, width: number, height: number) => void) =>
      onFrame(ROW_FRAME.x, ROW_FRAME.y, ROW_FRAME.width, ROW_FRAME.height),
  );
  useMachinesStore.setState({ machines: [MACHINE] });
  useInventoryStore.setState({
    // Only `summary` of the inventory is read by the list (as SUMMARY above).
    inventoriesByMachineId: { m1: { summary: SUMMARY } as unknown as MachineInventory },
  });
  useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: FEED } }, permission: 'granted' });
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
});

test('"Unread" then "Read", each newest first, with kind, agent and project', async () => {
  await renderList();
  expect(rowIds(screen)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']);
  expect(rowIds(within(group('Unread')))).toEqual(['n1', 'n2', 'n3', 'n4']);
  expect(rowIds(within(group('Read')))).toEqual(['n5', 'n6', 'n7']);

  const unread = within(group('Unread'));
  expect(unread.getByText('ended with an error')).toBeTruthy();
  expect(unread.getByText('Codex · ghostex-mobile')).toBeTruthy();
  expect(unread.getByText('finished')).toBeTruthy();
  // The account row is a row like any other, named by the account.
  expect(unread.getByText('reset expiring')).toBeTruthy();
  expect(unread.getByText('Claude · Work')).toBeTruthy();
  // VoiceOver hears the unread state as a word, not a colour.
  expect(screen.getByTestId('attention-row-n2').props.accessibilityLabel).toMatch(
    /^Unread\. Codex · ghostex-mobile, ended with an error\. Theme notices\. 6m ago\.$/,
  );
  expect(screen.getByTestId('attention-row-n5').props.accessibilityLabel).not.toMatch(/Unread/);
});

test('needsInput says "has a question" with a pending question, "waiting" without one', async () => {
  await renderList();
  expect(within(screen.getByTestId('attention-row-n1')).getByText('has a question')).toBeTruthy();
  expect(within(screen.getByTestId('attention-row-n7')).getByText('has a question')).toBeTruthy();
  expect(within(screen.getByTestId('attention-row-n6')).getByText('waiting')).toBeTruthy();
  expect(within(screen.getByTestId('attention-row-n6')).queryByText('has a question')).toBeNull();
});

test('opening an unread row marks it read once and opens its session; a question row asks for the question card', async () => {
  await renderList();
  await fireEvent.press(screen.getByTestId('attention-row-n1'));
  expect(update.mock.calls).toEqual([['m1', { action: 'markRead', notificationId: 'n1' }]]);
  expect(opened).toEqual([{ machineId: 'm1', sessionId: 's1', question: true }]);

  // A read row only opens; an account row has no session and is only marked read.
  update.mockClear();
  await fireEvent.press(screen.getByTestId('attention-row-n5'));
  await fireEvent.press(screen.getByTestId('attention-row-n3'));
  expect(update.mock.calls).toEqual([['m1', { action: 'markRead', notificationId: 'n3' }]]);
  expect(opened.slice(1)).toEqual([{ machineId: 'm1', sessionId: 's4', question: false }]);
});

describe('a message the computer could not send (sendFailed)', () => {
  test('"not sent" with a red glyph, unread, a tap marks it read and opens its session', async () => {
    // The desktop's bell draws a sendFailed row "Not sent" in the urgent red (`GpuiNotificationFeedKind::SendFailed`).
    useAttentionFeedStore.setState({
      feeds: { m1: { status: 'ready', rows: [feedRow('n8', 2, { kind: 'sendFailed', sessionId: 's6' }), ...FEED] } },
    });
    await renderList();
    expect(rowIds(within(group('Unread')))).toEqual(['n1', 'n8', 'n2', 'n3', 'n4']);
    const row = screen.getByTestId('attention-row-n8');
    expect(row.props.accessibilityLabel).toMatch(
      /^Unread\. Codex · ghostex-mobile, not sent\. Theme notices\. 2m ago\.$/,
    );
    expect(StyleSheet.flatten(within(row).getByText('not sent').props.style).color).toBe(resolveAppearance(useSettingsStore.getState().settings, true).foreground);
    const glyph = row.queryAll((node) => node.props.d === 'M 12 4 L 21 19.5 H 3 Z M 12 10 v 4');
    expect(glyph).toHaveLength(1);
    const stroke: unknown = glyph[0]?.props.stroke;
    if (typeof stroke !== 'object' || stroke === null || !('payload' in stroke) || typeof stroke.payload !== 'number') {
      throw new Error('The event glyph must have a native colour brush.');
    }
    expect(stroke.payload & 0xffffff).toBe(Number.parseInt(SidebarPalette.MENU_DANGER.slice(1), 16));

    await fireEvent.press(row);
    expect(update.mock.calls).toEqual([['m1', { action: 'markRead', notificationId: 'n8' }]]);
    expect(opened).toEqual([{ machineId: 'm1', sessionId: 's6', question: false }]);
  });
});

test('a long press opens the menu at the held row, under it, the row lifted', async () => {
  await renderList();
  await fireEvent(screen.getByTestId('attention-row-n2'), 'longPress');

  expect(menuLabels()).toEqual(['Open Session', 'Mark as Read', 'Clear']);

  // The card appears once its height is known, then stands under the row: the row spans the window, so it
  // is lifted as a card 8 pt in from each edge and the menu's leading edge lines up with it, 8 pt below.
  const before = cardStyle('Clear');
  expect(before.style.opacity).toBe(0);
  await fireEvent(before.card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 160 } } });
  const { style } = cardStyle('Clear');
  expect({ position: style.position, left: style.left, top: style.top, opacity: style.opacity }).toEqual({
    position: 'absolute',
    left: 8,
    top: ROW_FRAME.y + ROW_FRAME.height + 8,
    opacity: 1,
  });
  // The list's own row and its lifted copy above the dimmed screen carry the same label; the copy has no testID.
  const lifted = screen
    .getAllByRole('button', { name: /^Unread\. Codex · ghostex-mobile, ended with an error\./ })
    .filter((node) => node.props.testID === undefined);
  expect(lifted).toHaveLength(1);
  expect(StyleSheet.flatten(lifted[0].props.style)).toMatchObject({ left: 8, top: 200, width: 386, height: 72 });

  // Clear removes the row on the computer (the shared feed's `dismiss`) and closes the menu.
  await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
  expect(update.mock.calls).toEqual([['m1', { action: 'dismiss', notificationId: 'n2' }]]);
  expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
});

test('each command, the lifted row and Close menu are separate accessibility elements', async () => {
  await renderList();
  await fireEvent(screen.getByTestId('attention-row-n2'), 'longPress');
  expect(menuLabels()).toEqual(['Open Session', 'Mark as Read', 'Clear']);
  for (const name of ['Open Session', 'Mark as Read', 'Clear']) {
    const command = screen.getByRole('button', { name });
    expect(command.props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(groupingAncestors(command)).toEqual([]);
  }
  const lifted = screen
    .getAllByRole('button', { name: /^Unread\. Codex · ghostex-mobile, ended with an error\./ })
    .filter((node) => node.props.testID === undefined);
  expect(groupingAncestors(lifted[0])).toEqual([]);

  const close = screen.getByRole('button', { name: 'Close menu' });
  expect(groupingAncestors(close)).toEqual([]);
  await fireEvent.press(close);
  expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  expect(update).not.toHaveBeenCalled();
});

test('Mark as Read / Unread follow the row, Open Session opens it, an account row has no Open Session', async () => {
  await renderList();

  await fireEvent(screen.getByTestId('attention-row-n4'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Mark as Read' }));
  expect(update.mock.calls.at(-1)).toEqual(['m1', { action: 'markRead', notificationId: 'n4' }]);
  expect(opened).toEqual([]);

  await fireEvent(screen.getByTestId('attention-row-n5'), 'longPress');
  expect(menuLabels()).toEqual(['Open Session', 'Mark as Unread', 'Clear']);
  await fireEvent.press(screen.getByRole('button', { name: 'Mark as Unread' }));
  expect(update.mock.calls.at(-1)).toEqual(['m1', { action: 'markUnread', notificationId: 'n5' }]);

  await fireEvent(screen.getByTestId('attention-row-n6'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Open Session' }));
  expect(opened).toEqual([{ machineId: 'm1', sessionId: 's2', question: false }]);

  await fireEvent(screen.getByTestId('attention-row-n3'), 'longPress');
  expect(menuLabels()).toEqual(['Mark as Read', 'Clear']);
});

test("without rows the list shows the desktop's empty text", async () => {
  useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: [] } } });
  await renderList();
  expect(screen.getByText('No notifications yet')).toBeTruthy();
  expect(screen.getByText('Agents that finish or need you will show up here.')).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Unread' })).toBeNull();
});

/** WCAG contrast of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A row's identity and event word, as its accessibility label names them ("Unread. who, word."). */
function rowTexts(id: string) {
  const row = screen.getByTestId(`attention-row-${id}`);
  const [, who, word] = /^(?:Unread\. )?(.+?), (.+?)\./.exec(String(row.props.accessibilityLabel))!;
  const color = (text: string) => StyleSheet.flatten(within(row).getByText(text).props.style).color as string;
  return { who: color(who!), word: color(word!) };
}

describe("the rows in the appearance's colours", () => {
  const initialSettings = useSettingsStore.getState().settings;
  afterEach(async () => {
    await act(() => {
      useSettingsStore.setState({ settings: initialSettings });
    });
  });

  test.each(THEME_PRESETS.filter((preset) => preset.mode === 'light').map((preset) => preset.id))(
    'light preset %s: every identity and event word, read or unread, reads on the light row',
    async (preset) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      const page = resolveAppearance(useSettingsStore.getState().settings, true);
      await renderList();
      for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
        const { who, word } = rowTexts(id);
        expect(contrast(who, page.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(word, page.card)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test('dark: a read identity keeps its dimmer ink and the event words their status colours', async () => {
    useSettingsStore.getState().patchSettings({ sidebarTheme: 'dark-2' });
    await renderList();
    expect(rowTexts('n5').who).toBe(SidebarPalette.FOREGROUND);
    expect(rowTexts('n6').word).toBe(SidebarPalette.ROW_ATTENTION);
    expect(rowTexts('n7').word).toBe(SidebarPalette.ROW_QUESTION);
    expect(rowTexts('n2').word).toBe(SidebarPalette.MENU_DANGER);
  });
});

/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) as it shows painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** A row's texts by role, as its accessibility label names them ("Unread. who, word. detail. time."). */
function rowParts(row: TestInstance) {
  const parts = String(row.props.accessibilityLabel)
    .replace(/^Unread\. /, '')
    .replace(/\.$/, '')
    .split('. ');
  const [who, word] = parts[0]!.split(', ');
  const color = (text: string) => StyleSheet.flatten(within(row).getByText(text).props.style).color as string;
  return {
    who: color(who!),
    word: color(word!),
    time: color(parts.at(-1)!),
    detail: parts.length === 3 ? color(parts[1]!) : null,
  };
}

describe('secondary text reads on the surface it is drawn on', () => {
  const initialSettings = useSettingsStore.getState().settings;
  afterEach(async () => {
    await act(() => {
      useSettingsStore.setState({ settings: initialSettings });
    });
  });

  test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
    '%s (%s): every row keeps its time, detail and event word at 4.5:1 on its card or unread wash, pressed or not',
    async (preset, mode) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      const page = resolveAppearance(useSettingsStore.getState().settings, mode === 'light');
      await renderList();
      const failures: string[] = [];
      for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
        const row = screen.getByTestId(`attention-row-${id}`);
        const rowFill = StyleSheet.flatten(row.props.style).backgroundColor as string;
        const surfaces = [over(rowFill, page.background), page.cardActive];
        const { time, detail, word } = rowParts(row);
        // The event word: a status colour (has a question, waiting, an error, reset expiring) or, for a finished
        // event (n4, n5), the secondary ink on a dark row; the foreground on a light one.
        const texts = { time, detail, word };
        for (const [name, color] of Object.entries(texts)) {
          if (color === null) continue;
          for (const surface of surfaces) {
            const ratio = contrast(color, surface);
            if (ratio < 4.5) failures.push(`${id} ${name} ${color} on ${surface}: ${ratio.toFixed(2)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    },
  );

  test.each(['latte', 'tn-day', 'mocha', 'nord'])(
    '%s in a pane: the list body paints the page colour its ink is made for, as on the full screen',
    async (preset) => {
      const light = THEME_PRESETS.find((entry) => entry.id === preset)!.mode === 'light';
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      const page = resolveAppearance(useSettingsStore.getState().settings, light);
      await render(
        <AttentionList
          pane={{ controlInset: { left: 0, right: 0 } }}
          onOpenSession={(target) => opened.push(target)}
        />,
      );
      // The nearest painted ancestor of the list's content: the pane card under it is the terminal's black.
      let body = screen.getByRole('header', { name: 'Unread' }).parent;
      while (body !== null && StyleSheet.flatten(body.props.style)?.backgroundColor === undefined) body = body.parent;
      expect(body === null ? null : StyleSheet.flatten(body.props.style).backgroundColor).toBe(page.background);
      const title = StyleSheet.flatten(screen.getByRole('header', { name: 'Unread' }).props.style).color as string;
      expect(contrast(title, page.background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
    "%s (%s): the lifted row's text reads on the menu's dark card",
    async (preset, mode) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      await renderList();
      const failures: string[] = [];
      for (const id of ['n2', 'n5']) {
        await fireEvent(screen.getByTestId(`attention-row-${id}`), 'longPress');
        const label = String(screen.getByTestId(`attention-row-${id}`).props.accessibilityLabel);
        const lifted = screen.getAllByLabelText(label).find((node) => node.props.testID === undefined)!;
        const card = StyleSheet.flatten(lifted.props.style).backgroundColor as string;
        for (const [name, color] of Object.entries(rowParts(lifted))) {
          if (color === null) continue;
          const ratio = contrast(color, card);
          if (ratio < 4.5) failures.push(`${mode} ${id} ${name} ${color} on ${card}: ${ratio.toFixed(2)}`);
        }
        await fireEvent.press(screen.getByRole('button', { name: 'Close menu' }));
      }
      expect(failures).toEqual([]);
    },
  );

  test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
    '%s (%s): the line for a change the computer did not take keeps 4.5:1 on the list page',
    async (preset) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      update.mockResolvedValueOnce(false);
      await renderList();
      // Opening an unread row marks it read on the computer, which says no.
      await fireEvent.press(screen.getByTestId('attention-row-n1'));
      await act(async () => undefined);
      const line = screen.getByText(NotificationsCopy.actionFailed);
      let page = line.parent;
      while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
        page = page.parent;
      }
      const surface = String(StyleSheet.flatten(page!.props.style).backgroundColor);
      const ink = StyleSheet.flatten(line.props.style).color as string;
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
