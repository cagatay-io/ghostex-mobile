/**
 * The composer's Dictate control: Grok dictation through the computer's gxserver
 * (`src/voice/dictation.ts`). Pressing the microphone starts listening and pressing it again stops;
 * the text gxserver sends back replaces the dictated span of the draft as it grows.
 *
 * CDXC:SessionChat 2026-10-08 DECISION: User asked for voice input in the chat box, to the left of the Terminal View button, on the desktop and the phone (GPUI Kit's speech input, #3333, on the desktop). Pressing the microphone starts listening and pressing it again stops; recognized text is typed into the draft and never sent by itself.
 * CDXC:SessionChat 2026-10-08 SEE-ALSO: `apps/desktop/src/app/native_chat/dictation.rs` is the desktop's control.
 * CDXC:VoiceMode 2026-10-20 DECISION: User: "use grok bot's api for the dictation mic button" and "the one in the chat box just pastes whatever i say into the chat box". Dictate uses xAI speech-to-text through gxserver (`/api/voice?mode=dictation`) with the key kept on the computer, instead of the platform recognizer; the platform recognizer code below is kept but unused (user: "keep but mark the old code as unused").
 */

import { requireOptionalNativeModule } from 'expo';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MachineConnectionTarget } from '../../../machines/credentials';
import { dictationSupported, startDictation, type Dictation } from '../../../voice/dictation';
import { chatMachineLink } from '../../rust/machine-link';

type Subscription = { remove(): void };
type SpeechNative = {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  addListener(event: 'start' | 'end', listener: () => void): Subscription;
  addListener(event: 'result', listener: (event: ExpoSpeechRecognitionResultEvent) => void): Subscription;
  addListener(event: 'error', listener: (event: ExpoSpeechRecognitionErrorEvent) => void): Subscription;
};

const speech = requireOptionalNativeModule<SpeechNative>('ExpoSpeechRecognition');

/**
 * The switch for the Dictate control.
 *
 * CDXC:VoiceMode 2026-10-20 DECISION: The Dictate control is back on the phone, on Grok dictation (supersedes the 2026-10-09 decision that hid it on every OS until it was tested: the user asked for it to return with xAI speech-to-text). It shows only when the chat's computer lists the `voiceAgent` capability.
 * CDXC:SessionChat 2026-10-09 SEE-ALSO: the desktop's switch is `DICTATION_ENABLED` in `apps/desktop/src/app/native_chat/dictation.rs`.
 */
const DICTATION_ENABLED = true;

/**
 * The dictated span of the draft: the text around the caret when dictation started. Each new
 * transcript is put between them, a space apart from the text on either side.
 */
type DictationAnchor = { before: string; after: string };

/**
 * Grok dictation into the draft. `draft()` reads the composer's text and caret when dictation
 * starts; `replace` writes the draft with the dictated text in place; `onError` gets a short
 * message for a failure the reader should know about (no microphone permission, no xAI key on the
 * computer).
 */
export function useDictation(
  machine: MachineConnectionTarget | null,
  draft: () => { text: string; caret: number },
  replace: (text: string) => void,
  onError: (message: string) => void
) {
  const [available, setAvailable] = useState(() => DICTATION_ENABLED && dictationSupported(machine));
  const [listening, setListening] = useState(false);
  const running = useRef<Dictation | null>(null);
  const starting = useRef(false);
  const callbacks = useRef({ draft, replace, onError });
  callbacks.current = { draft, replace, onError };

  useEffect(() => {
    if (!DICTATION_ENABLED || machine === null) {
      setAvailable(false);
      return undefined;
    }
    const link = chatMachineLink(machine);
    const refresh = () => setAvailable(dictationSupported(machine));
    refresh();
    void link.route().then(refresh, refresh);
    return link.onRouteChange(refresh);
  }, [machine]);

  // Leaving the chat drops a dictation still running.
  useEffect(() => () => running.current?.cancel(), []);

  const toggle = useCallback(async () => {
    if (machine === null || starting.current) return;
    if (running.current !== null) {
      running.current.stop();
      return;
    }
    const { text, caret } = callbacks.current.draft();
    const anchor: DictationAnchor = { before: text.slice(0, caret), after: text.slice(caret) };
    starting.current = true;
    setListening(true);
    const dictation = await startDictation(machine, {
      onText: (dictated) => {
        const words = dictated.trim();
        if (words.length === 0) return;
        const lead = anchor.before.length > 0 && !/\s$/.test(anchor.before) ? ' ' : '';
        const trail = anchor.after.length > 0 && !/^\s/.test(anchor.after) ? ' ' : '';
        callbacks.current.replace(anchor.before + lead + words + trail + anchor.after);
      },
      onEnd: () => {
        running.current = null;
        setListening(false);
      },
      onError: (message) => callbacks.current.onError(message),
    });
    starting.current = false;
    if (dictation === null) setListening(false);
    else running.current = dictation;
  }, [machine]);

  return { available, listening, toggle };
}

/**
 * UNUSED since 2026-10-20 (CDXC:VoiceMode DECISION above): the platform speech recognizer
 * (`expo-speech-recognition`) the Dictate control used before Grok dictation. Kept, not wired.
 */
const SYSTEM_DICTATION_ENABLED = false;

function recognitionAvailable(): boolean {
  if (!SYSTEM_DICTATION_ENABLED) return false;
  try {
    return speech?.isRecognitionAvailable() ?? false;
  } catch {
    return false;
  }
}

/** The device's language for the recognizer, or the recognizer's own default. */
function deviceLanguage(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || undefined;
  } catch {
    return undefined;
  }
}

/**
 * UNUSED since 2026-10-20: the platform recognizer's Dictate. `onPhrase` receives each recognized
 * phrase; `onError` a short message for a failure the reader should know about (no microphone
 * permission, no recognizer for the language).
 */
export function useSystemDictation(onPhrase: (text: string) => void, onError: (message: string) => void) {
  const [available] = useState(recognitionAvailable);
  const [listening, setListening] = useState(false);
  const phrase = useRef(onPhrase);
  const failure = useRef(onError);
  phrase.current = onPhrase;
  failure.current = onError;

  useEffect(() => {
    if (speech === null || !available) return;
    const subscriptions = [
      speech.addListener('start', () => setListening(true)),
      speech.addListener('end', () => setListening(false)),
      speech.addListener('result', (event) => {
        const text = event.results[0]?.transcript?.trim();
        if (event.isFinal && text) phrase.current(text);
      }),
      speech.addListener('error', (event) => {
        setListening(false);
        // Stopping, or a pause with nothing said, is not a failure the reader needs to hear about.
        if (event.error === 'aborted' || event.error === 'no-speech' || event.error === 'speech-timeout') return;
        failure.current(event.message || 'Dictation stopped.');
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [available]);

  const toggle = useCallback(async () => {
    if (speech === null) return;
    if (listening) {
      speech.stop();
      return;
    }
    const permission = await speech.requestPermissionsAsync();
    if (!permission.granted) {
      failure.current('Ghostex needs microphone and speech recognition access to dictate.');
      return;
    }
    speech.start({ lang: deviceLanguage(), interimResults: false, continuous: true, addsPunctuation: true });
  }, [listening]);

  return { available, listening, toggle };
}
