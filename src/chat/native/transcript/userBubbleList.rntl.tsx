/// <reference types="jest" />
/**
 * A prompt starting with an ordered list keeps its words and inline picture inside its bubble, and a list
 * item with a picture keeps its marker in the row of words and pictures, on the first line of its words.
 * These assertions cover the structure and styles the layout depends on; Jest does not perform Yoga layout,
 * so where the marker lands on screen needs the device.
 * Native boundaries are mocked, while the message row, Markdown and inline picture remain real.
 */

import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import type { RustChat } from '../../rust/useRustChat';
import { ChatImagesProvider, NativeChatUiProvider, TranscriptEnvProvider, type RustChatImages } from './context';
import { MessageRow } from './MessageRow';
import { useTranscriptTheme } from './theme';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('../cards/ImageViewer', () => ({ ImageViewer: () => null, ImageViewerModal: () => null }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../../modules/ghostex-native/src/GhostexSelectionMenuView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));

/** The core's mark around a picture written into a message (`parse.ts`). */
const MARK = '\uE000';
const PICTURE_PATH = '/Users/me/Desktop/screenshot.png';
const PICTURE = `${MARK}image:${JSON.stringify({
  transport: 'read',
  path: PICTURE_PATH,
  label: PICTURE_PATH,
  alt: 'screenshot.png',
})}${MARK}`;
/** The picture's bytes: a portrait (3×6) and a landscape (6×3) PNG. */
const PORTRAIT = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAGCAIAAACJh7NbAAAADklEQVR4nGNogAEGklkAKmkbAV9tMxcAAAAASUVORK5CYII=';
const LANDSCAPE = 'iVBORw0KGgoAAAANSUhEUgAAAAYAAAADCAIAAAA/Y+msAAAAD0lEQVR4nGNowAAMRAkBAAHmGwHaBHg4AAAAAElFTkSuQmCC';

const chat: RustChat = {
  state: null,
  dispatch: () => undefined,
  query: () => null,
  queryAsync: () => Promise.resolve(null),
  measure: () => undefined,
  setTitle: () => undefined,
  composer: null,
  attachFiles: () => Promise.resolve(),
  uploadFiles: () => Promise.resolve([]),
  onViewRequest: () => () => undefined,
  machine: null,
};

function Prompt({ text, picture }: { text: string; picture: string }) {
  const theme = useTranscriptTheme();
  const images: RustChatImages = { [PICTURE_PATH]: { status: 'loaded', base64Data: picture, mediaType: 'image/png' } };
  return (
    <NativeChatUiProvider chat={chat}>
      <TranscriptEnvProvider
        value={{
          dispatch: chat.dispatch,
          theme,
          simple: false,
          workOpen: true,
          filePreviews: false,
          mutedThinking: false,
          main: true,
        }}
      >
        <ChatImagesProvider value={images}>
          <MessageRow message={{ id: 'u1', role: 'user', text }} />
        </ChatImagesProvider>
      </TranscriptEnvProvider>
    </NativeChatUiProvider>
  );
}

function styleOf(node: TestInstance): ViewStyle {
  return StyleSheet.flatten(node.props.style) ?? {};
}

function isWithin(node: TestInstance, ancestor: TestInstance): boolean {
  for (let at: TestInstance | null = node; at !== null; at = at.parent) if (at === ancestor) return true;
  return false;
}

/** The picture written into the prompt: its press target and the thumbnail frame inside it. */
function picture(): { press: TestInstance; frame: ViewStyle } {
  const press = screen.getByLabelText('View screenshot.png');
  const pending: (TestInstance | string)[] = [...press.children];
  for (let node = pending.shift(); node !== undefined; node = pending.shift()) {
    if (typeof node === 'string') continue;
    if (node.props.source?.uri !== undefined) return { press, frame: styleOf(node) };
    pending.push(...node.children);
  }
  throw new Error('the picture draws no image');
}

/** The marker's row with the words after it, and the flow of words and pictures holding that row. */
function markerInFlow(words: RegExp): { lead: TestInstance; flow: TestInstance } {
  const marker = screen.getByText('1.').parent;
  const lead = marker?.parent;
  const flow = lead?.parent;
  if (lead == null || flow == null) throw new Error('Missing list marker');
  // The marker and the first words share one row, the marker first, so it sits on their first line.
  expect(styleOf(lead)).toMatchObject({ flexDirection: 'row', flexShrink: 1, minWidth: 0 });
  expect(lead.children[0]).toBe(marker);
  expect(isWithin(screen.getByText(words), lead)).toBe(true);
  // That row is an item of the flow that centres words and pictures, not a column beside it.
  expect(styleOf(flow)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' });
  expect(flow.children[0]).toBe(lead);
  return { lead, flow };
}

describe.each([
  ['portrait', PORTRAIT],
  ['landscape', LANDSCAPE],
])('a %s picture', (_shape, bytes) => {
  test('"1. x" with the picture: the marker leads the words in the flow, the picture stays inside it', async () => {
    await render(<Prompt text={`1. Look at this picture please ${PICTURE}`} picture={bytes} />);
    const { lead, flow } = markerInFlow(/^Look at this picture please/);
    // Sized by its content (no zero flex basis), and free to shrink to the bubble.
    expect(styleOf(lead).flex).toBeUndefined();
    expect(styleOf(lead).flexBasis ?? 'auto').toBe('auto');
    // The picture is the flow's, as a thumbnail of one size whatever the picture's shape.
    const { press, frame } = picture();
    expect(press.parent).toBe(flow);
    expect([frame.width, frame.height]).toEqual([48, 48]);
  });

  test('"1. x" over two lines with the picture: the marker stays with the first line of the words', async () => {
    await render(<Prompt text={`1. Look at this picture\nplease, the one below ${PICTURE}`} picture={bytes} />);
    const { flow } = markerInFlow(/^Look at this picture\s*please, the one below/);
    const { press } = picture();
    expect(press.parent).toBe(flow);
  });

  test('"x 1." with the picture: no list, the words and the picture in one paragraph of the bubble', async () => {
    await render(<Prompt text={`Look at this picture please 1. ${PICTURE}`} picture={bytes} />);
    expect(screen.queryByText('1.')).toBeNull();
    const { press, frame } = picture();
    const words = screen.getByText(/Look at this picture please 1\./);
    expect(press.parent).toBe(words.parent);
    expect([frame.width, frame.height]).toEqual([48, 48]);
  });
});

test('"1. x" without a picture: the marker keeps its column beside the body', async () => {
  await render(<Prompt text={'1. Look at this\n2. And at that'} picture={PORTRAIT} />);
  // The item: its marker, then its body (`Markdown.tsx`).
  const marker = screen.getByText('1.').parent;
  const item = marker?.parent;
  const body = item?.children[1];
  if (item == null || body === undefined || typeof body === 'string') throw new Error('Missing list body');
  expect(styleOf(item).flexDirection).toBe('row');
  expect(item.children[0]).toBe(marker);
  // Sized by its content (no zero flex basis), and free to shrink to the bubble.
  const style = styleOf(body);
  expect(style.flex).toBeUndefined();
  expect(style.flexBasis ?? 'auto').toBe('auto');
  expect(style.flexShrink).toBe(1);
  expect(style.minWidth).toBe(0);
  expect(isWithin(screen.getByText('Look at this'), body)).toBe(true);
});
