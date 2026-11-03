/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. OMP's advisor notes arrive from the chat core as a system card of kind
 * `advisor` (gx-chat-core `transcript/system_cards.rs`, `advisor_card`; its notes get `markdown` and
 * `references` in `presentation.rs`). On the phone it is one 44pt one-line card: the info tile, "Advisor
 * notes" and the core's severity counts as pills in the core's words and tones, no time; with more than
 * two severities, or pills measured wider than the room beside the title, only the worst severity's pill
 * and a neutral "+N" for the other notes. Tapping opens every note below a hairline in the core's order,
 * each with its severity word and icon in its tone and its text as Markdown. A system card of a kind the
 * renderer does not draw stays the muted text line, which is what a renderer without the `advisor` kind
 * shows for the core's `text`. The real `SystemCard`; mocked are storage (the library's own Jest mock),
 * the glyph drawing, which reports its name and colour, and what Markdown hands to Reanimated (the cards
 * area's table preview and image viewer, ```visual blocks), whose worklets runtime is native and does
 * not load under Jest; no advisor note uses them. The test renderer measures nothing, so the
 * pills' room and the width they need are fired as the layout events React Native would send. The JSON
 * reader `arr` is the real one, wrapped so a test can count how often the card's lists are read.
 */

import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultSettings, useSettingsStore } from '../../../settings/store';
import type { ProjectedMessage } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { NativeChatUiProvider, TranscriptEnvProvider, type TranscriptEnv } from './context';
import { SINGLE_LINE_HEADER_HEIGHT } from './singleLineCard';
import { SystemCard } from './SystemRows';
import { useTranscriptTheme, type TranscriptTheme } from './theme';
import { arr } from './json';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('../cards', () => ({
  openChatTablePreview: () => undefined,
  openChatImageViewer: () => undefined,
  tableCsv: () => '',
}));
jest.mock('./VisualBlock', () => ({ VisualBlock: () => null }));
// The real reader, counted: the card reads its counts and notes once, not on every width report.
jest.mock('./json', () => {
  const actual = jest.requireActual('./json');
  return { ...actual, arr: jest.fn(actual.arr) };
});
// A glyph is drawn with react-native-svg; the test only needs which glyph and in what colour.
jest.mock('./icons', () => {
  const { View } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('./icons'),
    Glyph: ({ name, color }: { name: string; color: string }) => (
      <View testID={`glyph:${name}`} accessibilityHint={color} />
    ),
  };
});

/** Read the public hook, so this fixture follows the theme implementation present in the composed app too. */
let DARK: TranscriptTheme;
let LIGHT: TranscriptTheme;

beforeEach(async () => {
  const previous = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...defaultSettings(), sessionChatTheme: 'dark' } });
  const dark = await renderHook(useTranscriptTheme);
  DARK = dark.result.current;
  await dark.unmount();
  useSettingsStore.setState({ settings: { ...defaultSettings(), sessionChatTheme: 'light' } });
  const light = await renderHook(useTranscriptTheme);
  LIGHT = light.result.current;
  await light.unmount();
  useSettingsStore.setState({ settings: previous });
});
/** The message cards' status tones (`AgentMessageCards.tsx`): `failed` red, `waiting` amber. */
const RED = { dark: '#fb7185', light: '#e11d48' };
const AMBER = { dark: '#fbbf24', light: '#d97706' };

type Node = TestInstance;

const flat = (node: Node) => StyleSheet.flatten(node.props.style) ?? {};

/** The nearest ancestor (or the node itself) that satisfies `match`. */
function up(node: Node | null, match: (node: Node) => boolean): Node {
  let current = node;
  while (current !== null && !match(current)) current = current.parent;
  if (current === null) throw new Error('no such ancestor');
  return current;
}

const RANKS = {
  blocker: { label: 'Blocker', tone: 'failed', icon: 'alert-octagon' },
  concern: { label: 'Concern', tone: 'waiting', icon: 'alert-triangle' },
  nit: { label: 'Nit', tone: 'neutral', icon: 'bulb' },
  note: { label: 'Note', tone: 'neutral', icon: 'info-circle' },
} as const;

type Severity = keyof typeof RANKS;

