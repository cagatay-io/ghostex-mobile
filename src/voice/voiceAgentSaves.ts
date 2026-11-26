/**
 * Settings › Voice's reads and saves of the voice agent settings, per computer id: the one read or save in flight
 * (with its deadline), the writes not settled yet, the notice after a save whose outcome is unclear, and the last
 * settings the phone really read from the computer. It lives here rather than in the page
 * (screens/settings/VoicePage.tsx), so closing and reopening Settings › Voice or switching computers never drops it;
 * an app restart loses it. The page starts reads and saves here and draws what this holds.
 *
 * CDXC:VoiceMode 2026-11-26 DECISION: User: each computer's voice agent save state is kept in one place outside Settings › Voice: the read or save in flight and its deadline, the save the computer may still write, the notice after an unclear save, and the settings last read from the computer. An unclear save is recorded for its computer even when the page was closed or shows another computer meanwhile; reopening the page shows the notice, and a page reopened while a save or read is in flight stays locked, picker included, until that operation is answered or its deadline passes.
 * WHY: the page dropped what happened while it was closed, so leaving Settings › Voice before a save's outcome lost the notice, and a reopened page let the user switch computers while the save was still in flight.
 */

import type { VoiceAgentLanguage, VoiceCallMode } from './conversation';

/** What a read of the computer's voice agent settings returned (`readComputerCallMode` in conversation.ts). */
export type VoiceAgentRead = {
  mode: VoiceCallMode;
  /** `null`: an older gxserver without "Answer when I say …". */
  waitForReply: boolean | null;
  /** `null`: a computer too old to have a language setting and turn words per language. */
  agentLanguage: VoiceAgentLanguage | null;
};

/**
 * The longest one read or save waits for its answer. The request's own time limit (`READ_TIMEOUT_MS`, 15 s, in
 * conversation.ts) covers only its HTTP exchange; reaching the computer before it (the connection, the forward, a
 * repair) has none, so this bounds the whole operation and with it the lock on the page and the computer picker.
 */
export const VOICE_AGENT_ANSWER_DEADLINE_MS = 20_000;

/**
 * The answers to a save that are not the computer's refusal, so the change may have been written or may still be
 * written: the phone's own sentences for a request that ran out of `READ_TIMEOUT_MS`, was lost, or got an answer it
 * could not read (`timeoutMessage`, `unreachableMessage` and `attemptOnce` in chat/rust/machine-link.ts; the catch in
 * conversation.ts's save helpers), and gxserver's for a desktop app that had the change and did not confirm it in
 * time or went away (`RendererCommandError::timeout` and `::disconnected`, server/src/events.rs). Every other answer is
 * gxserver's own refusal. The save helpers answer only a sentence, so these are matched by their text; a sentence
 * changed there makes that answer a refusal here again.
 */
const UNCLEAR_SAVE_ANSWERS: readonly RegExp[] = [
  /^Ghostex on .+ didn't answer in time\.$/,
  /^Couldn't reach Ghostex on .+; try again in a moment\.$/,
  /^Ghostex on .+ sent an answer the phone couldn't read\.$/,
  /^Ghostex on the computer didn't answer properly\./,
  /^Couldn't reach your computer\.$/,
  /^Timed out waiting \d+ms for renderer command /,
  /^The renderer disconnected before it answered renderer command /,
];

/** A read's outcome: the settings read, or why not (`null`: no answer within `VOICE_AGENT_ANSWER_DEADLINE_MS`). */
export type VoiceAgentReadOutcome = { read: VoiceAgentRead } | { error: string | null };

/**
 * A save's outcome: saved, refused by the computer (its reason), or unclear (`answer`: the answer that leaves it
 * unclear, `null` when none came within `VOICE_AGENT_ANSWER_DEADLINE_MS`).
 */
export type VoiceAgentSaveOutcome =
  | { kind: 'saved' }
  | { kind: 'refused'; error: string }
  | { kind: 'unclear'; answer: string | null };

/** The one read or save in flight on a computer; `outcome` settles with its answer or at its deadline. */
export type VoiceAgentOperation =
  | { kind: 'read'; outcome: Promise<VoiceAgentReadOutcome> }
  | { kind: 'save'; outcome: Promise<VoiceAgentSaveOutcome> };

/**
 * A save of the language or of turn words whose outcome is unclear. gxserver writes a language's turn words as the
 * whole list of every language, so such a save may have landed on another language's list, and the phone cannot know
 * where; the notice shows the lists to check. It stays until the user closes it.
 */
export type UnclearChange = {
  /** The language whose turn words the save sent, or for a language save the language calls speak with it. */
  target: string;
  /** The language settings last read from the computer before the save (`Last read`), never values the phone sent. */
  lastRead: VoiceAgentLanguage;
  /**
   * The settings read since the save (`Saved now`); null until the computer has been read again. The page presents
   * them as current only while its controls show this very read.
   */
  savedNow: VoiceAgentRead | null;
};

