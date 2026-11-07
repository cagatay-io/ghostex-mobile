/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings › Voice against two fake computers: the page reads Dictate
 * from the picked computer's gxserver, downloads a local model with progress, saves the engine
 * there, and the picker at the top switches to the other computer, whose settings are its own.
 * Mocked are the boundaries only: each computer's gxserver (`chatMachineLink`), navigation, the
 * native module, storage and the safe area; the page, its stores and its controls are the real ones.
 */

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useMachinesStore, type MachineRecord } from '../../machines/store';
import { useDictateStore } from '../../voice/dictateSettings';
import VoicePage from './VoicePage';

type Fake = {
  settings: Record<string, unknown>;
  modelState: string;
  received: number;
  calls: string[];
  /** The computer's `hex` block; absent on an older Ghostex. */
  hex?: Record<string, unknown>;
  hexInstalls?: number;
};
const mockComputers: Record<string, Fake> = {};

function mockOverview(fake: Fake) {
  const settings = fake.settings as { engine: string; localModel: string };
  const ready = fake.modelState === 'ready';
  return {
    settings,
    engine: {
      engine: settings.engine,
      label: settings.engine === 'local' ? 'Local, Parakeet v3' : 'xAI speech to text',
      modelId: settings.engine === 'local' ? settings.localModel : null,
      ready: settings.engine === 'local' && ready,
      problem: null,
      polish: true,
    },
    keys: { xai: { configured: false, unreadable: false }, openai: { configured: false, unreadable: false } },
    models: [mockModel(fake)],
    localAvailable: true,
    modelsDiskBytes: ready ? 723_000_000 : 0,
    projectWords: ['Ghostex'],
    polishAvailable: true,
    languages: [{ code: 'auto', label: 'Auto-detect' }],
    ...(fake.hex ? { hex: fake.hex } : {}),
  };
}

const hexView = (state: string, extra: Record<string, unknown> = {}) => ({
  available: true,
  state,
  version: state === 'ready' ? '3.3.0' : null,
  olderVersion: null,
  models: [],
  model: null,
  ready: state === 'ready',
  problem: null,
  downloadUrl: 'https://github.com/anomalyco/hex#downloads',
  ...extra,
});

function mockModel(fake: Fake) {
  return {
    id: 'parakeet-tdt-0.6b-v3',
    title: 'Parakeet TDT 0.6B v3',
    shortTitle: 'Parakeet v3',
    languagesLabel: 'English + 24 European languages',
    languages: ['en'],
    speedLabel: 'Fastest',
    downloadBytes: 700_000_000,
    diskBytes: 723_000_000,
    state: fake.modelState,
    download: fake.modelState === 'downloading' ? { receivedBytes: fake.received, totalBytes: 700_000_000, error: null } : null,
    inUse: true,
    attribution: 'Parakeet TDT 0.6B v3 by NVIDIA, CC BY 4.0',
  };
}

jest.mock('../../chat/rust/machine-link', () => ({
  UNREACHABLE_MESSAGE: "Couldn't reach it.",
  chatMachineLink: (machine: { id: string }) => ({
    route: async () => 'socket',
    rpc: async (method: string, params: { patch?: Record<string, unknown>; id?: string }) => {
      const fake = mockComputers[machine.id]!;
      fake.calls.push(method);
      switch (method) {
        case 'readDictateSettings':
          return { result: mockOverview(fake), error: null };
        case 'setDictateSettings':
          fake.settings = { ...fake.settings, ...params.patch };
          return { result: mockOverview(fake), error: null };
        case 'downloadSpeechModel':
          fake.modelState = 'downloading';
          fake.received = 0;
          return { result: { model: mockModel(fake) }, error: null };
        case 'listSpeechModels':
          // Each poll moves the download on by half; the third finds it ready.
          if (fake.modelState === 'downloading') {
            fake.received += 350_000_000;
            if (fake.received > 700_000_000) fake.modelState = 'ready';
          }
          return { result: { models: [mockModel(fake)] }, error: null };
        case 'readDictateEngine':
          return { result: mockOverview(fake).engine, error: null };
        case 'readVoiceAgent':
          return { result: { callMode: 'regular' }, error: null };
        case 'managedTools': {
          const tool = params as { action?: string; tool?: string; operation?: string };
          if (tool.action === 'start' && tool.tool === 'hex') {
            fake.hexInstalls = (fake.hexInstalls ?? 0) + 1;
            // The install finishes at once: Hex is installed but not running yet.
            fake.hex = hexView('notRunning');
            return { result: { id: 'hex', supported: true, installed: true, actions: ['update'] }, error: null };
          }
          return { result: { tools: [{ id: 'hex', supported: true, installed: fake.hexInstalls !== undefined, actions: [] }] }, error: null };
        }
        case 'agentCliMaintenance':
          return { result: { agents: [] }, error: null };
        case 'machineIntegrations':
          return { result: { skills: [] }, error: null };
        default:
          return { error: { code: 'notFound', message: `unknown ${method}` } };
      }
    },
  }),
}));
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: ReactNode }) => children,
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: () => undefined }),
}));
jest.mock('../../components/common/verticalBar/VerticalBarArea', () => ({
  useHeaderPlacement: () => ({ kind: 'top' }),
  useScrollToBarEdges: () => ({ scroll: undefined, content: undefined }),
  useVerticalBarSpace: () => ({ left: 0, right: 0, padding: undefined }),
}));
jest.mock('./useAppearanceHeader', () => ({ useAppearanceHeader: () => undefined }));

