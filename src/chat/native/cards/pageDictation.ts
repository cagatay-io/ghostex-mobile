/**
 * Dictate in the page sheet's text boxes: the page's question kit (the computer's
 * server/src/visual_pages/kit.rs) draws a microphone on each note, text and "Anything else?" box when
 * the page has `window.__ghostexHostDictate`, which {@link PAGE_DICTATION_SCRIPT} gives it. A press
 * posts `{type: 'dictate', action}` ("toggle" or "cancel"); this hook records on the phone and has the
 * chat's computer transcribe (`src/voice/dictation.ts`, what the chat box's Dictate uses), and answers
 * with `gx-dictation` events: the phase, the words, or what went wrong. The kit types the words into
 * the box the recording started from.
 *
 * CDXC:Dictate 2026-11-16 SEE-ALSO: the user's decision is on the computer's
 * apps/desktop/src/app/page_dictation.rs (the desktop's page window and Files view do the same). A
 * page cannot prove a tap was the reader's, so a start is taken only while the sheet shows the page
 * with the app in front and no picture over it (`onScreen`), and the page leaving the screen cancels
 * the recording (kept on the computer as dismissed, as the chat box keeps a cancelled one).
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { WebView } from 'react-native-webview';

import type { MachineConnectionTarget } from '../../../machines/credentials';
import {
  dictationSupported,
  dismissDictation,
  forgetRecording,
  saveAndTranscribe,
  sendUnsent,
  startRecording,
  stopRecording,
} from '../../../voice/dictation';

/** Added before the page's own scripts, so the kit finds the microphone when it draws the boxes. */
export const PAGE_DICTATION_SCRIPT = `(() => {
  if (window.top !== window || window.__ghostexHostDictate) return;
  Object.defineProperty(window, '__ghostexHostDictate', {
    value: (action) => {
      if (action !== 'toggle' && action !== 'cancel') return;
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dictate', action })); } catch (_) {}
    },
  });
})();
true;`;

type Phase = 'idle' | 'starting' | 'recording' | 'transcribing';

/**
 * The page sheet's Dictate. `available`: whether the sheet gives the page its microphone (the chat's
 * computer transcribes dictation); `asked` takes the page's `dictate` messages.
 */
export function usePageDictation(
  machine: MachineConnectionTarget,
  webviewRef: RefObject<WebView<object> | null>,
  onScreen: boolean,
) {
  const available = dictationSupported(machine);
  const machineRef = useRef(machine);
  machineRef.current = machine;
  const phase = useRef<Phase>('idle');
  /** One per run: a cancel flips it and remembers the computer's id to dismiss. */
  const run = useRef<{ cancelled: boolean; serverId: string | null }>({ cancelled: false, serverId: null });
  const onScreenRef = useRef(onScreen);
  onScreenRef.current = onScreen;

  const tell = useCallback(
    (detail: Record<string, unknown>) => {
      const json = JSON.stringify(detail);
      webviewRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('gx-dictation',{detail:${json}}));true;`,
      );
    },
    [webviewRef],
  );

  const setPhase = useCallback(
    (next: Phase) => {
      phase.current = next;
      tell({ phase: next });
    },
    [tell],
  );

  const cancel = useCallback(() => {
    const current = run.current;
    if (phase.current === 'recording' || phase.current === 'starting') {
      current.cancelled = true;
      setPhase('idle');
      // Kept as dismissed: the computer takes it into Past recordings.
      void stopRecording(true).then(() => sendUnsent(machineRef.current));
    } else if (phase.current === 'transcribing') {
      current.cancelled = true;
      setPhase('idle');
      if (current.serverId !== null) void dismissDictation(machineRef.current, current.serverId);
    }
  }, [setPhase]);

  const start = useCallback(async () => {
    const current = { cancelled: false, serverId: null };
    run.current = current;
    setPhase('starting');
    const started = await startRecording((message) => {
      if (run.current !== current || phase.current !== 'recording') return;
      current.cancelled = true;
      setPhase('idle');
      void stopRecording(true).then(() => sendUnsent(machineRef.current));
      tell({ error: 'The microphone stopped', message });
    });
    if ('error' in started) {
      if (run.current === current) {
        setPhase('idle');
        tell({ error: "Couldn't start the microphone", message: started.error });
      }
      return;
    }
    if (current.cancelled || !onScreenRef.current) {
      void stopRecording(true).then(() => sendUnsent(machineRef.current));
      if (!current.cancelled) setPhase('idle');
      return;
    }
    setPhase('recording');
  }, [setPhase, tell]);

  const finish = useCallback(async () => {
    const current = run.current;
    setPhase('transcribing');
    const recording = await stopRecording(false);
    if (recording === null) {
      setPhase('idle');
      tell({ error: 'Transcription failed', message: "The recording couldn't be finished on this phone." });
      return;
    }
    const outcome = await saveAndTranscribe(
      machineRef.current,
      { kind: 'local', recording },
      () => current.cancelled,
      (id) => {
        current.serverId = id;
      },
    );
    if (current.cancelled || run.current !== current) return;
    if (outcome === null) {
      setPhase('idle');
      return;
    }
    if (outcome.kind === 'text') {
      tell({ text: outcome.text });
      void forgetRecording(outcome.id);
    } else if (outcome.kind === 'nothing') {
      void forgetRecording(outcome.id);
      tell({ error: 'No words heard', message: outcome.message });
    } else {
      // The phone keeps it; the chat box offers it again ("Recording not transcribed").
      tell({ error: 'Transcription failed', message: `${outcome.message} Your recording is kept.` });
    }
    setPhase('idle');
  }, [setPhase, tell]);

  /** A `dictate` message from the page. */
  const asked = useCallback(
    (action: 'toggle' | 'cancel') => {
      if (!available) return;
      if (action === 'cancel') {
        cancel();
        return;
      }
      if (phase.current === 'idle') {
        // Only for the page the reader is looking at (the SEE-ALSO above).
        if (onScreenRef.current) void start();
      } else if (phase.current === 'recording') {
        void finish();
      }
    },
    [available, cancel, finish, start],
  );

  // The page left the screen (closed, hidden, a picture over it, the app in the background).
  useEffect(() => {
    if (!onScreen) cancel();
  }, [onScreen, cancel]);

  // The sheet going away cancels as well.
  useEffect(() => () => cancel(), [cancel]);

  return { available, asked };
}
