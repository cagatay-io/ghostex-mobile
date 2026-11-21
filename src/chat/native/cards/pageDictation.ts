/**
 * Dictate in the page sheet's text boxes: the page's question kit (the computer's
 * server/src/visual_pages/kit.rs) draws a microphone on each note, text and "Anything else?" box when
 * the page has `window.__ghostexHostDictate`, which {@link PAGE_DICTATION_SCRIPT} gives it. A press
 * posts `{type: 'dictate', action}` ("toggle", "cancel" or "restore"); this hook records on the phone
 * and has the chat's computer transcribe (`src/voice/dictation.ts`, what the chat box's Dictate uses),
 * and answers with `gx-dictation` events: the phase (with `restorable` right after a cancel that kept a
 * recording), the words, or what went wrong. The kit types the words into the box the recording
 * started from.
 *
 * CDXC:Dictate 2026-11-21 SEE-ALSO: the user's decision on Restore after a cancel ("i dont want it to be
 * lost") and on a Stop pressed while the microphone opens is on the computer's
 * apps/desktop/src/app/voice_agent/dictation.rs (`DictatePhase::Cancelled`): the page's box says
 * "Dictation cancelled" with Restore for 12 seconds, and Restore transcribes that same recording into
 * the same box.
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
  localRecording,
  type Kept,
  type Transcription,
} from '../../../voice/dictation';
import type { PageDictateAction } from './pageSheetScript';

/** Added before the page's own scripts, so the kit finds the microphone when it draws the boxes. */
export const PAGE_DICTATION_SCRIPT = `(() => {
  if (window.top !== window || window.__ghostexHostDictate) return;
  Object.defineProperty(window, '__ghostexHostDictate', {
    value: (action) => {
      if (action !== 'toggle' && action !== 'cancel' && action !== 'restore') return;
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dictate', action })); } catch (_) {}
    },
  });
})();
true;`;

type Phase = 'idle' | 'starting' | 'recording' | 'transcribing';

/** How long a box offers Restore after a cancel. */
const RESTORE_SHOWN_MS = 12_000;

/** One recording's run. A cancel flips `cancelled` and remembers the computer's id to dismiss. */
type Run = {
  cancelled: boolean;
  serverId: string | null;
  /** The phone's id for the recording (the computer's too), once it is finished. */
  recordingId: string | null;
  /** Stop was pressed while the microphone was still opening: stop as soon as it records. */
  stopWhenStarted: boolean;
  /** Ends when the recording has gone where it is kept (the computer, or still the phone). */
  handedOver: Promise<void> | null;
};

