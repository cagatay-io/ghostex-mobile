/**
 * Add to Session Context as the desktop does it: gxserver reads the file into "File context:
 * <path>" with its text in a code block (`addToSessionContext`, server/src/project_docs/actions.rs; UTF-8 text of
 * at most 300 000 bytes, limits.rs), and that text goes into the input of the agent session the browser was opened
 * from, never sent: after the chat box's draft while the session shows its chat, else pasted into its terminal with
 * no Enter (`insert_manage_file_context_into_agents_session`,
 * apps/desktop/src/app/terminal_sync/gpui_engine_terminal_attachment.rs). Right before inserting, the session is
 * checked again, as the desktop checks Running + agent there: still open on the phone, live on the computer and
 * running an agent; otherwise nothing is inserted. Kept free of native imports so `bun test`
 * drives it with stand-in inputs; `sessionInputs.ts` holds the app's.
 */

import { DocsCopy } from '../copy';
import { resolveAgentIconId, type GhostexSession } from '../contract/mobileSummary';
import type { TerminalTab } from '../terminal/sessions';
import { projectScopeAction, type DocsRpc } from './request';

/** The agent session the browser was opened from, as the Files route carries it. */
export type ContextSession = {
  /** The phone tab's key: the terminal the text is pasted into. */
  sessionKey: string;
  /** gxserver's session id: the chat whose draft takes the text. */
  sessionId: string;
  /** The session's title, which the notice names. */
  title: string;
  /** Whether the session can show its chat (the terminal screen's `chatCapable`). */
  chatCapable: boolean;
};

/**
 * The session as the phone and the computer know it now: its tab on the phone (undefined once closed there) and the
 * computer's record of it (undefined once the computer no longer lists it).
 */
export type ContextTargetNow = {
  tab: Pick<TerminalTab, 'kind' | 'ghostexSessionId' | 'state'> | undefined;
  record: Pick<GhostexSession, 'isLive' | 'agentIcon' | 'agentName' | 'agent'> | undefined;
};

/** A session's input as Add to Session Context fills it: the app's (`sessionInputs.ts`) or a test's. */
export type SessionInputs = {
  /** Whether the session shows its chat now rather than its terminal. */
  showsChat(session: ContextSession): boolean;
  /** Adds the text after the chat box's draft; false while the session's chat box is not open and ready. */
  appendToChatDraft(session: ContextSession, text: string): boolean;
  /** Pastes the text into the session's terminal input with no Enter after it; throws without a terminal. */
  pasteIntoTerminal(session: ContextSession, text: string): Promise<void>;
  /** The session as the phone and the computer know it at this moment. */
  current(session: ContextSession): ContextTargetNow;
};

export type ContextOutcome = { added: true; into: 'chat' | 'terminal' } | { added: false; message: string };

/**
 * The session Files offers Add to Session Context for, or null: an agent's session (the desktop's running
 * session with an agent), not a shell tab or a session that runs no agent. `agentId` is the terminal screen's
 * (`'terminal'` when the session runs no agent).
 */
export function contextSessionFor(
  tab: Pick<TerminalTab, 'kind' | 'sessionKey' | 'ghostexSessionId'>,
  agentId: string,
  title: string,
  chatCapable: boolean,
): ContextSession | null {
  if (tab.kind !== 'attach' || tab.ghostexSessionId === undefined || agentId === 'terminal') return null;
  return { sessionKey: tab.sessionKey, sessionId: tab.ghostexSessionId, title, chatCapable };
}

/**
 * Whether the session can take the text into the input it shows now (the desktop's Running + agent check at
 * insertion, gpui_engine_terminal_attachment.rs): its tab is still open on the phone as that session, the computer
 * still lists it live with an agent, and in terminal view its terminal is connected. Never another session.
 */
export function contextTargetReady(session: ContextSession, now: ContextTargetNow, into: 'chat' | 'terminal'): boolean {
  const { tab, record } = now;
  if (tab === undefined || tab.kind !== 'attach' || tab.ghostexSessionId !== session.sessionId) return false;
  if (record === undefined || !record.isLive) return false;
  const agent = resolveAgentIconId(record.agentIcon, record.agentName.length > 0 ? record.agentName : record.agent);
  if (agent === 'terminal') return false;
  return into === 'chat' || tab.state === 'open';
}

/**
 * Asks gxserver once for the file's context text (`path`: its path in the project) and puts it into the session's
 * input. A file gxserver refuses (too large, not UTF-8 text, gone) inserts nothing and answers gxserver's message.
 */
export async function addFileToSessionContext(
  rpc: DocsRpc,
  projectId: string,
  path: string,
  session: ContextSession,
  inputs: SessionInputs,
): Promise<ContextOutcome> {
  let prompt: unknown;
  try {
    prompt = (await projectScopeAction(rpc, projectId, 'addToSessionContext', { path })).contextPrompt;
  } catch (failure) {
    return { added: false, message: failure instanceof Error ? failure.message : String(failure) };
  }
  if (typeof prompt !== 'string' || prompt.length === 0) return { added: false, message: DocsCopy.contextNoText };
  // Checked now, after the read: the session may have ended or changed while gxserver read the file.
  const into = inputs.showsChat(session) ? 'chat' : 'terminal';
  if (!contextTargetReady(session, inputs.current(session), into)) {
    return { added: false, message: DocsCopy.contextNoSession };
  }
  if (into === 'chat') {
    return inputs.appendToChatDraft(session, prompt)
      ? { added: true, into: 'chat' }
      : { added: false, message: DocsCopy.contextNoSession };
  }
  try {
    await inputs.pasteIntoTerminal(session, prompt);
    return { added: true, into: 'terminal' };
  } catch {
    return { added: false, message: DocsCopy.contextNoSession };
  }
}
