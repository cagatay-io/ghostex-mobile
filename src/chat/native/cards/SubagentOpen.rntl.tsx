/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A row of the Subagents sheet opens the subagent's transcript: the sheet
 * closes and the viewer shows. Both are modals, and React Native's iOS modal host presents without
 * waiting for another one to go away (`RCTModalHostViewComponentView.mm`
 * `ensurePresentedOnlyIfNeeded`: `presentViewController:` on the screen's view controller, then
 * `_isPresented = YES` whatever UIKit did with it), so a viewer asked for while the sheet's modal was still
 * up or sliding away never showed. On iOS the row's `openSubagent` now goes out once the sheet's modal has
 * gone (`Sheet`'s `onDismissed`), as the composer's photo picker and the transcript menu's Reply already
 * wait; on Android, where a modal is a dialog, it goes out at the tap as before.
 *
 * The real `PillMenuSheet`, `Sheet`, `AgentFleetMenu` and `SubagentViewer`. The chat is a stand-in whose
 * `openSubagent` puts the viewer's header in the document at once, as the core does (`loading` until the
 * child's rows arrive). Mocked is the native modal: a stand-in that keeps UIKit's rule for one presenting
 * view controller (a modal asked to present while a sibling is presented or still being dismissed is
 * dropped and stays unseen; nothing presents it again) and reports `onDismiss` once its dismissal has
 * finished, as the iOS modal does. Its content shows only while it is presented. Reanimated (the pills'
 * reduce-motion setting) is native and does not load under Jest.
 */

import { useState, type ReactNode } from 'react';
import type * as ReactModule from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument, ChatPill } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { PillMenuSheet } from './ChatPills';
import { SubagentViewer } from './SubagentViewer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

type Presentation = 'hidden' | 'presented' | 'dismissing' | 'dropped';
/** The native modals, numbered in the order they first rendered: what each one's presenter did, in order. */
const mockModals = {
  log: [] as string[],
  states: new Map<number, { state: Presentation; presenter: number }>(),
  count: 0,
};
/** How long UIKit takes to finish a dismissal it has begun (the sheet's runs without an animation of its own). */
const mockDismissMs = 16;

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  /** The modal whose view controller presents the modals inside it; 0 is the screen's. */
  const Presenter = React.createContext(0);
  function Modal({
    visible = true,
    onDismiss,
    children,
  }: {
    visible?: boolean;
    onDismiss?: () => void;
    children?: ReactNode;
  }) {
    const presenter = React.useContext(Presenter);
    const id = React.useRef(0);
    if (id.current === 0) id.current = ++mockModals.count;
    const [state, setState] = React.useState<Presentation>('hidden');
    const dismissed = React.useRef(onDismiss);
    dismissed.current = onDismiss;
    React.useLayoutEffect(() => {
      const me = id.current;
      const move = (next: Presentation) => {
        mockModals.states.set(me, { state: next, presenter });
        mockModals.log.push(`${me} ${next}`);
        setState(next);
      };
      const now = mockModals.states.get(me)?.state ?? 'hidden';
      if (visible && now === 'hidden') {
        const busy = [...mockModals.states].some(
          ([other, entry]) =>
            other !== me &&
            entry.presenter === presenter &&
            (entry.state === 'presented' || entry.state === 'dismissing'),
        );
        move(busy ? 'dropped' : 'presented');
      } else if (!visible && now === 'presented') {
        move('dismissing');
        setTimeout(() => {
          move('hidden');
          dismissed.current?.();
        }, mockDismissMs);
      } else if (!visible && now === 'dropped') {
        move('hidden');
      }
    }, [visible, presenter]);
    React.useEffect(
      () => () => {
        mockModals.states.delete(id.current);
      },
      [],
    );
    return state === 'presented' || state === 'dismissing'
      ? React.createElement(Presenter.Provider, { value: id.current }, children)
      : null;
  }
  return { __esModule: true, default: Modal };
});

const MODEL = 'claude-haiku-4-5';
const SUBAGENTS: ChatPill = {
  id: 'subagents',
  label: 'Subagents',
  count: '1',
  waiting: '',
  running: true,
  meta: '1 working',
  ariaLabel: 'Subagents 1',
};
/** The one child as `agentFleetStrip` lists it (gx-chat-core `extras/agent_fleet.rs`). */
const CHILD = {
  key: 'child',
  selector: 'agent-1',
  name: 'Child',
  agentType: 'task',
  task: 'Say hello',
  model: MODEL,
  modelLabel: MODEL,
  statusText: 'Say hello',
  working: true,
  tokens: '',
  separator: '',
  elapsedLabel: '12s',
};
const DOCUMENT = {
  chatPills: [SUBAGENTS],
  agentFleetStrip: { countLabel: '1 subagent', rows: [CHILD] },
  subagent: null,
} as unknown as ChatDocument;
/** The viewer's header the core puts in the document on `openSubagent`, before the child's rows are read. */
const HEADER = { title: 'Child', description: 'Say hello', loading: true };
const ROW_LINK = `View ${MODEL}'s transcript`;

/** What the chat sent, in order. */
let dispatched: string[] = [];

