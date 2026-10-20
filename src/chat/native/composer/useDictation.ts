/**
 * The composer's Dictate control: the microphone records to a file on the phone first and, after
 * Stop, the computer's gxserver keeps and transcribes it (`src/voice/dictation.ts`); the text is
 * typed into the draft at the caret. While it records or transcribes, a row above the box shows it
 * with an ✕ that cancels (the recording is kept as dismissed); a failure stays in that row with
 * Transcribe again; a long press on the microphone offers Transcribe previous.
 *
 * CDXC:SessionChat 2026-10-08 DECISION: User asked for voice input in the chat box, to the left of the Terminal View button, on the desktop and the phone (GPUI Kit's speech input, #3333, on the desktop). Pressing the microphone starts listening and pressing it again stops; recognized text is typed into the draft and never sent by itself.
 * CDXC:SessionChat 2026-10-08 SEE-ALSO: `apps/desktop/src/app/native_chat/dictation.rs` is the desktop's control.
 * CDXC:VoiceMode 2026-10-20 DECISION: User: "use grok bot's api for the dictation mic button" and "the one in the chat box just pastes whatever i say into the chat box". Dictate uses xAI speech-to-text through gxserver with the key kept on the computer, instead of the platform recognizer; the platform recognizer code below is kept but unused (user: "keep but mark the old code as unused").
 * CDXC:VoiceMode 2026-10-20 SEE-ALSO: recording first and transcribing second, the Transcribing ✕, keeping cancelled recordings and Transcribe previous are the user's decision in the computer's `apps/desktop/src/app/voice_agent/dictation.rs`; the phone opens Transcribe previous on a long press (CDXC:SessionChat 2026-10-12 DECISION: actions open on a long press on the phone).
 */

import { requireOptionalNativeModule } from 'expo';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MachineConnectionTarget } from '../../../machines/credentials';
import {
  dictationSupported,
  dismissDictation,
  dismissLocal,
  latestUntranscribed,
  saveAndTranscribe,
  sendUnsent,
  startRecording,
  stopRecording,
  transcribeLatest,
  type Kept,
  type Transcription,
} from '../../../voice/dictation';
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

export type DictationPhase = 'idle' | 'starting' | 'recording' | 'transcribing' | 'failed';

/** `m:ss` for a recording's length. */
export function dictationClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Dictate into the draft. `draft()` reads the composer's text and caret when the text arrives;
 * `replace` writes the draft with the dictated text in place; `onError` gets a short message for a
 * problem no row shows (no microphone permission, nothing waiting for Transcribe previous).
 */
