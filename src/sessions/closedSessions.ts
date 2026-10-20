/**
 * Closed sessions for the Sessions search: fetching a computer's list and
 * bringing one back, both through the computer's own `ghostex` verbs
 * (server/src/ghostex_cli/previous_sessions.rs). Matching and order are in
 * ./sessionSearch.ts.
 */

import { runGhostexCli } from '../components/sessions/cli';
import { previousSessionsCommand, restorePreviousSessionCommand } from '../commands/ghostexCli';
import type { MachineRecord } from '../machines/store';
import { CLOSED_SESSIONS_VISIBLE_WINDOW_MS, parseClosedSessionsPage, type ClosedSession } from './sessionSearch';

/** The desktop's page size (`SESSIONS_PAGE_SIZE`). */
const PAGE_SIZE = 80;
/** With no query the desktop keeps paging until the two-week window is covered; the phone stops here. */
const MAX_WINDOW_PAGES = 5;
/** Above the CLI's own 30 s wait for gxserver to create the new session. */
const RESTORE_TIMEOUT_MS = 35_000;

/**
 * CDXC:Sessions 2026-10-01 WHY:
 * The desktop asks gxserver with the query and filters the page again with its own rules, and with no query it keeps paging until the oldest loaded session is outside the two-week window (`fill_visible_history_window`). The phone does the same, bounded so an enormous history cannot keep the SSH connection busy.
 */
export async function fetchClosedSessions(
  machine: MachineRecord,
  query: string,
  nowMs: number,
): Promise<ClosedSession[]> {
  const trimmed = query.trim();
  const sessions: ClosedSession[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_WINDOW_PAGES; page += 1) {
    const result = await runGhostexCli(machine, previousSessionsCommand({ query: trimmed, cursor, limit: PAGE_SIZE }));
    const parsed = parseClosedSessionsPage(result.json);
    sessions.push(...parsed.sessions);
    if (trimmed.length > 0 || parsed.cursor === null) break;
    const oldest = parsed.sessions[parsed.sessions.length - 1];
    const oldestMs = oldest === undefined ? 0 : Date.parse(oldest.closedAt);
    if (!Number.isFinite(oldestMs) || oldestMs < nowMs - CLOSED_SESSIONS_VISIBLE_WINDOW_MS) break;
    cursor = parsed.cursor;
  }
  return sessions;
}

/**
 * Bring a closed session back on its computer through gxserver's one restore
 * (`/api/restorePreviousSession`, the same the desktop uses): a new session
 * carrying the closed one's agent and conversation, which resumes when the
 * phone attaches to it.
 */
export async function restoreClosedSession(
  machine: MachineRecord,
  session: ClosedSession,
): Promise<{ projectId: string; sessionId: string }> {
  const result = await runGhostexCli(machine, restorePreviousSessionCommand(session.projectId, session.sessionId), {
    timeoutMs: RESTORE_TIMEOUT_MS,
  });
  const sessionId = typeof result.json?.sessionId === 'string' ? result.json.sessionId.trim() : '';
  if (sessionId.length === 0) throw new Error('The computer did not say which session it restored.');
  const projectId =
    typeof result.json?.projectId === 'string' && result.json.projectId.trim().length > 0
      ? result.json.projectId.trim()
      : session.projectId;
  return { projectId, sessionId };
}
