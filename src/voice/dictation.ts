/**
 * Dictate on the phone, in two independent steps: the microphone is recorded to a file on the phone
 * first (`GhostexVoiceRecorder.kt` / `.swift`), and only after Stop is that file handed to the computer's
 * gxserver, which keeps it and transcribes it with xAI using the key kept on the computer
 * (`/api/saveDictationRecording`, `/api/transcribeDictation`). The phone deletes its copy only once
 * its words are in the chat box (or nothing was heard, or the person dismissed it), so a dropped link,
 * a refused key, Hex being closed or leaving the chat never loses what was said: the recording stays
 * on the phone, goes again on its own when the computer is back, and the chat box offers it until then.
 *
 * CDXC:VoiceMode 2026-11-09 WHY: A user: "most of the time I record, and it fails and my audio does not get saved properly ... not saving my audio is killer". The phone forgot its copy as soon as the computer had the file, a failed send needed a tap on a row that vanished when the chat closed, and leaving the chat while recording marked the recording dismissed. Sending is idempotent by recording id (`save_piece` and `transcribe` in server/src/voice_agent/), so the phone re-sends and re-asks freely.
 *
 * CDXC:VoiceMode 2026-10-20 SEE-ALSO: the user's decision is in the computer's `server/src/voice_agent/recordings.rs` and `apps/desktop/src/app/voice_agent/dictation.rs`; the desktop records with `recorder.rs`.
 *
 * CDXC:Dictate 2026-11-26 WHY: A user: "Parakeet is super slow ... whenever I send a prompt it takes ages for it to process it and show it in the chat box". The computer's own recordings showed where the time went: after Stop, the phone's upload took 10.8 to 18.2 s (the link carried 50 to 67 KB a second that day) while Hex and Parakeet took 0.5 to 1.7 s. The recording is now sent on to the computer while it is being made (`sendWhileRecording`), in the same resendable pieces as before, so after Stop only the last moment of audio is still to go. Recording to the phone's file first is unchanged: a piece that fails only ends this early sending, and the upload after Stop sends what the computer is missing.
 */

import { GhostexNative, type LocalDictation } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import type { MachineConnectionTarget } from '../machines/credentials';
import { VOICE_SUPPORTED } from './conversation';
import { recordingPath } from './dictationLevel';
import { microphoneAllowed, microphoneDeniedMessage } from './microphone';

/** Raw bytes per upload piece: under gxserver's 1 MiB JSON limit once base64 grows it by a third. */
const PIECE_BYTES = 512 * 1024;
const UPLOAD_TIMEOUT_MS = 30_000;
/** xAI usually answers in a few seconds; a long recording takes longer. */
const TRANSCRIBE_TIMEOUT_MS = 180_000;
const SHORT_TIMEOUT_MS = 10_000;
/**
 * While it records, a piece of what the microphone wrote since starts at most this often (start to
 * start): a link only a little faster than the audio keeps up, and a fast one is not sent a
 * request for every few milliseconds of audio.
 */
const SEND_WHILE_RECORDING_MS = 750;

/** A recording the computer keeps, as gxserver describes it. */
export type ServerDictation = {
  id: string;
  createdAt: number;
  durationMs: number;
  status: 'recorded' | 'transcribing' | 'transcribed' | 'failed' | 'dismissed';
  text: string | null;
  error: { code: string; message: string; provider?: string | null } | null;
  /** What made the text ("Local, Parakeet v3"); absent on computers before the local engine. */
  engine?: { engine: string; label: string } | null;
};

/** Where a recording without text is: on the computer, or still only on the phone. */
export type Kept = { kind: 'server'; id: string } | { kind: 'local'; recording: LocalDictation };

/**
 * What a transcription came to. `id` is the recording's (the phone's id is the computer's too).
 * A failure with `code` null never got an answer from the computer (a dropped link): sending again later can fix it.
 */
export type Transcription =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'nothing'; id: string; message: string }
  | { kind: 'failed'; kept: Kept; message: string; code: string | null };

