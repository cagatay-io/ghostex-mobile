/**
 * Grok dictation for the chat composer: the microphone streams to the computer's gxserver
 * (`/api/voice?mode=dictation`), which transcribes it with xAI using the key kept on the computer
 * and sends the text back (contract section 4). The text only ever goes into the draft.
 */

import { PermissionsAndroid } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import type { MachineConnectionTarget } from '../machines/credentials';
import { VOICE_SUPPORTED } from './conversation';

export type DictationHandlers = {
  /** The whole dictation so far (locked segments plus the current guess); replaces the dictated span. */
  onText(text: string): void;
  /** Dictation stopped: `text` is the final text, or null when it was cancelled or failed. */
  onEnd(text: string | null): void;
  onError(message: string): void;
};

/** One sentence per error code, in the phone's words. */
function dictationProblem(code: string, serverMessage: string): string {
  switch (code) {
    case 'noKey':
      return 'Dictation uses your xAI API key: add it in Ghostex Settings › Voice agent on your computer.';
    case 'badKey':
      return 'xAI refused the API key saved on your computer. Check it in Ghostex Settings › Voice agent.';
    case 'providerUnavailable':
      return "Couldn't reach xAI from your computer. Check its internet connection and try again.";
    default:
      return serverMessage || 'Dictation stopped.';
  }
}

/** Whether the computer's gxserver can dictate (it lists the `voiceAgent` capability). */
export function dictationSupported(machine: MachineConnectionTarget | null): boolean {
  if (!VOICE_SUPPORTED || machine === null) return false;
  return chatMachineLink(machine).capabilities()?.includes('voiceAgent') === true;
}

/** The device's language as a BCP-47 primary tag ("en"), the recognizer's hint. */
function deviceLanguage(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.split('-')[0] || undefined;
  } catch {
    return undefined;
  }
}

/** A running dictation: `stop` asks for the final text, `cancel` drops it. */
export type Dictation = { stop(): void; cancel(): void };

/** Starts dictating to `machine`'s gxserver. Resolves null (after `onError`) when it cannot start. */
export async function startDictation(machine: MachineConnectionTarget, handlers: DictationHandlers): Promise<Dictation | null> {
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const allowed =
    (await PermissionsAndroid.check(permission)) || (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
  if (!allowed) {
    handlers.onError('Ghostex needs microphone access to dictate. Allow it in Android Settings › Apps › Ghostex › Permissions.');
    return null;
  }
  let forward;
  try {
    forward = await chatMachineLink(machine).gxserverLink();
  } catch {
    forward = null;
  }
  if (forward === null || !forward.capabilities.includes('voiceAgent')) {
    handlers.onError("Couldn't reach Ghostex on this computer for dictation.");
    return null;
  }
  let sessionId: string | null = null;
  let latest = '';
  let ended = false;
  const end = (text: string | null) => {
    if (ended) return;
    ended = true;
    subscription.remove();
    handlers.onEnd(text);
  };
  const subscription = GhostexNative.addListener('onVoiceEvent', (event) => {
    if (event.mode !== 'dictation' || sessionId === null || event.sessionId !== sessionId) return;
    if (event.kind === 'status') {
      if (event.status === 'failed') {
        handlers.onError("Couldn't reach Ghostex on this computer for dictation.");
        end(null);
      } else if (event.status === 'micError') {
        handlers.onError(event.message ?? 'The microphone stopped.');
      } else if (event.status === 'closed') {
        end(event.message === 'cancelled' ? null : latest);
      }
      return;
    }
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(event.json) as Record<string, unknown>;
    } catch {
      return;
    }
    const text = typeof frame.text === 'string' ? frame.text : '';
    if (frame.type === 'transcript') {
      latest = text;
      handlers.onText(text);
    } else if (frame.type === 'done') {
      latest = text;
      handlers.onText(text);
      end(text);
    } else if (frame.type === 'error') {
      handlers.onError(dictationProblem(typeof frame.code === 'string' ? frame.code : '', typeof frame.message === 'string' ? frame.message : ''));
      if (frame.fatal === true) {
        void GhostexNative.voiceCancel('dictation').catch(() => undefined);
        end(null);
      }
    }
  });
  try {
    sessionId = await GhostexNative.voiceStart({
      mode: 'dictation',
      localPort: forward.localPort,
      authToken: forward.authToken,
      title: '',
      language: deviceLanguage(),
    });
  } catch {
    handlers.onError("Couldn't start the microphone.");
    end(null);
    return null;
  }
  return {
    stop: () => void GhostexNative.voiceEnd('dictation').catch(() => end(latest)),
    cancel: () => void GhostexNative.voiceCancel('dictation').catch(() => end(null)),
  };
}
