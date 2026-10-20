/**
 * Dictate on the phone, in two independent steps: the microphone is recorded to a file on the phone
 * first (`GhostexVoiceRecorder.kt`), and only after Stop is that file handed to the computer's
 * gxserver, which keeps it and transcribes it with xAI using the key kept on the computer
 * (`/api/saveDictationRecording`, `/api/transcribeDictation`). The phone deletes its copy only once
 * the computer has all of it, so a dropped link, a refused key or an empty xAI account never loses
 * what was said: the recording stays and Transcribe again or Transcribe previous sends it again.
 *
 * CDXC:VoiceMode 2026-10-20 SEE-ALSO: the user's decision is in the computer's `server/src/voice_agent/recordings.rs` and `apps/desktop/src/app/voice_agent/dictation.rs`; the desktop records with `recorder.rs`.
 */

import { PermissionsAndroid } from 'react-native';

import { GhostexNative, type LocalDictation } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import type { MachineConnectionTarget } from '../machines/credentials';
import { VOICE_SUPPORTED } from './conversation';

/** Raw bytes per upload piece: under gxserver's 1 MiB JSON limit once base64 grows it by a third. */
const PIECE_BYTES = 512 * 1024;
const UPLOAD_TIMEOUT_MS = 30_000;
/** xAI usually answers in a few seconds; a long recording takes longer. */
const TRANSCRIBE_TIMEOUT_MS = 180_000;
const SHORT_TIMEOUT_MS = 10_000;

/** A recording the computer keeps, as gxserver describes it. */
export type ServerDictation = {
  id: string;
  createdAt: number;
  durationMs: number;
  status: 'recorded' | 'transcribing' | 'transcribed' | 'failed' | 'dismissed';
  text: string | null;
  error: { code: string; message: string } | null;
};

/** Where a recording without text is: on the computer, or still only on the phone. */
export type Kept = { kind: 'server'; id: string } | { kind: 'local'; recording: LocalDictation };

/** What a transcription came to. */
export type Transcription =
  | { kind: 'text'; text: string }
  | { kind: 'nothing'; message: string }
  | { kind: 'failed'; kept: Kept; message: string };

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

async function rpc(machine: MachineConnectionTarget, method: string, params: unknown, timeoutMs: number): Promise<{ result: Record<string, unknown> } | { error: string }> {
  const answer = await chatMachineLink(machine).rpc(method, params, timeoutMs);
  if (answer.error) return { error: answer.error.message || "Couldn't reach Ghostex on your computer." };
  return { result: (answer.result ?? {}) as Record<string, unknown> };
}

/**
 * Starts recording. `onMicError` hears about a microphone that stops later. Answers the recording's
 * id, or a sentence for why the microphone did not start.
 */