/** The card as the core sends it: notes worst first, one count per severity, `text` for an older renderer. */
function advisorCard(notes: [Severity, string][]) {
  const order: Severity[] = ['blocker', 'concern', 'nit', 'note'];
  const counts = order
    .map((severity) => ({ severity, count: notes.filter(([of]) => of === severity).length }))
    .filter(({ count }) => count > 0)
    .map(({ severity, count }) => ({
      severity,
      label: `${count} ${severity}${count === 1 ? '' : 's'}`,
      tone: RANKS[severity].tone,
      icon: RANKS[severity].icon,
    }));
  return {
    kind: 'advisor',
    name: 'Advisor notes',
    title: `Advisor notes: ${counts.map((count) => count.label).join(', ')}`,
    time: '12:41',
    counts,
    notes: notes.map(([severity, markdown]) => ({
      severity,
      label: RANKS[severity].label,
      tone: RANKS[severity].tone,
      icon: RANKS[severity].icon,
      text: markdown,
      markdown,
      references: [],
    })),
    text: notes.map(([severity, markdown]) => `<advisory severity="${severity}">${markdown}</advisory>`).join('\n'),
  };
}

const CONCERN = 'The limiter keys on the client IP only. Key on the forwarded address instead.';
const NIT = '`WINDOW_SECS` is defined twice, in the middleware and in the tests.';
const BLOCKER = 'The failure counter lives in each server’s memory. Keep it in the shared store.';
const SECOND_NIT = 'The test name `limits_work` does not say what it checks.';
const NOTE = 'The SSO hook repeats the middleware’s key function.';

const chat = { dispatch: () => undefined, query: () => null, queryAsync: async () => null } as unknown as RustChat;

function Frame({ theme, children }: { theme: typeof DARK; children: ReactNode }) {
  const env: TranscriptEnv = {
    dispatch: () => undefined,
    theme,
    simple: false,
    workOpen: false,
    filePreviews: false,
    mutedThinking: false,
    main: true,
  };
  return (
    <NativeChatUiProvider chat={chat}>
      <TranscriptEnvProvider value={env}>{children}</TranscriptEnvProvider>
    </NativeChatUiProvider>
  );
}

async function show(systemCard: object, theme = DARK) {
  const message = { id: 'omp-advisor-1', systemCard } as unknown as ProjectedMessage;
  await render(
    <Frame theme={theme}>
      <SystemCard message={message} />
    </Frame>,
  );
}

const row = (title: string) => screen.getByRole('button', { name: title });

/** The pills' slot: the row's child that reports its own width. */
const pillSlot = (title: string) =>
  up(screen.getByText('Advisor notes'), (node) => node.parent?.props.accessibilityLabel === title).parent!.children.find(
    (child): child is Node => typeof child !== 'string' && child.props.onLayout !== undefined,
  )!;

/** Fires the room beside the title and the width the pills need side by side (the invisible copy's row). */
async function measure(title: string, room: number, needed: number) {
  const slot = pillSlot(title);
  await fireEvent(slot, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: room, height: 24 } } });
  const copy = slot.children.find(
    (child): child is Node => typeof child !== 'string' && child.props.accessibilityElementsHidden === true,
  )!;
  const measured = copy.children.find(
    (child): child is Node => typeof child !== 'string' && child.props.onLayout !== undefined,
  )!;
  await fireEvent(measured, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: needed, height: 22 } } });
}

/** The pills on the folded row, in order: their words and their glyph's name and colour. */
function pills(title: string) {
  return screen
    .getAllByText(/^(\d+ \w+|\+\d+)$/)
    .filter((label) => up(label, (node) => node.props.accessibilityLabel === title) !== null)
    .map((label) => {
      const pill = label.parent!;
      const glyph = pill.children.find((child): child is Node => typeof child !== 'string' && child !== label);
      return {
        label: label.props.children as string,
        color: flat(label).color,
        glyph: glyph?.props.testID ?? null,
        glyphColor: glyph?.props.accessibilityHint ?? null,
      };
    });
}

/** The opened card's notes, in order: the severity word, its colour and glyph, and the note's words. */
function openedNotes() {
  return screen.getAllByText(/^(Blocker|Concern|Nit|Note)$/).map((word) => {
    const severity = word.parent!;
    const glyph = severity.children.find((child): child is Node => typeof child !== 'string' && child !== word)!;
    const note = severity.parent!;
    const text = note.children.find((child): child is Node => typeof child !== 'string' && child !== severity)!;
    return {
      word: word.props.children as string,
      color: flat(word).color,
      glyph: glyph.props.testID as string,
      glyphColor: glyph.props.accessibilityHint as string,
      text,
    };
  });
}

