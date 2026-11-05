/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Voice mode on the iPhone (issue #412): the voice agent, Dictate and
 * Read aloud are on for iOS, the microphone is asked for through the native module there (Android
 * asks from JavaScript), a refusal names the iPhone's Settings, and the iPhone's voices show their
 * own names. jest-expo runs as iOS; the native module is the only thing mocked.
 */

import { PermissionsAndroid, Platform } from 'react-native';

import type { SpeechVoice } from '../../modules/ghostex-native/src';
import { phoneVoiceSettings, voiceLabel } from '../screens/settings/ReadAloudVoicePage';
import { startVoice, useVoiceStore, VOICE_SUPPORTED } from './conversation';
import { microphoneAllowed, microphoneDeniedMessage } from './microphone';

const mockNative = {
  addListener: jest.fn(() => ({ remove: () => undefined })),
  microphonePermission: jest.fn(() => Promise.resolve(true)),
  voiceStart: jest.fn(() => Promise.resolve('voice-1')),
  voiceStatus: jest.fn(() => Promise.resolve(null)),
};

// A getter: the factory runs when the imports above load, before `mockNative` is assigned.
jest.mock('../../modules/ghostex-native/src', () => ({
  get GhostexNative() {
    return mockNative;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MACHINE = { id: 'mac', host: 'mac.local', port: 22, username: 'me' } as never;

beforeEach(() => {
  jest.clearAllMocks();
  useVoiceStore.setState({ phase: 'idle', problem: null, endedMessage: null });
});

describe('voice mode on iOS', () => {
  it('is supported on the iPhone', () => {
    expect(Platform.OS).toBe('ios');
    expect(VOICE_SUPPORTED).toBe(true);
  });

  it('asks the native module for the microphone, not PermissionsAndroid', async () => {
    const check = jest.spyOn(PermissionsAndroid, 'check');
    mockNative.microphonePermission.mockResolvedValueOnce(true);
    await expect(microphoneAllowed()).resolves.toBe(true);
    mockNative.microphonePermission.mockResolvedValueOnce(false);
    await expect(microphoneAllowed()).resolves.toBe(false);
    mockNative.microphonePermission.mockRejectedValueOnce(new Error('no module'));
    await expect(microphoneAllowed()).resolves.toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("names each phone's Settings when the microphone is refused", () => {
    expect(microphoneDeniedMessage('dictate', 'ios')).toBe(
      'Ghostex needs microphone access to dictate. Allow it in iPhone Settings › Apps › Ghostex › Microphone.',
    );
    expect(microphoneDeniedMessage('dictate', 'android')).toBe(
      'Ghostex needs microphone access to dictate. Allow it in Android Settings › Apps › Ghostex › Permissions.',
    );
  });

  it('ends a call before it opens when the microphone is refused, and says where to allow it', async () => {
    mockNative.microphonePermission.mockResolvedValueOnce(false);
    await startVoice(MACHINE, 'Mac');
    const state = useVoiceStore.getState();
    expect(state.phase).toBe('ended');
    expect(state.problem).toEqual({
      code: 'microphone',
      message:
        'Ghostex needs microphone access to talk with the voice agent. Allow it in iPhone Settings › Apps › Ghostex › Microphone.',
    });
    expect(mockNative.voiceStart).not.toHaveBeenCalled();
  });
});

describe("Read aloud's voices on iOS", () => {
  const ava: SpeechVoice = {
    name: 'com.apple.voice.premium.en-US.Ava',
    label: 'Ava (Premium)',
    language: 'en',
    locale: 'en-US',
    localeLabel: 'English (United States)',
    network: false,
    notInstalled: false,
  };

  it('shows an iPhone voice by its own name', () => {
    expect(voiceLabel(ava)).toBe('Ava (Premium)');
  });

  it("keeps Android's short names", () => {
    expect(voiceLabel({ ...ava, name: 'en-us-x-iob-local', label: undefined })).toBe('Voice iob');
    expect(voiceLabel({ ...ava, name: 'en-us-x-iob-network', label: undefined, network: true })).toBe(
      'Voice iob (online)',
    );
  });

  it("points to the iPhone's Spoken Content voices", () => {
    expect(phoneVoiceSettings('ios').defaultVoice).toContain(
      'iPhone Settings › Accessibility › Spoken Content › Voices',
    );
    expect(phoneVoiceSettings('android').defaultVoice).toBe(
      'The voice set in Android Settings › Text-to-speech output.',
    );
  });
});