/** Recordings a transcription is working on now; the chat box doesn't offer them as waiting. */
const handling = new Set<string>();
/** Recordings whose words are in or that were dismissed, while the phone's copy is still being put away. */
const settled = new Set<string>();

/**
 * The recordings whose words a chat's core is asked to type right now: its `insertDictation` is
 * on its way through that chat's host (`chat/rust/host.ts`) and the answer has not been taken.
 * There is one request per recording, on the whole phone: the recording is not offered as waiting
 * meanwhile and no second request is made for it, so its words go into one draft. The request
 * ends when the words are in a draft (`forgetRecording`), when the reader dismissed the recording,
 * or when its chat can take no answer any more (`requestEnded`), and only then is the recording
 * offered again.
 *
 * CDXC:Dictate 2026-11-10 WHY: The words reach a draft through the chat's core, a moment after they are back, where the released phone wrote them into the chat box at once; a recording was offered again in that moment, and one whose words a form had already taken was transcribed and typed a second time into another chat. A wait that offered the recording after five seconds did the same whenever the first request was only slow. The chat's host knows when its request is over (answered, or its core gone), so the request itself holds the recording back; one that stays open too long is ended by the host together with its core (`watchDictations` in host.ts), never by offering the recording beside it.
 */
const asked = new Set<string>();

const waitingListeners = new Set<() => void>();

/** Hears when the recordings offered as waiting may have changed (a request ended without its words in a draft). */
export function onWaitingChanged(listener: () => void): () => void {
  waitingListeners.add(listener);
  return () => {
    waitingListeners.delete(listener);
  };
}

/** A chat's core is about to be asked for recording `id`'s words; false when a request for it is already on its way. */
export function wordsAsked(id: string): boolean {
  if (asked.has(id)) return false;
  asked.add(id);
  return true;
}

/** Whether an answer for recording `id` still counts: it is asked for, and not dismissed since. */
export function wordsAwaited(id: string): boolean {
  return asked.has(id);
}