/** The pill, its sheet and the viewer, over a chat whose core opens and closes the viewer at once. */
function ChatScreen() {
  const [document, setDocument] = useState(DOCUMENT);
  const [open, setOpen] = useState<string | null>(null);
  const chat = {
    state: { document, subagentItems: [] },
    dispatch: (action: UserAction) => {
      dispatched.push(action.type);
      if (action.type === 'openSubagent') setDocument((was) => ({ ...was, subagent: HEADER }));
      if (action.type === 'subagentClose') setDocument((was) => ({ ...was, subagent: null }));
    },
  } as unknown as RustChat;
  return (
    <>
      <Pressable accessibilityLabel="Subagents 1" onPress={() => setOpen('subagents')} />
      {/* The transcript's own link (`ToolRows.tsx`) sends the same action with no sheet on screen. */}
      <Pressable
        accessibilityLabel="Transcript link"
        onPress={() => chat.dispatch({ type: 'openSubagent', selector: CHILD.selector } as UserAction)}
      />
      <PillMenuSheet chat={chat} document={document} open={open} onClose={() => setOpen(null)} />
      <SubagentViewer chat={chat} />
    </>
  );
}

/**
 * Modal 1 is the strip's Saved draft sheet (mounted first, never opened here); modal 2 is the pill's sheet (hidden
 * until a pill opens it); modal 3 is the viewer.
 */
const SHEET = 2;
const VIEWER = 3;

function viewerShown(): boolean {
  return screen.queryByText('Loading transcript…') !== null;
}

/**
 * The sheet's slide away (200 ms) ends, then UIKit finishes dismissing its modal: two passes, since the
 * dismissal starts only once React has rendered the slide's end.
 */
async function settle(): Promise<void> {
  await act(() => jest.advanceTimersByTime(1000));
  await act(() => jest.advanceTimersByTime(1000));
}

const platform = Platform.OS;
beforeEach(() => {
  Platform.OS = 'ios';
  jest.useFakeTimers();
  // Native-driven animations do not run under Jest; the same timing runs on the JS driver here, so the
  // sheet's slide away ends and its modal goes.
  const timing = Animated.timing;
  jest
    .spyOn(Animated, 'timing')
    .mockImplementation((value, config) => timing(value, { ...config, useNativeDriver: false }));
  dispatched = [];
  mockModals.log = [];
  mockModals.states.clear();
  mockModals.count = 0;
});

afterEach(() => {
  Platform.OS = platform;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('iOS: the child row closes the sheet, and the viewer shows once the sheet has gone', async () => {
  await render(<ChatScreen />);
  await fireEvent.press(screen.getByLabelText('Subagents 1'));
  expect(screen.getByLabelText(ROW_LINK)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText(ROW_LINK));
  // The sheet is still sliding away: nothing asks for the viewer yet.
  expect(dispatched).toEqual([]);
  await settle();

  expect(dispatched).toEqual(['openSubagent']);
  expect(viewerShown()).toBe(true);
  expect(screen.getAllByLabelText('Close subagent transcript').length).toBeGreaterThan(0);
  expect(screen.queryByLabelText(ROW_LINK)).toBeNull();
  expect(mockModals.log).toEqual([
    `${SHEET} presented`,
    `${SHEET} dismissing`,
    `${SHEET} hidden`,
    `${VIEWER} presented`,
  ]);
});

test('iOS: the status text of the row opens the viewer the same way', async () => {
  await render(<ChatScreen />);
  await fireEvent.press(screen.getByLabelText('Subagents 1'));
  await fireEvent.press(screen.getAllByText('Say hello')[0]!);
  await settle();

  expect(dispatched).toEqual(['openSubagent']);
  expect(viewerShown()).toBe(true);
  expect(mockModals.log).not.toContain(`${VIEWER} dropped`);
});

test('iOS: a sheet closed without a pick opens nothing, also after a pick was opened and closed', async () => {
  await render(<ChatScreen />);
  await fireEvent.press(screen.getByLabelText('Subagents 1'));
  await fireEvent.press(screen.getByLabelText(ROW_LINK));
  await settle();
  await fireEvent.press(screen.getAllByLabelText('Close subagent transcript')[0]!);
  await settle();
  expect(viewerShown()).toBe(false);

  await fireEvent.press(screen.getByLabelText('Subagents 1'));
  await fireEvent.press(screen.getByLabelText('Close'));
  await settle();

  expect(dispatched).toEqual(['openSubagent', 'subagentClose']);
  expect(viewerShown()).toBe(false);
});

test('iOS: with no sheet on screen (the transcript link) the viewer shows at once, as before', async () => {
  await render(<ChatScreen />);
  await fireEvent.press(screen.getByLabelText('Transcript link'));

  expect(viewerShown()).toBe(true);
  expect(mockModals.log).toEqual([`${VIEWER} presented`]);
});

test('Android: the row sends the open at the tap, as before (a modal there is a dialog)', async () => {
  Platform.OS = 'android';
  await render(<ChatScreen />);
  await fireEvent.press(screen.getByLabelText('Subagents 1'));
  await fireEvent.press(screen.getByLabelText(ROW_LINK));

  expect(dispatched).toEqual(['openSubagent']);
});
