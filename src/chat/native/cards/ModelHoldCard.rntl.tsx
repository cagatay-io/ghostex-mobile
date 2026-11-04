/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The held-messages card above the composer: while the document carries
 * `modelHoldCard` (gx-chat-core `menus/picker/hold_card.rs`), the phone draws one tone card with the
 * core's tone, title and plain sentence, the diagnostic behind Details, and a footer whose muted note
 * takes the room beside one primary Pick model button; no dismiss. Pick model asks the screen for the model sheet
 * and shows only where the screen offers the cards' host actions (opening the sheet, also while a
 * question takes the composer's place, is `NativeChatScreen.rntl.tsx`). The card sits in the stack in
 * desktop's order (`render_composer`: after a failed call's card, before the async questions) and counts
 * as a shown card. A document without the key draws nothing, and the other tone cards look as before.
 *
 * The real `NativeChatCards`, cards and `ToneCard`; the chat is a stand-in that holds the document. The
 * test renderer lays nothing out, so the wrapping and the footer's room are read from the props and
 * styles the layout follows. Colours are the dark chat theme: the app's appearance is set to Dark before each test,
 * since the default appearance follows the system.
 */

import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../../../settings/store';
import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { ToneButton, ToneCard } from './ToneCard';
import { transcriptThemeFor } from '../transcript/theme';
import { chatCardsShown, NativeChatCards } from './NativeChatCards';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Reanimated is native (its worklets runtime does not load under Jest), and so are the gestures it drives (the
// image viewer's, reached through the cards' imports); the cards draw nothing with either.
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('react-native-gesture-handler', () => ({}));
// The app's own native module and the web view (the window's bars, connection events and the page sheet, reached
// through the same imports); nothing here draws them or hears from them.
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('react-native-webview', () => ({}));

const TITLE = '2 messages are held';
const BODY = 'The model change failed.';
const REASON = 'The change to openrouter/qwen3.8-max high failed: No API key for openrouter.';
const NOTE = 'Pick a model again; held messages send once it applies.';
/** The payload `hold_card.rs` builds. */
const CARD = {
  tone: 'warning',
  title: TITLE,
  body: BODY,
  detail: REASON,
  note: NOTE,
  action: { id: 'pickModel', label: 'Pick model' },
  heldCount: 2,
};
/** `notice-tone.json`, dark: the tile's fill is the tone's hue at 12%. */
const WARNING_TILE = 'rgba(251,191,36,0.12)';
const ERROR_TILE = 'rgba(251,113,133,0.12)';
/** The dark chat theme's `muted` and `controlPrimary`. */
const muted = () => transcriptThemeFor(useSettingsStore.getState().settings, false).muted;
const PRIMARY = '#e5e5e5';

function chatWith(fields: Record<string, unknown>): RustChat {
  return { state: { document: fields as unknown as ChatDocument }, dispatch: jest.fn() } as unknown as RustChat;
}

const initialSettings = useSettingsStore.getState().settings;
beforeEach(() => {
  useSettingsStore.setState({ settings: { ...initialSettings, sessionChatTheme: 'dark' } });
});
afterEach(() => {
  useSettingsStore.setState({ settings: initialSettings });
});

function styleOf(node: TestInstance | null): Record<string, unknown> {
  return (StyleSheet.flatten(node?.props.style) ?? {}) as Record<string, unknown>;
}

function hostsWithFill(fill: string): TestInstance[] {
  return screen.root?.queryAll((node) => styleOf(node).backgroundColor === fill) ?? [];
}

test('draws the core’s plain sentence and keeps its diagnostic behind Details', async () => {
  await render(<NativeChatCards chat={chatWith({ modelHoldCard: CARD })} onHostAction={jest.fn()} />);
  expect(screen.getByText(TITLE)).toBeTruthy();
  const body = screen.getByText(BODY);
  expect(body.props.numberOfLines).toBeUndefined();
  expect(styleOf(body).color).toBe(muted());
  expect(hostsWithFill(WARNING_TILE)).toHaveLength(1);
  expect(screen.queryByText(REASON)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Show details' }));
  expect(screen.getByText(REASON)).toBeTruthy();
  expect(screen.getByText(BODY)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Hide details' }));
  expect(screen.queryByText(REASON)).toBeNull();
});

test('the tone, title and sentence are the core’s; an empty diagnostic has no Details', async () => {
  await render(
    <NativeChatCards
      chat={chatWith({
        modelHoldCard: {
          ...CARD,
          tone: 'error',
          title: '1 message is held',
          body: 'The thinking-level change failed.',
          detail: '',
          heldCount: 1,
        },
      })}
      onHostAction={jest.fn()}
    />,
  );
  expect(screen.getByText('1 message is held')).toBeTruthy();
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(hostsWithFill(ERROR_TILE)).toHaveLength(1);
  expect(hostsWithFill(WARNING_TILE)).toHaveLength(0);
  expect(screen.getByText('The thinking-level change failed.')).toBeTruthy();
  expect(screen.queryByText(BODY)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull();
});

test('the footer: the muted note takes the room beside one primary Pick model, and nothing dismisses the card', async () => {
  await render(<NativeChatCards chat={chatWith({ modelHoldCard: CARD })} onHostAction={jest.fn()} />);
  const note = screen.getByText(NOTE);
  const pick = screen.getByRole('button', { name: 'Pick model' });
  // The note precedes the upstream action group; wrapped actions keep their own row.
  const footer = note.parent;
  const actions = pick.parent;
  expect(footer).not.toBeNull();
  expect(actions?.parent).toBe(footer);
  expect(footer?.children).toEqual([note, actions]);
  expect(styleOf(actions)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' });
  expect(styleOf(footer)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  // The note takes the room the button leaves and wraps inside it.
  expect(styleOf(note)).toMatchObject({ flex: 1, minWidth: 0, color: muted() });
  expect(note.props.numberOfLines).toBeUndefined();
  expect(styleOf(pick).backgroundColor).toBe(PRIMARY);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
});

test('Pick model asks the screen for the model sheet', async () => {
  const onHostAction = jest.fn();
  await render(<NativeChatCards chat={chatWith({ modelHoldCard: CARD })} onHostAction={onHostAction} />);
  fireEvent.press(screen.getByRole('button', { name: 'Pick model' }));
  expect(onHostAction).toHaveBeenCalledTimes(1);
  expect(onHostAction).toHaveBeenCalledWith('pickModel');
});

test('without the screen’s host actions the card shows without Pick model', async () => {
  await render(<NativeChatCards chat={chatWith({ modelHoldCard: CARD })} />);
  expect(screen.getByText(TITLE)).toBeTruthy();
  expect(screen.getByText(NOTE)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Pick model' })).toBeNull();
});

test('sits in desktop’s order: after a failed call’s card, before the async questions', async () => {
  await render(
    <NativeChatCards
      chat={chatWith({
        apiErrorCard: {
          messageId: null,
          tone: 'warning',
          icon: 'server',
          title: 'The provider failed',
          detail: '',
          status: {},
          actions: [],
        },
        modelHoldCard: CARD,
        asyncQuestions: {
          question: { key: 'q1', title: 'Which branch?', options: [] },
          collapsed: true,
          count: 1,
          index: 0,
          working: false,
          disabled: false,
          submitting: false,
          loading: false,
          selected: [],
          draft: { other: '' },
        },
      })}
      onHostAction={jest.fn()}
    />,
  );
  const drawn = JSON.stringify(screen.toJSON());
  const apiError = drawn.indexOf('The provider failed');
  const hold = drawn.indexOf(TITLE);
  const questions = drawn.indexOf('Question from Codex');
  expect(apiError).toBeGreaterThanOrEqual(0);
  expect(questions).toBeGreaterThanOrEqual(0);
  expect(apiError).toBeLessThan(hold);
  expect(hold).toBeLessThan(questions);
});

test('counts as a shown card like the others', () => {
  expect(chatCardsShown({ modelHoldCard: CARD } as unknown as ChatDocument)).toBe(true);
});

test('a document without the key (an older core, a gxserver without queue or model selection) draws nothing', async () => {
  expect(chatCardsShown({} as unknown as ChatDocument)).toBe(false);
  await render(<NativeChatCards chat={chatWith({})} onHostAction={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

test('the other tone cards keep a one-line detail and the upstream right-aligned action group', async () => {
  await render(
    <ToneCard
      tone="warning"
      title="Usage limit reached"
      detail="Resets at 14:00"
      footerEnd={[<ToneButton key="go" label="Switch account" kind="primary" onPress={jest.fn()} />]}
    />,
  );
  expect(screen.getByText('Resets at 14:00').props.numberOfLines).toBe(1);
  const button = screen.getByRole('button', { name: 'Switch account' });
  const actions = button.parent;
  expect(actions?.children).toEqual([button]);
  expect(styleOf(actions)).toMatchObject({ flexGrow: 1, flexDirection: 'row', justifyContent: 'flex-end' });
  expect(actions?.parent?.children).toEqual([actions]);
});
