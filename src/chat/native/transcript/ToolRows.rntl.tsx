/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A cancelled OMP background job reaches the phone as a tool row whose
 * `status` is `stopped` (gx-chat-core `transcript_rows.rs`, `is_stopped_task`): it takes the tool-call
 * card's stopped look, a muted name and a muted cross, so it reads as neither done nor failed. A
 * finished call keeps its green check and a failed one its red name and cross; a running call shows no
 * mark, as before. The real `ToolRows` (the rows, not the tool-call card); mocked are storage (the
 * library's own Jest mock), the glyph drawing, which reports its name and colour, and what draws with
 * Reanimated, whose worklets runtime is native and does not load under Jest: the tool-call card, the
 * cards area's table preview and image viewer and ```visual blocks, none of which these rows show.
 */

import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { render, renderHook, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultSettings, useSettingsStore } from '../../../settings/store';
import type { ProjectedMessage } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { NativeChatUiProvider, TranscriptEnvProvider, type TranscriptEnv } from './context';
import { ToolRows } from './ToolRows';
import { useTranscriptTheme, type TranscriptTheme } from './theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('../cards', () => ({
  subagentOpenAction: jest.requireActual('../cards/AgentPanels').subagentOpenAction,
  openChatTablePreview: () => undefined,
  openChatImageViewer: () => undefined,
  tableCsv: () => '',
}));
jest.mock('./ToolCard', () => ({ ToolCard: () => null }));
jest.mock('./VisualBlock', () => ({ VisualBlock: () => null }));
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

beforeEach(async () => {
  const previous = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...defaultSettings(), sessionChatTheme: 'dark' } });
  const dark = await renderHook(useTranscriptTheme);
  DARK = dark.result.current;
  await dark.unmount();
  useSettingsStore.setState({ settings: previous });
});
/** A finished call's check (`ToolCard.tsx`, desktop `ChatAppearance::success`). */
const GREEN = '#34d399';

const chat = { dispatch: () => undefined, query: () => null, queryAsync: async () => null } as unknown as RustChat;

function Frame({ children }: { children: ReactNode }) {
  const env: TranscriptEnv = {
    dispatch: () => undefined,
    theme: DARK,
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

/** One background job's row as the core sends it (`BACKGROUND_COMMAND_TOOL`, the job's own label). */
function job(label: string, status: string, extra: object = {}) {
  return {
    name: 'Background command',
    label,
    description: label,
    glyph: 'terminal',
    status,
    failed: status === 'failed',
    failure: '',
    duration: '',
    hasDetail: false,
    ...extra,
  };
}

async function show(tools: object[]) {
  const message = { id: 'omp-jobs-1', tools } as unknown as ProjectedMessage;
  await render(
    <Frame>
      <ToolRows message={message} />
    </Frame>,
  );
}

/** A row's name colour and the marks at its right edge (the glyph tile's tool glyph left out). */
function look(label: string) {
  const name = screen.getByText(label);
  const button = screen.getByRole('button', { name: `Tool ${label}` });
  const marks = button.children
    .filter((child): child is TestInstance => typeof child !== 'string' && /^glyph:/.test(child.props.testID ?? ''))
    .map((glyph) => ({ glyph: glyph.props.testID as string, color: glyph.props.accessibilityHint as string }));
  return { color: StyleSheet.flatten(name.props.style).color, marks };
}

test('a cancelled job’s row (`stopped`) has a muted name and a muted cross, no check', async () => {
  await show([job('cargo test --workspace', 'stopped')]);
  expect(look('cargo test --workspace')).toEqual({
    color: DARK.muted,
    marks: [{ glyph: 'glyph:x', color: DARK.muted }],
  });
});

test('a finished job keeps its green check, a failed one its red name and cross', async () => {
  await show([job('bun run build', 'done'), job('bun run lint', 'failed')]);
  expect(look('bun run build').marks).toEqual([{ glyph: 'glyph:check', color: GREEN }]);
  expect(look('bun run build').color).not.toBe(DARK.muted);
  expect(look('bun run lint')).toEqual({ color: DARK.error, marks: [{ glyph: 'glyph:x', color: DARK.error }] });
});

test('a running call shows no mark, as before', async () => {
  await show([job('bun run dev', 'running')]);
  expect(look('bun run dev').marks).toEqual([]);
});