const newRun = (): Run => ({ cancelled: false, serverId: null, recordingId: null, stopWhenStarted: false, handedOver: null });

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
  const run = useRef<Run>(newRun());
  /** The run a cancel kept, while its box offers Restore. */
  const restorable = useRef<{ run: Run; timer: ReturnType<typeof setTimeout> } | null>(null);
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

  /** `kept`: a cancel kept a recording, and the box offers Restore. Older kits ignore it. */
  const setPhase = useCallback(
    (next: Phase, kept = false) => {
      phase.current = next;
      tell({ phase: next, restorable: kept });
    },
    [tell],
  );

  /** The box stops offering Restore (`quiet`: the phase that follows tells the page itself). */
  const dropRestorable = useCallback(
    (quiet: boolean) => {
      const offered = restorable.current;
      if (offered === null) return;
      clearTimeout(offered.timer);
      restorable.current = null;
      if (!quiet && phase.current === 'idle') setPhase('idle');
    },
    [setPhase],
  );

  /** Offers Restore of `cancelled` for a while. */
  const offerRestore = useCallback(
    (cancelled: Run) => {
      dropRestorable(true);
      const timer = setTimeout(() => {
        if (restorable.current?.run === cancelled) dropRestorable(false);
      }, RESTORE_SHOWN_MS);
      restorable.current = { run: cancelled, timer };
      setPhase('idle', true);
    },
    [dropRestorable, setPhase],
  );

  const cancel = useCallback(() => {
    const current = run.current;
    if (phase.current === 'recording') {
      current.cancelled = true;
      // Kept as dismissed: the computer takes it into Past recordings, and Restore brings it back.
      current.handedOver = stopRecording(true).then(async (recording) => {
        if (recording !== null) current.recordingId = recording.id;
        await sendUnsent(machineRef.current);
      });
      offerRestore(current);
    } else if (phase.current === 'starting') {
      // Nothing was said yet: kept as dismissed like any recording, with no Restore to offer.
      current.cancelled = true;
      setPhase('idle');
      void stopRecording(true).then(() => sendUnsent(machineRef.current));
    } else if (phase.current === 'transcribing') {
      current.cancelled = true;
      if (current.serverId !== null) void dismissDictation(machineRef.current, current.serverId);
      offerRestore(current);
    } else {
      dropRestorable(false);
    }
  }, [dropRestorable, offerRestore, setPhase]);

  /** What a transcription came to, told to the page (the words, or why there are none). */
  const deliver = useCallback(
    (current: Run, outcome: Transcription | null) => {
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
    },
    [setPhase, tell],
  );

  const start = useCallback(async () => {
    dropRestorable(true);
    const current = newRun();
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
    // Stop was pressed while the microphone opened (the box already showed Stop).
    if (current.stopWhenStarted) void finishRef.current();
  }, [dropRestorable, setPhase, tell]);

  const finish = useCallback(async () => {
    const current = run.current;
    setPhase('transcribing');
    let handedOver = () => {};
    current.handedOver = new Promise<void>((resolve) => {
      handedOver = resolve;
    });
    try {
      const recording = await stopRecording(false);
      if (recording === null) {
        setPhase('idle');
        tell({ error: 'Transcription failed', message: "The recording couldn't be finished on this phone." });
        return;
      }
      current.recordingId = recording.id;
      const outcome = await saveAndTranscribe(
        machineRef.current,
        { kind: 'local', recording },
        () => current.cancelled,
        (id) => {
          current.serverId = id;
        },
      );
      deliver(current, outcome);
    } finally {
      handedOver();
    }
  }, [deliver, setPhase, tell]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Restore after a cancel: that recording, transcribed into the box it was started from. */
  const restore = useCallback(async () => {
    const offered = restorable.current;
    if (offered === null || phase.current !== 'idle') return;
    dropRestorable(true);
    const cancelled = offered.run;
    const current = newRun();
    run.current = current;
    setPhase('transcribing');
    await cancelled.handedOver;
    const id = cancelled.serverId ?? cancelled.recordingId;
    if (id === null) {
      if (run.current === current && !current.cancelled) {
        setPhase('idle');
        tell({
          error: "Couldn't restore the dictation",
          message: 'Find it on your computer in Settings > Dictation > Past recordings.',
        });
      }
      return;
    }
    // Still on the phone when the computer couldn't take it at the cancel; otherwise the computer has it.
    const local = await localRecording(id);
    const kept: Kept = local !== null ? { kind: 'local', recording: local } : { kind: 'server', id };
    current.recordingId = id;
    let handedOver = () => {};
    current.handedOver = new Promise<void>((resolve) => {
      handedOver = resolve;
    });
    try {
      const outcome = await saveAndTranscribe(
        machineRef.current,
        kept,
        () => current.cancelled,
        (serverId) => {
          current.serverId = serverId;
        },
      );
      deliver(current, outcome);
    } finally {
      handedOver();
    }
  }, [deliver, dropRestorable, setPhase, tell]);

  /** A `dictate` message from the page. */
  const asked = useCallback(
    (action: PageDictateAction) => {
      if (!available) return;
      if (action === 'cancel') {
        cancel();
        return;
      }
      // Only for the page the reader is looking at (the SEE-ALSO above).
      if (action === 'restore') {
        if (onScreenRef.current) void restore();
        return;
      }
      if (phase.current === 'idle') {
        if (onScreenRef.current) void start();
      } else if (phase.current === 'starting') {
        run.current.stopWhenStarted = true;
      } else if (phase.current === 'recording') {
        void finish();
      }
    },
    [available, cancel, finish, restore, start],
  );

  // The page left the screen (closed, hidden, a picture over it, the app in the background).
  useEffect(() => {
    if (!onScreen) cancel();
  }, [onScreen, cancel]);

  // The sheet going away cancels as well, and Restore is no longer offered.
  useEffect(
    () => () => {
      cancel();
      const offered = restorable.current;
      if (offered !== null) clearTimeout(offered.timer);
      restorable.current = null;
    },
    [cancel],
  );

  return { available, asked };
}