export async function startRecording(onMicError: (message: string) => void): Promise<{ id: string } | { error: string }> {
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const allowed =
    (await PermissionsAndroid.check(permission)) || (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
  if (!allowed) return { error: 'Ghostex needs microphone access to dictate. Allow it in Android Settings › Apps › Ghostex › Permissions.' };
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
  return { id };
}

let stopListening: (() => void) | null = null;

/** Stops recording and closes the file (marked dismissed when the reader cancelled). */
export async function stopRecording(dismissed: boolean): Promise<LocalDictation | null> {
  stopListening?.();
  stopListening = null;
  try {
    return await GhostexNative.dictationRecordStop(dismissed);
  } catch {
    return null;
  }
}

/** Hands a phone recording to the computer in pieces; the phone's copy goes once it has all of it. */
async function upload(machine: MachineConnectionTarget, recording: LocalDictation): Promise<{ id: string } | { error: string }> {
  let offset = 0;
  for (;;) {
    const chunk = await GhostexNative.dictationReadPiece(recording.path, offset, PIECE_BYTES);
    const end = offset + Math.floor((chunk.length * 3) / 4) - (chunk.endsWith('==') ? 2 : chunk.endsWith('=') ? 1 : 0);
    const done = end >= recording.bytes;
    const answer = await rpc(
      machine,
      'saveDictationRecording',
      {
        id: recording.id,
        offset,
        chunk,
        done,
        createdAt: recording.createdAt,
        durationMs: recording.durationMs,
        client: 'phone',
        dismissed: recording.dismissed,
        language: deviceLanguage(),
      },
      UPLOAD_TIMEOUT_MS
    );
    if ('error' in answer) return answer;
    const dictation = answer.result.dictation as ServerDictation | undefined;
    if (dictation) {
      await GhostexNative.dictationForget(recording.path).catch(() => undefined);
      return { id: dictation.id };
    }
    const received = typeof answer.result.received === 'number' ? answer.result.received : end;
    if (done && received >= recording.bytes) return { error: "Ghostex on your computer didn't confirm the recording." };
    offset = Math.min(received, recording.bytes);
  }
}

/** Sends every phone recording the computer never confirmed. */
export async function sendUnsent(machine: MachineConnectionTarget): Promise<void> {
  let pending: LocalDictation[] = [];
  try {
    pending = await GhostexNative.dictationUnsent();
  } catch {
    return;
  }
  for (const recording of pending) await upload(machine, recording);
}

function outcome(answer: { result: Record<string, unknown> } | { error: string }, kept: Kept): Transcription {
  if ('error' in answer) return { kind: 'failed', kept, message: answer.error };
  const dictation = answer.result.dictation as ServerDictation | undefined;
  if (dictation?.status === 'transcribed') {
    const text = (dictation.text ?? '').trim();
    return text.length > 0
      ? { kind: 'text', text }
      : { kind: 'nothing', message: 'No words were heard in the recording. It is kept on your computer in Settings › Voice agent › Dictation history.' };
  }
  return { kind: 'failed', kept, message: dictation?.error?.message ?? 'The transcription failed.' };
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
  onServerId: (id: string) => void
): Promise<Transcription | null> {
  let id: string;
  if (kept.kind === 'local') {
    const recording = isCancelled() ? { ...kept.recording, dismissed: true } : kept.recording;
    const saved = await upload(machine, recording);
    if ('error' in saved) {
      return {
        kind: 'failed',
        kept,
        message: `Ghostex on your computer couldn't take the recording (${saved.error.replace(/\.$/, '')}). It is kept on this phone; tap Transcribe again.`,
      };
    }
    id = saved.id;
  } else {
    id = kept.id;
  }
  onServerId(id);
  if (isCancelled()) {
    await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
    return null;
  }
  const answer = await rpc(machine, 'transcribeDictation', { id }, TRANSCRIBE_TIMEOUT_MS);
  if (isCancelled()) {
    await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
    return null;
  }
  return outcome(answer, { kind: 'server', id });
}

/** Transcribe previous: the newest recording without text, from any device. */
export async function transcribeLatest(machine: MachineConnectionTarget, isCancelled: () => boolean): Promise<Transcription | null> {
  await sendUnsent(machine);
  const answer = await rpc(machine, 'transcribeDictation', { latest: true }, TRANSCRIBE_TIMEOUT_MS);
  const id = 'result' in answer ? (answer.result.dictation as ServerDictation | undefined)?.id : undefined;
  if (isCancelled()) {
    if (id) await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
    return null;
  }
  if ('error' in answer) return { kind: 'nothing', message: answer.error };
  return outcome(answer, { kind: 'server', id: id ?? '' });
}

/** The reader cancelled a transcription: the computer keeps the recording as dismissed. */
export async function dismissDictation(machine: MachineConnectionTarget, id: string): Promise<void> {
  await rpc(machine, 'dismissDictation', { id }, SHORT_TIMEOUT_MS);
}

/** Marks a phone recording dismissed before it reaches the computer. */
export async function dismissLocal(recording: LocalDictation): Promise<LocalDictation> {
  await GhostexNative.dictationDismissLocal(recording.path).catch(() => undefined);
  return { ...recording, dismissed: true };
}

/** What Transcribe previous would take: `{durationMs, createdAt}` of the newest recording without text. */
export async function latestUntranscribed(machine: MachineConnectionTarget): Promise<{ durationMs: number; createdAt: number } | null> {
  const answer = await rpc(machine, 'listDictations', { limit: 0 }, SHORT_TIMEOUT_MS);
  if ('error' in answer) return null;
  const latest = answer.result.latestUntranscribed as ServerDictation | null | undefined;
  return latest ? { durationMs: latest.durationMs, createdAt: latest.createdAt } : null;
}