export function useDictation(
  machine: MachineConnectionTarget | null,
  draft: () => { text: string; caret: number },
  replace: (text: string) => void,
  onError: (message: string) => void
) {
  const [available, setAvailable] = useState(() => DICTATION_ENABLED && dictationSupported(machine));
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [failure, setFailure] = useState<{ kept: Kept; message: string } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const phaseRef = useRef<DictationPhase>('idle');
  phaseRef.current = phase;
  /** One per run: a cancel flips it and remembers the computer's id to dismiss. */
  const run = useRef<{ cancelled: boolean; serverId: string | null }>({ cancelled: false, serverId: null });
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

  // The recording row's clock.
  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Leaving the chat keeps a recording still running, as dismissed.
  useEffect(
    () => () => {
      if (phaseRef.current === 'recording' || phaseRef.current === 'starting') void stopRecording(true);
      run.current.cancelled = true;
    },
    []
  );

  const insert = useCallback((dictated: string) => {
    const words = dictated.trim();
    if (words.length === 0) return;
    const { text, caret } = callbacks.current.draft();
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const trail = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
    callbacks.current.replace(before + lead + words + trail + after);
  }, []);

  const settle = useCallback(
    (current: { cancelled: boolean }, result: Transcription | null) => {
      if (current.cancelled || result === null) return;
      if (result.kind === 'text') {
        setPhase('idle');
        insert(result.text);
      } else if (result.kind === 'nothing') {
        setPhase('idle');
        if (result.message) callbacks.current.onError(result.message);
      } else {
        setFailure({ kept: result.kept, message: result.message });
        setPhase('failed');
      }
    },
    [insert]
  );

  const transcribeKept = useCallback(
    async (kept: Kept | null) => {
      if (machine === null) return;
      const current = { cancelled: false, serverId: kept?.kind === 'server' ? kept.id : null };
      run.current = current;
      setFailure(null);
      setPhase('transcribing');
      const result =
        kept === null
          ? await transcribeLatest(machine, () => current.cancelled)
          : await saveAndTranscribe(machine, kept, () => current.cancelled, (id) => (current.serverId = id));
      settle(current, result);
    },
    [machine, settle]
  );

  const stop = useCallback(async () => {
    // Shown at once, so a second tap while the file closes does not stop it twice.
    setPhase('transcribing');
    const recording = await stopRecording(false);
    if (recording === null) {
      setPhase('idle');
      return;
    }
    await transcribeKept({ kind: 'local', recording });
  }, [transcribeKept]);

  const start = useCallback(async () => {
    if (machine === null) return;
    const current = { cancelled: false, serverId: null };
    run.current = current;
    setFailure(null);
    setPhase('starting');
    // Recordings an earlier run could not hand over go now, off the path of this one.
    void sendUnsent(machine);
    const started = await startRecording((message) => {
      // The microphone went away: what was recorded so far is transcribed.
      callbacks.current.onError(`${message} What was recorded so far is being transcribed.`);
      if (phaseRef.current === 'recording') void stop();
    });
    if ('error' in started) {
      setPhase('idle');
      callbacks.current.onError(started.error);
      return;
    }
    if (current.cancelled) {
      const recording = await stopRecording(true);
      if (recording !== null) void saveAndTranscribe(machine, { kind: 'local', recording }, () => true, () => undefined);
      return;
    }
    setStartedAt(Date.now());
    setNow(Date.now());
    setPhase('recording');
  }, [machine, stop]);

  /** The microphone button: start, or stop and transcribe. */
  const toggle = useCallback(async () => {
    if (phaseRef.current === 'recording') await stop();
    else if (phaseRef.current === 'idle' || phaseRef.current === 'failed') await start();
  }, [start, stop]);

  /** ✕: a recording stops and is kept as dismissed; a transcription is dismissed; a failure row goes away. */
  const cancel = useCallback(async () => {
    const current = run.current;
    const was = phaseRef.current;
    current.cancelled = true;
    setPhase('idle');
    setFailure(null);
    if (machine === null) return;
    if (was === 'recording') {
      const recording = await stopRecording(true);
      if (recording !== null) {
        const dismissed = await dismissLocal(recording);
        void saveAndTranscribe(machine, { kind: 'local', recording: dismissed }, () => true, () => undefined);
      }
    } else if (was === 'transcribing' && current.serverId !== null) {
      void dismissDictation(machine, current.serverId);
    }
  }, [machine]);

  const retry = useCallback(async () => {
    if (failure !== null) await transcribeKept(failure.kept);
  }, [failure, transcribeKept]);

  const transcribePrevious = useCallback(async () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'transcribing' || phaseRef.current === 'starting') return;
    await transcribeKept(null);
  }, [transcribeKept]);

  /** What Transcribe previous would take, asked fresh (for the long-press menu). */
  const previous = useCallback(async () => (machine === null ? null : latestUntranscribed(machine)), [machine]);

  return {
    available,
    phase,
    listening: phase === 'recording' || phase === 'starting',
    failure: failure?.message ?? null,
    elapsedMs: phase === 'recording' ? Math.max(0, now - startedAt) : 0,
    toggle,
    cancel,
    retry,
    transcribePrevious,
    previous,
  };
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