describe('the advisor card, folded', () => {
  const card = advisorCard([
    ['concern', CONCERN],
    ['nit', NIT],
  ]);

  test('is one 44pt row: the info tile, "Advisor notes" and a pill per severity in the core’s words and tones', async () => {
    await show(card);
    const button = row(card.title);
    expect(flat(button).height).toBe(SINGLE_LINE_HEADER_HEIGHT);
    expect(screen.getByText('Advisor notes')).toBeTruthy();
    expect(screen.getByTestId('glyph:info-circle')).toBeTruthy();
    expect(pills(card.title)).toEqual([
      { label: '1 concern', color: AMBER.dark, glyph: 'glyph:alert-triangle', glyphColor: AMBER.dark },
      { label: '1 nit', color: DARK.cardMuted, glyph: 'glyph:bulb', glyphColor: DARK.cardMuted },
    ]);
  });

  test('its accessibility label is the core’s title, and it says whether it is open', async () => {
    await show(card);
    expect(row('Advisor notes: 1 concern, 1 nit').props.accessibilityState).toEqual({ expanded: false });
  });

  test('shows no time and none of the notes', async () => {
    await show(card);
    expect(screen.queryByText('12:41')).toBeNull();
    expect(screen.queryByText('Concern')).toBeNull();
    expect(screen.queryByText(CONCERN)).toBeNull();
  });

  test('is not the muted text line of the core’s `text`', async () => {
    await show(card);
    expect(screen.queryByText(card.text)).toBeNull();
  });
});

describe('opening the advisor card', () => {
  test('lists every note below a hairline in the core’s order, each with its severity word and icon in its tone', async () => {
    const card = advisorCard([
      ['blocker', BLOCKER],
      ['concern', CONCERN],
      ['nit', NIT],
      ['nit', SECOND_NIT],
      ['note', NOTE],
    ]);
    await show(card);
    await fireEvent.press(row(card.title));
    expect(row(card.title).props.accessibilityState).toEqual({ expanded: true });
    const notes = openedNotes();
    expect(notes.map(({ word, color, glyph, glyphColor }) => ({ word, color, glyph, glyphColor }))).toEqual([
      { word: 'Blocker', color: RED.dark, glyph: 'glyph:alert-octagon', glyphColor: RED.dark },
      { word: 'Concern', color: AMBER.dark, glyph: 'glyph:alert-triangle', glyphColor: AMBER.dark },
      { word: 'Nit', color: DARK.cardMuted, glyph: 'glyph:bulb', glyphColor: DARK.cardMuted },
      { word: 'Nit', color: DARK.cardMuted, glyph: 'glyph:bulb', glyphColor: DARK.cardMuted },
      { word: 'Note', color: DARK.cardMuted, glyph: 'glyph:info-circle', glyphColor: DARK.cardMuted },
    ]);
    const list = up(screen.getByText('Blocker'), (node) => flat(node).borderTopWidth !== undefined);
    expect(flat(list).borderTopWidth).toBeGreaterThan(0);
    expect(flat(list).borderTopColor).toBe(DARK.ink(0.05));
    await fireEvent.press(row(card.title));
    expect(screen.queryByText('Blocker')).toBeNull();
  });

  test('draws each note’s text as Markdown: inline code is code, not backticks', async () => {
    const card = advisorCard([
      ['concern', CONCERN],
      ['nit', NIT],
    ]);
    await show(card);
    await fireEvent.press(row(card.title));
    const code = screen.getByText('WINDOW_SECS', { exact: false });
    expect(screen.queryByText(/`WINDOW_SECS`/)).toBeNull();
    expect(flat(up(code, (node) => flat(node).fontFamily !== undefined)).fontFamily).toBeDefined();
    expect(screen.getByText(CONCERN)).toBeTruthy();
  });

  test('a note’s text sits in a column bounded by the card, so a long code name wraps inside it', async () => {
    const card = advisorCard([['nit', 'Rename `rate_limiter_middleware_failure_counter_shared_store_key_prefix_for_login_attempts`.']]);
    await show(card);
    await fireEvent.press(row(card.title));
    const [note] = openedNotes();
    expect(flat(note!.text)).toMatchObject({ flex: 1, minWidth: 0 });
    expect(flat(note!.text.parent!)).toMatchObject({ flexDirection: 'row', minWidth: 0 });
  });
});

