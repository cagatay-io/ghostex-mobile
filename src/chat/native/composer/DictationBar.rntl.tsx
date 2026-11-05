/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Dictate's row above the chat box names what transcribes, offers
 * Skip while AI polish runs, and on a missing local model offers its download instead of
 * Transcribe again. The real `DictationBar`; mocked are the native module and storage.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { DictationBar } from './DictationBar';

// The bar's module reaches the recorder through `useDictation.ts`; nothing here records.
jest.mock('../../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const handlers = () => ({ onCancel: jest.fn(), onRetry: jest.fn(), onSkip: jest.fn(), onFix: jest.fn() });

test('recording and transcribing name the engine', async () => {
  const on = handlers();
  await render(
    <DictationBar phase="recording" elapsedMs={7_000} failure={null} engine="Local, Parakeet v3" download={null} fix={null} {...on} />,
  );
  expect(screen.getByText('Recording 0:07 · Local, Parakeet v3')).toBeTruthy();
  await render(
    <DictationBar phase="transcribing" elapsedMs={0} failure={null} engine="xAI speech to text" download={null} fix={null} {...on} />,
  );
  expect(screen.getByText('Transcribing with xAI speech to text…')).toBeTruthy();
});

test('polishing offers Skip', async () => {
  const on = handlers();
  await render(<DictationBar phase="polishing" elapsedMs={0} failure={null} engine={null} download={null} fix={null} {...on} />);
  expect(screen.getByText('Polishing with AI…')).toBeTruthy();
  await fireEvent.press(screen.getByText('Skip'));
  expect(on.onSkip).toHaveBeenCalledTimes(1);
});

test('a missing model offers its download, then shows its progress', async () => {
  const on = handlers();
  await render(
    <DictationBar
      phase="failed"
      elapsedMs={0}
      failure="Parakeet TDT 0.6B v3 isn't downloaded yet."
      engine="Local, Parakeet v3"
      download={null}
      fix={{ kind: 'download', label: 'Download Parakeet v3 (0.72 GB)' }}
      {...on}
    />,
  );
  expect(screen.queryByText('Transcribe again')).toBeNull();
  await fireEvent.press(screen.getByText('Download Parakeet v3 (0.72 GB)'));
  expect(on.onFix).toHaveBeenCalledTimes(1);
  await render(
    <DictationBar
      phase="downloading"
      elapsedMs={0}
      failure={null}
      engine="Local, Parakeet v3"
      download={{ title: 'Parakeet v3', percent: 42 }}
      fix={null}
      {...on}
    />,
  );
  expect(screen.getByText('Downloading Parakeet v3 · 42%')).toBeTruthy();
  expect(screen.getByText('Your recording is kept and transcribes as soon as the model is ready.')).toBeTruthy();
});

test('any other failure keeps Transcribe again', async () => {
  const on = handlers();
  await render(
    <DictationBar phase="failed" elapsedMs={0} failure="No key." engine={null} download={null} fix={null} {...on} />,
  );
  await fireEvent.press(screen.getByText('Transcribe again'));
  expect(on.onRetry).toHaveBeenCalledTimes(1);
});
