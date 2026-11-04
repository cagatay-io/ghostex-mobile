/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A question form's words with their links (`LinkedWords`, the
 * core's Markdown from gx-chat-core `questions/form_links.rs`): the escaped words read exactly as
 * written, and a tap on a link sends `openMarkdownLink` like a message's link.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { TranscriptEnvProvider, type TranscriptEnv } from '../context';
import { transcriptTheme } from '../theme';
import { LinkedWords } from './Markdown';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../transcriptMenuStore', () => ({ openTranscriptMenu: () => undefined }));
// The message renderer's neighbours (overlays, charts, pictures, forms) load native modules Jest
// cannot; the words under test use none of them.
jest.mock('../../cards', () => ({ openChatTablePreview: () => undefined, tableCsv: () => '' }));
jest.mock('../VisualBlock', () => ({ VisualBlock: () => null }));
jest.mock('../Images', () => ({ InlineImage: () => null, PictureStrip: () => null }));
jest.mock('../QuestionForm', () => ({ QuestionForm: () => null }));

function env(dispatch: TranscriptEnv['dispatch']): TranscriptEnv {
  return {
    dispatch,
    theme: transcriptTheme('dark'),
    simple: false,
    workOpen: false,
    filePreviews: false,
    mutedThinking: false,
    main: true,
  };
}

test('a link in a question opens on a tap and the rest reads as written', async () => {
  const dispatch = jest.fn();
  await render(
    <TranscriptEnvProvider value={env(dispatch)}>
      <LinkedWords
        // What the core writes for "1. Keep [#407](https://github.com/o/r/pull/407)'s *style*?".
        markdown={"1\\. Keep [#407](<https://github.com/o/r/pull/407>)'s \\*style\\*?"}
        references={[
          {
            href: 'https://github.com/o/r/pull/407',
            sourceLabel: '#407',
            label: '#407',
            title: 'https://github.com/o/r/pull/407',
            kind: 'url',
          },
        ]}
        style={{ fontSize: 15 }}
      />
    </TranscriptEnvProvider>,
  );
  // One run of text: the escapes are gone and the link sits inside it.
  expect(screen.getByText("1. Keep #407's *style*?")).toBeTruthy();
  await fireEvent.press(screen.getByRole('link'));
  expect(dispatch).toHaveBeenCalledWith({
    type: 'openMarkdownLink',
    href: 'https://github.com/o/r/pull/407',
    external: false,
  });
});
