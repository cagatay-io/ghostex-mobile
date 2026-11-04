/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A question's words with their links (`LinkWords`, the core's runs
 * from gx-chat-core `questions/form_links.rs`): the words read as one run of text in its own
 * colour, a link has the dotted underline, a tap on it sends `openMarkdownLink` like a message's
 * link, and a bare `#407` stays text.
 */

import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TranscriptEnvProvider, type TranscriptEnv } from './context';
import { LinkWords } from './LinkWords';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function env(dispatch: TranscriptEnv['dispatch']): TranscriptEnv {
  return {
    dispatch,
    theme: {} as TranscriptEnv['theme'],
    simple: false,
    workOpen: false,
    filePreviews: false,
    mutedThinking: false,
    main: true,
  };
}

test('a link in a question keeps the text colour, has dotted dots and opens on a tap', async () => {
  const dispatch = jest.fn();
  await render(
    <TranscriptEnvProvider value={env(dispatch)}>
      <LinkWords
        text="randomsand's asks ([Discord](https://discord.com/c/2)) on #407?"
        runs={[
          { text: "randomsand's asks (" },
          { text: 'Discord', href: 'https://discord.com/c/2' },
          { text: ') on ' },
          { text: '#407', issue: '407' },
          { text: '?' },
        ]}
        color="#9e9e9e"
        style={{ fontSize: 13 }}
      />
    </TranscriptEnvProvider>,
  );
  expect(screen.getByText("randomsand's asks (Discord) on #407?")).toBeTruthy();
  const link = screen.getByRole('link');
  expect(StyleSheet.flatten(link.props.style)).toMatchObject({
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: '#9e9e9e80',
  });
  expect(StyleSheet.flatten(link.props.style).color).toBeUndefined();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  await fireEvent.press(link);
  expect(dispatch).toHaveBeenCalledWith({ type: 'openMarkdownLink', href: 'https://discord.com/c/2', external: false });
});

test('words without runs are plain text', async () => {
  await render(
    <TranscriptEnvProvider value={env(jest.fn())}>
      <LinkWords text="Plain *words*" runs={undefined} color="#fcfcfc" style={{ fontSize: 15 }} />
    </TranscriptEnvProvider>,
  );
  expect(screen.getByText('Plain *words*')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});
