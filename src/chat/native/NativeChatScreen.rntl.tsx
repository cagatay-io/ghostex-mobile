/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The held-messages card's Pick model opens the composer's model sheet, the same
 * sheet a tap on the model pill opens: the card asks the screen (`pickModel`), the screen asks the composer, and
 * the composer opens what its model pill opens, which starts the core's model menu visit (`modelMenuView`). While
 * a question takes the composer's place, Pick model opens that same sheet too, and the question stays.
 *
 * The real `NativeChatScreen` with its cards, composer and model sheet; mocked are the boundaries only: the chat
 * core (a stand-in holding the document, built from the composer preview's document, with the composer's real
 * text model), the native modules (the app's own, the web view, Reanimated and the gestures it drives), storage,
 * the safe area, navigation and the voice agent check. Colours and layout are not read here.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ComposerModel } from '../rust/composer';
import type { ChatDocument } from '../rust/document';
import type { RustChat } from '../rust/useRustChat';
import data from './composer/__preview-data__.json';
import NativeChatScreen from './NativeChatScreen';

const mockDispatch = jest.fn();
let mockChat: RustChat | null = null;

jest.mock('../rust/useRustChat', () => ({ useRustChat: () => mockChat }));
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('../../../modules/ghostex-native/src/GhostexImageIntakeView', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { __esModule: true, default: MockView };
});
jest.mock('react-native-webview', () => ({}));
jest.mock('react-native-gesture-handler', () => ({}));
// Reanimated is native (its worklets runtime does not load under Jest). The composer's tween reads these; with
// Reduce Motion on, values land at once.
jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: MockView },
    Easing: { bezier: () => (t: number) => t },
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (build: () => object) => build(),
    withTiming: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    cancelAnimation: () => undefined,
  };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => undefined }),
  useIsFocused: () => true,
}));
jest.mock('../../voice/VoiceButton', () => ({ useVoiceCapability: () => false }));

const TITLE = '2 messages are held';
/** What `hold_card.rs` sends while a refused model change holds two queued messages. */
const CARD = {
  tone: 'warning',
  title: TITLE,
  detail: 'The change to openrouter/qwen3.8-max high failed: No API key for openrouter.',
  note: 'Pick a model again; held messages send once it applies.',
  action: { id: 'pickModel', label: 'Pick model' },
  heldCount: 2,
};
/** Whether the model sheet is up: its agent tabs show only inside it (the Modal draws nothing while closed). */
function modelSheetShown(): boolean {
  return screen.queryByRole('tab', { name: 'Favorites' }) !== null;
}

function chatWith(document: ChatDocument): RustChat {
  const model = new ComposerModel({
    dispatch: (action) => mockDispatch(action),
    document: () => document,
    onChange: () => undefined,
    onSendBlocked: () => undefined,
    onFocusRequested: () => undefined,
  });
  model.init({ clientId: 'test', entry: { text: '' } }, 'test');
  return {
    state: {
      status: 'running',
      revision: 1,
      document,
      items: [],
      subagentItems: [],
      minimap: [],
      rowDetails: {},
      composer: model.state,
      images: {},
      error: null,
      stats: {} as never,
      // A running chat whose document holds the computer's read, which the question card waits for.
      live: true,
      queryRevision: 0,
    },
    dispatch: (action) => mockDispatch(action),
    measure: () => undefined,
    setTitle: () => undefined,
    composer: {
      edited: (text, selection) => model.edited(text, selection),
      selected: (selection) => model.selected(selection),
      focused: () => model.focused(),
      blurred: () => model.blurred(),
      submit: (mode) => model.submit(mode),
      replace: (text) => model.replace(text, null, false),
    },
    attachFiles: async () => undefined,
    query: () => null,
    queryAsync: async () => null,
    onViewRequest: () => () => undefined,
    machine: null,
  };
}

async function renderScreen(fields: Record<string, unknown>): Promise<void> {
  mockChat = chatWith({ ...(data.doc as unknown as ChatDocument), ...fields } as ChatDocument);
  await render(
    <NativeChatScreen
      machine={{ id: 'm1' } as never}
      projectId="p1"
      sessionId="s1"
      onSwitchToTerminal={() => undefined}
      visible
    />,
  );
  await act(async () => undefined);
}

/** The visits the model sheet starts with the core (`modelMenuView` with no tab: the picker opening). */
function modelMenuOpenings(): number {
  return mockDispatch.mock.calls.filter(
    ([action]) => action.type === 'modelMenuView' && action.tab === null && action.query === '',
  ).length;
}

beforeEach(() => {
  mockDispatch.mockReset();
});

test('the model pill opens the model sheet (the sheet Pick model has to open)', async () => {
  await renderScreen({ modelHoldCard: CARD });
  expect(modelSheetShown()).toBe(false);
  // The composer also draws an untouchable copy of the pills to measure their width; the first is the real one.
  const [pill] = screen.getAllByRole('button', { name: 'Model: Sonnet 5' });
  await act(() => fireEvent.press(pill!));
  expect(modelSheetShown()).toBe(true);
  expect(modelMenuOpenings()).toBe(1);
});

test('Pick model on the held-messages card opens that same model sheet', async () => {
  await renderScreen({ modelHoldCard: CARD });
  expect(screen.getByText(TITLE)).toBeTruthy();
  expect(modelSheetShown()).toBe(false);
  expect(modelMenuOpenings()).toBe(0);
  await act(() => fireEvent.press(screen.getByRole('button', { name: 'Pick model' })));
  expect(modelSheetShown()).toBe(true);
  expect(modelMenuOpenings()).toBe(1);
});

test('while a question takes the composer’s place, Pick model opens the model sheet and the question stays', async () => {
  await renderScreen({
    modelHoldCard: CARD,
    questionCard: {
      visible: true,
      questionIndex: 0,
      controls: { hasAnswer: false, disabled: false, label: 'Submit' },
      drafts: [{ indices: [], other: '' }],
      answering: false,
      busy: false,
      loading: false,
    },
    prompt: {
      kind: 'question',
      questions: [{ question: 'Which branch?', header: 'Branch', options: [{ label: 'main' }] }],
    },
  });
  // The question has the composer's place: no composer (its model pill) is drawn.
  expect(screen.getByText('Needs your answer')).toBeTruthy();
  expect(screen.queryAllByRole('button', { name: 'Model: Sonnet 5' })).toHaveLength(0);
  expect(screen.getByText(TITLE)).toBeTruthy();
  expect(modelSheetShown()).toBe(false);
  await act(() => fireEvent.press(screen.getByRole('button', { name: 'Pick model' })));
  expect(modelSheetShown()).toBe(true);
  expect(modelMenuOpenings()).toBe(1);
  expect(screen.getByText('Needs your answer')).toBeTruthy();
  expect(screen.queryAllByRole('button', { name: 'Model: Sonnet 5' })).toHaveLength(0);
});

test('without the key the screen draws no held-messages card', async () => {
  await renderScreen({});
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pick model' })).toBeNull();
});