/** The request for recording `id` ended without its words in a draft: the recording waits again. */
export function requestEnded(id: string): void {
  if (asked.delete(id)) waitingListeners.forEach((listener) => listener());
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

async function rpc(
  machine: MachineConnectionTarget,
  method: string,
  params: unknown,
  timeoutMs: number,
): Promise<{ result: Record<string, unknown> } | { error: string }> {
  const answer = await chatMachineLink(machine).rpc(method, params, timeoutMs);
  if (answer.error) return { error: answer.error.message || "Couldn't reach Ghostex on your computer." };
  return { result: (answer.result ?? {}) as Record<string, unknown> };
}

/** Raw bytes a piece of base64 `chunk` carries. */
function pieceBytes(chunk: string): number {
  return Math.floor((chunk.length * 3) / 4) - (chunk.endsWith('==') ? 2 : chunk.endsWith('=') ? 1 : 0);
}

/**
 * A recording sent on to `machineId` while the microphone writes it: `sent` is how much of it the
 * computer has said it holds, `running` the sending, which ends soon after `stopped`.
 */
type LiveSend = { machineId: string; sent: number; stopped: boolean; wake: () => void; running: Promise<void> };
/** The sendings by recording id, kept until the recording's upload has waited for its last piece. */
const sending = new Map<string, LiveSend>();

/** The microphone stopped or started anew: every sending ends after the piece on its way. */
function stopSending(): void {
  for (const send of sending.values()) {
    send.stopped = true;
    send.wake();
  }
}

/** How much of each recording sent while it was made the computer holds, until its upload is complete. */
const sentWhileRecording = new Map<string, { machineId: string; bytes: number }>();

/**
 * Sends recording `id` on to the computer while the microphone writes it: what was written since,
 * as an unfinished piece (`done: false`), one after another, at most one every
 * [SEND_WHILE_RECORDING_MS]. The computer keeps the pieces in its
 * upload file and repairs the WAV header when the last one comes (`save_piece` and
 * `repair_wav_header` in server/src/voice_agent/recordings.rs, since 10.29.0), so the header's
 * early sizes do not matter. A failed piece ends this sending and nothing else: the upload after
 * Stop goes on from what the computer said it holds, and the phone's file stays until its words
 * are in a draft.
 */
function sendWhileRecording(machine: MachineConnectionTarget, id: string): void {
  const path = recordingPath(id);
  if (path === null) return;
  const send: LiveSend = { machineId: machine.id, sent: 0, stopped: false, wake: () => undefined, running: Promise.resolve() };
  sending.set(id, send);
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      send.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  send.running = (async () => {
    let began = Date.now();
    for (;;) {
      const wait = began + SEND_WHILE_RECORDING_MS - Date.now();
      if (wait > 0) await pause(wait);
      if (send.stopped) return;
      began = Date.now();
      let chunk: string;
      try {
        chunk = await GhostexNative.dictationReadPiece(path, send.sent, PIECE_BYTES);
      } catch {
        return;
      }
      if (chunk.length === 0) continue;
      const answer = await rpc(machine, 'saveDictationRecording', { id, offset: send.sent, chunk, done: false }, UPLOAD_TIMEOUT_MS);
      if ('error' in answer || answer.result.dictation !== undefined) return;
      const received = answer.result.received;
      if (typeof received !== 'number') return;
      send.sent = received;
      sentWhileRecording.set(id, { machineId: machine.id, bytes: received });
    }
  })();
}

/**
 * Where an upload of recording `id` to `machine` starts: after what the computer took while it was
 * recorded (the sending is let finish first, so two never write at once), or 0.
 */
async function sentSoFar(machine: MachineConnectionTarget, id: string): Promise<number> {
  const send = sending.get(id);
  if (send !== undefined) {
    send.stopped = true;
    send.wake();
    await send.running;
    sending.delete(id);
  }
  const sent = sentWhileRecording.get(id);
  return sent !== undefined && sent.machineId === machine.id ? sent.bytes : 0;
}

/**
 * Starts recording. `onMicError` hears about a microphone that stops later. With `machine`, the
 * recording is sent on to that computer while it records. Answers the recording's id, or a
 * sentence for why the microphone did not start.
 */
export async function startRecording(
  onMicError: (message: string) => void,
  machine: MachineConnectionTarget | null = null,
): Promise<{ id: string } | { error: string }> {
  if (!(await microphoneAllowed())) return { error: microphoneDeniedMessage('dictate') };
  stopSending();
  let id: string;
  try {
    id = await GhostexNative.dictationRecordStart();
  } catch {
    return { error: "Couldn't start the microphone." };
  }
  const subscription = GhostexNative.addListener('onVoiceEvent', (event) => {
    if (event.mode !== 'dictation' || event.sessionId !== id || event.kind !== 'status') return;
    if (event.status === 'micError') {
      subscription.remove();
      onMicError(event.message ?? 'The microphone stopped.');
    }
  });
  stopListening = () => subscription.remove();
  if (machine !== null) sendWhileRecording(machine, id);
  return { id };
}

let stopListening: (() => void) | null = null;

/** Stops recording and closes the file (marked dismissed when the reader cancelled). */
export async function stopRecording(dismissed: boolean): Promise<LocalDictation | null> {
  stopListening?.();
  stopListening = null;
  // The piece on its way finishes; the upload after Stop waits for it (`sentSoFar`).
  stopSending();
  try {
    return await GhostexNative.dictationRecordStop(dismissed);
  } catch {
    return null;
  }
}

/**
 * Hands a phone recording to the computer in pieces and answers what the computer keeps. The first
 * ask carries no audio: a computer that already has the recording answers with it at once, so sending
 * again costs nothing. A recording sent while it was made goes on from what the computer holds
 * instead (that ask would empty the computer's unfinished copy). The phone's copy stays
 * (`forgetRecording` removes it).
 */
async function upload(
  machine: MachineConnectionTarget,
  recording: LocalDictation,
): Promise<{ dictation: ServerDictation } | { error: string }> {
  const finished = {
    createdAt: recording.createdAt,
    durationMs: recording.durationMs,
    client: 'phone',
    dismissed: recording.dismissed,
    language: deviceLanguage(),
  };
  let offset = await sentSoFar(machine, recording.id);
  if (offset === 0) {
    const probe = await rpc(machine, 'saveDictationRecording', { id: recording.id, offset: 0, chunk: '', done: false, ...finished }, UPLOAD_TIMEOUT_MS);
    if ('error' in probe) return probe;
    const known = probe.result.dictation as ServerDictation | undefined;
    if (known) return { dictation: known };
  }
  for (;;) {
    let chunk: string;
    try {
      chunk = await GhostexNative.dictationReadPiece(recording.path, offset, PIECE_BYTES);
    } catch {
      return { error: "The recording can't be read on this phone anymore" };
    }
    const end = offset + pieceBytes(chunk);
    const done = end >= recording.bytes;
    const answer = await rpc(machine, 'saveDictationRecording', { id: recording.id, offset, chunk, done, ...finished }, UPLOAD_TIMEOUT_MS);
    if ('error' in answer) return answer;
    const dictation = answer.result.dictation as ServerDictation | undefined;
    if (dictation) {
      sentWhileRecording.delete(recording.id);
      return { dictation };
    }
    const received = typeof answer.result.received === 'number' ? answer.result.received : end;
    if (done && received >= recording.bytes) return { error: "Ghostex on your computer didn't confirm the recording." };
    offset = Math.min(received, recording.bytes);
  }
}

/** The phone's own copy of recording `id`, if it still has one. */
export async function localRecording(id: string): Promise<LocalDictation | null> {
  try {
    return (await GhostexNative.dictationUnsent()).find((recording) => recording.id === id) ?? null;
  } catch {
    return null;
  }
}

/** The words are in a draft (or nothing was heard): the phone's copy of `id` goes; the computer keeps its own. */
export async function forgetRecording(id: string): Promise<void> {
  settled.add(id);
  asked.delete(id);
  const recording = await localRecording(id);
  if (recording !== null) await GhostexNative.dictationForget(recording.path).catch(() => undefined);
}

/**
 * Hands the computer every phone recording it may not have yet. A dismissed one is the computer's to
 * keep (Past recordings) and leaves the phone once it is there; one still waiting for its words
 * stays on the phone until they are in a chat box.
 */
export async function sendUnsent(machine: MachineConnectionTarget): Promise<void> {
  let pending: LocalDictation[] = [];
  try {
    pending = await GhostexNative.dictationUnsent();
  } catch {
    return;
  }
  for (const recording of pending) {
    if (handling.has(recording.id)) continue;
    const sent = await upload(machine, recording);
    if ('error' in sent || !recording.dismissed) continue;
    if (sent.dictation.status !== 'dismissed' && sent.dictation.status !== 'transcribed') {
      await rpc(machine, 'dismissDictation', { id: recording.id }, SHORT_TIMEOUT_MS);
    }
    await GhostexNative.dictationForget(recording.path).catch(() => undefined);
  }
}

/** Recordings on this phone still waiting for their words (not dismissed, not being worked on), newest first. */
export async function waitingRecordings(): Promise<LocalDictation[]> {
  try {
    const all = await GhostexNative.dictationUnsent();
    return all
      .filter(
        (recording) =>
          !recording.dismissed && !handling.has(recording.id) && !settled.has(recording.id) && !asked.has(recording.id),
      )
      .reverse();
  } catch {
    return [];
  }
}

function outcome(answer: { result: Record<string, unknown> } | { error: string }, kept: Kept, id: string): Transcription {
  if ('error' in answer) return { kind: 'failed', kept, message: answer.error, code: null };
  const dictation = answer.result.dictation as ServerDictation | undefined;
  if (dictation?.status === 'transcribed') {
    const text = (dictation.text ?? '').trim();
    return text.length > 0
      ? { kind: 'text', id: dictation.id || id, text }
      : {
          kind: 'nothing',
          id: dictation.id || id,
          message: 'No words were heard in the recording. It is kept on your computer in Settings > Dictation > Past recordings.',
        };
  }
  return {
    kind: 'failed',
    kept,
    message: dictation?.error?.message ?? 'The transcription failed.',
    code: dictation?.error?.code ?? null,
  };
}

/**
 * Hands a recording to the computer if only the phone has it, then transcribes it. `isCancelled`
 * is asked between the steps: a cancelled one is kept on the computer as dismissed instead.
 * `onServerId` learns the computer's id as soon as it has the recording, so a cancel can dismiss it.
 */
export async function saveAndTranscribe(
  machine: MachineConnectionTarget,
  kept: Kept,
  isCancelled: () => boolean,
  onServerId: (id: string) => void,
): Promise<Transcription | null> {
  const id = kept.kind === 'local' ? kept.recording.id : kept.id;
  handling.add(id);
  try {
    if (kept.kind === 'local') {
      const recording = isCancelled() ? { ...kept.recording, dismissed: true } : kept.recording;
      const saved = await upload(machine, recording);
      if ('error' in saved) {
        return {
          kind: 'failed',
          kept,
          message: `Couldn't send the recording to your computer (${saved.error.replace(/\.$/, '')}).`,
          code: null,
        };
      }
    }
    onServerId(id);
    if (isCancelled()) {
      const dismissed = await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
      // The computer keeps it as dismissed (Past recordings); the phone's copy is no longer needed.
      if (!('error' in dismissed) && kept.kind === 'local') await GhostexNative.dictationForget(kept.recording.path).catch(() => undefined);
      return null;
    }
    const answer = await rpc(machine, 'transcribeDictation', { id }, TRANSCRIBE_TIMEOUT_MS);
    if (isCancelled()) {
      await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
      return null;
    }
    return outcome(answer, kept, id);
  } finally {
    handling.delete(id);
  }
}

/** Transcribe previous: the newest recording without text, from any device. */
export async function transcribeLatest(
  machine: MachineConnectionTarget,
  isCancelled: () => boolean,
): Promise<Transcription | null> {
  await sendUnsent(machine);
  const answer = await rpc(machine, 'transcribeDictation', { latest: true }, TRANSCRIBE_TIMEOUT_MS);
  const id = 'result' in answer ? (answer.result.dictation as ServerDictation | undefined)?.id : undefined;
  if (isCancelled()) {
    if (id) await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
    return null;
  }
  if ('error' in answer) return { kind: 'nothing', id: id ?? '', message: answer.error };
  return outcome(answer, { kind: 'server', id: id ?? '' }, id ?? '');
}

/** The reader cancelled a transcription: the computer keeps the recording as dismissed. */
export async function dismissDictation(machine: MachineConnectionTarget, id: string): Promise<void> {
  await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
}

/** Marks a phone recording dismissed before it reaches the computer. */
export async function dismissLocal(recording: LocalDictation): Promise<LocalDictation> {
  settled.add(recording.id);
  asked.delete(recording.id);
  await GhostexNative.dictationDismissLocal(recording.path).catch(() => undefined);
  return { ...recording, dismissed: true };
}

/** What Transcribe previous would take: `{durationMs, createdAt}` of the newest recording without text. */
export async function latestUntranscribed(
  machine: MachineConnectionTarget,
): Promise<{ durationMs: number; createdAt: number } | null> {
  const answer = await rpc(machine, 'listDictations', { limit: 0 }, SHORT_TIMEOUT_MS);
  if ('error' in answer) return null;
  const latest = answer.result.latestUntranscribed as ServerDictation | null | undefined;
  return latest ? { durationMs: latest.durationMs, createdAt: latest.createdAt } : null;
}
