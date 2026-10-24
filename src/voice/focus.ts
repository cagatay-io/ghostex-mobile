/**
 * The scope of a voice call: all sessions, or one session (a "focused" call). The rules here are
 * pure so they can be unit-tested (`focus.test.ts`); `conversation.ts` keeps the state and talks to
 * the native socket. The wire is the voice agent contract's "Focused calls" section
 * (docs/2026-10-20/voice-mode/voice-agent-client-contract.md).
 *
 * CDXC:VoiceMode 2026-10-23 DECISION: User, asked "Which way should we build it?", picked "The voice agent you have, limited to one session for the call", and asked "Which sessions can you start a call about?", picked "Any session: a thread, an orchestrator, or a plain session". A call about one session is the same call with a `focus`; the phone offers it on every session it lists.
 * CDXC:VoiceMode 2026-10-23 DECISION: User, asked "Can a call switch between one session and all sessions without hanging up?", picked "Yes, both ways". While a call is open, starting a call about a session on the same computer refocuses it (no second call), and All sessions widens it.
 * CDXC:VoiceMode 2026-10-23 SEE-ALSO: server/src/voice_agent/ (the focus query, `ready.focus`, the `focus` frames) and apps/desktop/src/app/voice_agent/ (the desktop's split headset button and focus strip).
 */

/** The session a focused call is about, as gxserver names it in `ready.focus` and `focus` frames. */
export type VoiceFocus = {
  projectId: string;
  sessionId: string;
  title: string;
  /** The project's name. */
  project: string;
  /** The orchestrator's title when the session is one of its threads, else null. */
  orchestrator: string | null;
  /** The session was closed during the call (the call keeps going). */
  closed: boolean;
};

/** A session the phone asks a call to be about (a menu row knows these before gxserver answers). */
export type VoiceFocusTarget = { projectId: string; sessionId: string; title: string };

/** `<projectId>:<sessionId>`, the `focus` query value and the `focus` frame's `session`. */
export function focusRef(target: { projectId: string; sessionId: string }): string {
  return `${target.projectId}:${target.sessionId}`;
}

/** A focus object from gxserver, or null for all sessions or anything malformed. */
export function parseFocus(value: unknown): VoiceFocus | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const text = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');
  const projectId = text('projectId');
  const sessionId = text('sessionId');
  if (projectId.length === 0 || sessionId.length === 0) return null;
  const orchestrator = text('orchestrator');
  return {
    projectId,
    sessionId,
    title: text('title') || sessionId,
    project: text('project'),
    orchestrator: orchestrator.length > 0 ? orchestrator : null,
    closed: record.closed === true,
  };
}

/**
 * What a `ready` frame says about the scope: `missing` when it has no `focus` key at all, which is
 * how an older gxserver (one without focused calls) answers.
 */
export type ReadyFocus = { kind: 'missing' } | { kind: 'focus'; focus: VoiceFocus | null };

export function readyFocus(frame: Record<string, unknown>): ReadyFocus {
  if (!Object.prototype.hasOwnProperty.call(frame, 'focus')) return { kind: 'missing' };
  return { kind: 'focus', focus: parseFocus(frame.focus) };
}

/**
 * A call that asked for a focus and got a `ready` without the `focus` key is talking to an older
 * gxserver: the phone hangs up and says to update Ghostex on that computer.
 */
export function readyFromOlderServer(askedForFocus: boolean, frame: Record<string, unknown>): boolean {
  return askedForFocus && readyFocus(frame).kind === 'missing';
}

/** The line for a computer whose Ghostex has no focused calls (the same words on every client). */
export function outdatedFocusMessage(computer: string): string {
  return `Update Ghostex on ${computer} to have a voice call about one session.`;
}

/** The two sessions are the same one. */
export function sameSession(
  a: { projectId: string; sessionId: string } | null,
  b: { projectId: string; sessionId: string } | null,
): boolean {
  return a !== null && b !== null && a.projectId === b.projectId && a.sessionId === b.sessionId;
}

/**
 * What "Voice call about this chat" / "Voice Call" does, given the call that is open:
 * - `start`: no call is open; start one about the session.
 * - `refocus`: a call is open on the same computer about something else; move it to this session.
 * - `already`: the open call is already about this session; just show it.
 * - `otherComputer`: a call is open on another computer; a call can't move computers.
 */
export type VoiceCallAboutAction = 'start' | 'refocus' | 'already' | 'otherComputer';

export function voiceCallAboutAction(
  open: { active: boolean; machineId: string | null; focus: VoiceFocus | null },
  target: { machineId: string; projectId: string; sessionId: string },
): VoiceCallAboutAction {
  if (!open.active) return 'start';
  if (open.machineId !== target.machineId) return 'otherComputer';
  return sameSession(open.focus, target) && open.focus?.closed !== true ? 'already' : 'refocus';
}

/**
 * The note the captions get when the scope changes mid-call, or null when nothing worth saying
 * changed (the same scope again, a rename, or a closed session, which gxserver's `sessionClosed`
 * announcement already says and the banner shows).
 */
export function focusChangeNotice(previous: VoiceFocus | null, next: VoiceFocus | null): string | null {
  if (next === null) return previous === null ? null : 'Now about all sessions.';
  if (next.closed || sameSession(previous, next)) return null;
  return `Now only about ${next.title}.`;
}

/** The banner's second part, "(<project>)", or empty when gxserver named no project. */
export function focusBannerDetail(focus: VoiceFocus): string {
  return focus.project.length > 0 ? `(${focus.project})` : '';
}