describe('a blocker', () => {
  test('is red with the octagon, on its pill and on its note', async () => {
    const card = advisorCard([
      ['blocker', BLOCKER],
      ['concern', CONCERN],
    ]);
    await show(card);
    expect(pills(card.title)[0]).toEqual({
      label: '1 blocker',
      color: RED.dark,
      glyph: 'glyph:alert-octagon',
      glyphColor: RED.dark,
    });
    await fireEvent.press(row(card.title));
    expect(openedNotes()[0]).toMatchObject({ word: 'Blocker', color: RED.dark, glyph: 'glyph:alert-octagon' });
  });

  test('takes the message cards’ light red, and a concern their light amber, in the light chat theme', async () => {
    const card = advisorCard([
      ['blocker', BLOCKER],
      ['concern', CONCERN],
    ]);
    await show(card, LIGHT);
    expect(pills(card.title).map(({ color }) => color)).toEqual([RED.light, AMBER.light]);
  });
});

describe('the folded row on the phone’s width', () => {
  test('with more than two severities shows only the worst severity’s pill and "+N" for the other notes', async () => {
    const card = advisorCard([
      ['blocker', BLOCKER],
      ['concern', CONCERN],
      ['nit', NIT],
      ['nit', SECOND_NIT],
      ['note', NOTE],
    ]);
    await show(card);
    expect(pills(card.title)).toEqual([
      { label: '1 blocker', color: RED.dark, glyph: 'glyph:alert-octagon', glyphColor: RED.dark },
      { label: '+4', color: DARK.cardMuted, glyph: null, glyphColor: null },
    ]);
    await fireEvent.press(row(card.title));
    expect(openedNotes().map(({ word }) => word)).toEqual(['Blocker', 'Concern', 'Nit', 'Nit', 'Note']);
  });

  test('"+N" counts the other notes, not the other severities', async () => {
    const card = advisorCard([
      ['concern', CONCERN],
      ['concern', BLOCKER],
      ['nit', NIT],
      ['nit', SECOND_NIT],
      ['note', NOTE],
    ]);
    await show(card);
    expect(pills(card.title).map(({ label }) => label)).toEqual(['2 concerns', '+3']);
  });

  test('two severities whose pills fit beside the title stay two pills', async () => {
    const card = advisorCard([
      ['concern', CONCERN],
      ['nit', NIT],
    ]);
    await show(card);
    await measure(card.title, 200, 150);
    expect(pills(card.title).map(({ label }) => label)).toEqual(['1 concern', '1 nit']);
  });

  test('two severities whose pills measure wider than the room fold to the worst pill and "+N" (large text, a narrow screen)', async () => {
    const card = advisorCard([
      ['concern', CONCERN],
      ['nit', NIT],
      ['nit', SECOND_NIT],
    ]);
    await show(card);
    await measure(card.title, 120, 180);
    expect(pills(card.title)).toEqual([
      { label: '1 concern', color: AMBER.dark, glyph: 'glyph:alert-triangle', glyphColor: AMBER.dark },
      { label: '+2', color: DARK.cardMuted, glyph: null, glyphColor: null },
    ]);
    await fireEvent.press(row(card.title));
    expect(openedNotes().map(({ word }) => word)).toEqual(['Concern', 'Nit', 'Nit']);
  });

  test('a single severity shows its one pill and no "+N"', async () => {
    const card = advisorCard([['concern', CONCERN]]);
    await show(card);
    expect(pills(card.title).map(({ label }) => label)).toEqual(['1 concern']);
  });

  test('reads the card’s counts and notes once, not again when the width reports re-render it', async () => {
    const card = advisorCard([
      ['concern', CONCERN],
      ['nit', NIT],
    ]);
    await show(card);
    const reads = () =>
      jest.mocked(arr).mock.calls.filter(([value]) => value === card.counts || value === card.notes).length;
    const first = reads();
    expect(first).toBeGreaterThan(0);
    await measure(card.title, 120, 180);
    // The width reports did re-render it: the row folded.
    expect(pills(card.title).map(({ label }) => label)).toEqual(['1 concern', '+1']);
    expect(reads()).toBe(first);
  });
});

describe('system cards the phone draws as a text line', () => {
  test('a kind this renderer does not draw stays the muted text line of the core’s `text`', async () => {
    const later = { ...advisorCard([['concern', CONCERN]]), kind: 'some-later-kind' };
    await show(later);
    const line = screen.getByText(later.text);
    expect(flat(line).color).toBe(DARK.muted);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Advisor notes')).toBeNull();
  });

  test('advisor notes from a core without the advisor card stay the muted text line', async () => {
    const text = `<advisory severity="concern">${CONCERN}</advisory>`;
    await show({ kind: 'marker', text });
    expect(flat(screen.getByText(text)).color).toBe(DARK.muted);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