const machine = (id: string, name: string): MachineRecord => ({
  id,
  name,
  host: `${id}.local`,
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
});

const fresh = (): Fake => ({
  settings: {
    engine: 'local',
    localModel: 'parakeet-tdt-0.6b-v3',
    language: 'auto',
    dictionary: [],
    addProjectNames: true,
    removeFillers: true,
    polish: { enabled: true, model: 'claude-sonnet-5-5', prompt: null },
  },
  modelState: 'notDownloaded',
  received: 0,
  calls: [],
});

beforeEach(() => {
  mockComputers.mac = fresh();
  mockComputers.linux = { ...fresh(), settings: { ...fresh().settings, engine: 'xai' } };
  useMachinesStore.setState({
    machines: [machine('mac', 'MacBook Pro'), machine('linux', 'home-server')],
    selectedMachineId: 'mac',
  });
  useDictateStore.setState({ machineId: null, loadedFor: null, overview: null, status: 'loading', problem: null });
});

test('the selected computer’s Dictate settings show, and its model downloads with progress', async () => {
  await render(<VoicePage />);
  expect(await screen.findByText('Dictate on MacBook Pro')).toBeTruthy();
  expect(screen.getByText("Parakeet v3 isn't downloaded yet. Download it below (0.70 GB).")).toBeTruthy();
  expect(screen.getByText('Voice agent on MacBook Pro')).toBeTruthy();
  expect(screen.getByText('This phone')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Download Parakeet v3'));
  expect(await screen.findByText(/^Downloading 50% · /, undefined, { timeout: 3000 })).toBeTruthy();
  expect(await screen.findByText(/^In use · /, undefined, { timeout: 4000 })).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/transcribes on its own CPU/)).toBeTruthy(), { timeout: 3000 });
  expect(mockComputers.mac!.calls).toContain('downloadSpeechModel');
  expect(mockComputers.linux!.calls).toHaveLength(0);
});

test('the engine is saved on the computer, and the picker switches to another one', async () => {
  await render(<VoicePage />);
  await screen.findByText('Dictate on MacBook Pro');

  await fireEvent.press(screen.getByLabelText('xAI'));
  expect(mockComputers.mac!.settings.engine).toBe('xai');
  expect(screen.getByText('MacBook Pro has no xAI key yet. Add it in Ghostex Settings › Voice there.')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Voice settings for MacBook Pro'));
  expect(await screen.findAllByText('Dictate: xAI speech to text')).toHaveLength(2);
  await fireEvent.press(screen.getByText('home-server'));
  expect(await screen.findByText('Dictate on home-server')).toBeTruthy();
  expect(mockComputers.linux!.calls).toContain('readDictateSettings');
  // home-server keeps its own engine; the Mac's change never reached it.
  expect(mockComputers.linux!.settings.engine).toBe('xai');
  expect(mockComputers.mac!.settings.engine).toBe('xai');
});

test('Hex is offered where the computer says Hex 3 ships, and Install Hex installs it there', async () => {
  mockComputers.mac!.hex = hexView('notInstalled');
  mockComputers.linux!.hex = { ...hexView('unsupported'), available: false };
  await render(<VoicePage />);
  expect(await screen.findByText('Dictate on MacBook Pro')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Hex'));
  expect(mockComputers.mac!.settings.engine).toBe('hex');
  expect(await screen.findByText("Hex 3 isn't installed on MacBook Pro. Install it there to transcribe with Hex.")).toBeTruthy();

  await fireEvent.press(screen.getByText('Install Hex'));
  await waitFor(() => expect(mockComputers.mac!.hexInstalls).toBe(1));
  expect(await screen.findByText("Hex isn't running on MacBook Pro. Open Hex there, then check again.", undefined, { timeout: 4000 })).toBeTruthy();
  expect(screen.getByText('Check again')).toBeTruthy();
});

test('a running Hex offers the models it has ready, and the pick is saved on the computer', async () => {
  mockComputers.mac!.settings = { ...mockComputers.mac!.settings, engine: 'hex' };
  mockComputers.mac!.hex = hexView('ready', {
    models: [
      { id: 'parakeet_v3', name: 'Parakeet v3', languages: ['en'], supportsLanguageDetection: false },
      { id: 'sense_voice_small', name: 'SenseVoice Small', languages: ['en'], supportsLanguageDetection: true },
    ],
    model: 'parakeet_v3',
  });
  await render(<VoicePage />);
  expect(await screen.findByText('SenseVoice Small')).toBeTruthy();
  expect(screen.getByText('Hex 3.3.0 on MacBook Pro transcribes with Parakeet v3. Recordings stay on MacBook Pro.')).toBeTruthy();
  await fireEvent.press(screen.getByText('SenseVoice Small'));
  expect(mockComputers.mac!.settings.hexModel).toBe('sense_voice_small');
});

test('a computer where Hex 3 has no build, or an older Ghostex, has no Hex option', async () => {
  mockComputers.mac!.hex = { ...hexView('unsupported'), available: false };
  await render(<VoicePage />);
  expect(await screen.findByText('Dictate on MacBook Pro')).toBeTruthy();
  expect(screen.queryByLabelText('Hex')).toBeNull();
  expect(screen.getByLabelText('xAI')).toBeTruthy();
});