type ComputerSaves = {
  operation?: VoiceAgentOperation;
  /** The last save until the phone's request for it has ended (answered or failed), whatever the page did meanwhile. */
  unsettled?: Promise<void>;
  unclear?: UnclearChange;
  /** What the last read within its deadline returned. */
  read?: VoiceAgentRead;
};

const computers = new Map<string, ComputerSaves>();

function savesOf(id: string): ComputerSaves {
  let saves = computers.get(id);
  if (saves === undefined) {
    saves = {};
    computers.set(id, saves);
  }
  return saves;
}

/** `answer`, or `undefined` when it has not come within `VOICE_AGENT_ANSWER_DEADLINE_MS` or failed without one. */
function withinDeadline<T>(answer: Promise<T>): Promise<T | undefined> {
  const { promise, resolve } = Promise.withResolvers<T | undefined>();
  const timer = setTimeout(() => resolve(undefined), VOICE_AGENT_ANSWER_DEADLINE_MS);
  void answer.then(
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    () => {
      clearTimeout(timer);
      resolve(undefined);
    },
  );
  return promise;
}

/** Only one operation per computer, and none while a save may still be written: the page never starts another. */
function assertFree(id: string, saves: ComputerSaves): void {
  if (saves.operation !== undefined || saves.unsettled !== undefined) {
    throw new Error(`voiceAgentSaves: computer ${id} already has a read or save in flight`);
  }
}

/** The read or save in flight on computer `id`, until it is answered or its deadline passes. */
export function voiceAgentOperation(id: string): VoiceAgentOperation | undefined {
  return computers.get(id)?.operation;
}

/** Settles once computer `id`'s last save has really ended; `undefined` when none is pending. */
export function voiceAgentUnsettledWrite(id: string): Promise<void> | undefined {
  return computers.get(id)?.unsettled;
}

/** Computer `id`'s unclear change, until the user closes its notice. */
export function voiceAgentUnclearChange(id: string): UnclearChange | undefined {
  return computers.get(id)?.unclear;
}

/** Closes computer `id`'s notice. */
export function closeVoiceAgentNotice(id: string): void {
  const saves = computers.get(id);
  if (saves !== undefined) saves.unclear = undefined;
}

/**
 * Reads computer `id`'s settings through `read`. An answer within the deadline becomes the computer's last read and
 * its unclear change's `Saved now`. Call it only while the computer has nothing in flight and no unsettled save.
 */
export function startVoiceAgentRead(
  id: string,
  read: () => Promise<VoiceAgentRead | { error: string }>,
): Promise<VoiceAgentReadOutcome> {
  const saves = savesOf(id);
  assertFree(id, saves);
  const outcome = withinDeadline(read()).then((answer): VoiceAgentReadOutcome => {
    saves.operation = undefined;
    if (answer === undefined) return { error: null };
    if ('error' in answer) return { error: answer.error };
    saves.read = answer;
    if (saves.unclear !== undefined) saves.unclear = { ...saves.unclear, savedNow: answer };
    return { read: answer };
  });
  saves.operation = { kind: 'read', outcome };
  return outcome;
}

/**
 * Saves on computer `id` through `write`, which answers null when saved and a sentence otherwise. `turnWordsLanguage`
 * is set for a save of the language or of turn words: the language whose turn words it concerns. Its outcome is
 * recorded here whether or not a page still waits for it: an unclear outcome of such a save opens the notice, with
 * the last read as `Last read`. Call it only while the computer has nothing in flight and no unsettled save.
 */
export function startVoiceAgentSave(
  id: string,
  write: () => Promise<string | null>,
  turnWordsLanguage?: string,
): Promise<VoiceAgentSaveOutcome> {
  const saves = savesOf(id);
  assertFree(id, saves);
  const lastRead = saves.read?.agentLanguage ?? null;
  const written = write();
  const ended = () => {
    if (saves.unsettled === unsettled) saves.unsettled = undefined;
  };
  const unsettled: Promise<void> = written.then(ended, ended);
  saves.unsettled = unsettled;
  const outcome = withinDeadline(written).then((answer): VoiceAgentSaveOutcome => {
    saves.operation = undefined;
    if (answer === null) return { kind: 'saved' };
    if (answer !== undefined && !UNCLEAR_SAVE_ANSWERS.some((pattern) => pattern.test(answer))) {
      return { kind: 'refused', error: answer };
    }
    if (turnWordsLanguage !== undefined && lastRead !== null) {
      saves.unclear = { target: turnWordsLanguage, lastRead, savedNow: null };
    }
    return { kind: 'unclear', answer: answer ?? null };
  });
  saves.operation = { kind: 'save', outcome };
  return outcome;
}
