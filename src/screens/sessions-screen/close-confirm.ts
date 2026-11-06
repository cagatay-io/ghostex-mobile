/**
 * What the Close dialog says about the session it closes: a coordinator names the open threads
 * that close with it, and a busy agent says what stops. The phone already asks before every
 * Close; this only names what closes.
 *
 * CDXC:Sessions 2026-11-02 DECISION: User: closing a coordinator, or any agent session that is
 * running (mid-turn or with a live agent), shows a confirmation first that names what will close
 * ("Close Main Coordinator and its 3 open threads?"). A copy of gx-core `close_confirmation` in the
 * main repo's packages/gx-core/src/sidebar_actions/close_confirm.rs, which this app cannot link;
 * change both together.
 */
import {
  displayStatus,
  hasQuestion,
  type GhostexSession,
  type GhostexSummaryCapabilities,
} from '../../contract/mobileSummary';
import { isRunningSession } from './sidebar-menus';
import { sessionTitle } from './session-actions';

/** A coordinator's threads that are open in the list: the ones closing it closes. */
const OPEN_THREAD_STATES = new Set(['waiting', 'working', 'finished', 'sleeping']);

export function openThreadCount(coordinator: GhostexSession, sessions: readonly GhostexSession[]): number {
  return sessions.filter(
    (session) =>
      session.sessionId !== coordinator.sessionId &&
      session.coordinatorSessionId === coordinator.sessionId &&
      session.coordinatorProjectId === coordinator.projectId &&
      OPEN_THREAD_STATES.has(session.coordinatorThreadState),
  ).length;
}

function threads(count: number): string {
  return count === 1 ? '1 open thread' : `${count} open threads`;
}

/**
 * The dialog's title and body for closing `session`, or null when it is idle and the ordinary
 * "Close session?" copy stands.
 */
export function closeConfirmCopy(
  session: GhostexSession,
  sessions: readonly GhostexSession[],
  capabilities: GhostexSummaryCapabilities,
): { title: string; body: string } | null {
  const name = sessionTitle(session);
  const keep = 'Its conversation stays in Previous Sessions, where you can restore it.';
  if (session.isCoordinator) {
    const open = openThreadCount(session, sessions);
    if (open === 0) return { title: `Close ${name}?`, body: `${name} is a coordinator. ${keep}` };
    return {
      title: `Close ${name} and its ${threads(open)}?`,
      body: `${name} and its ${threads(open)} close together. Restoring ${name} from Previous Sessions brings them back.`,
    };
  }
  if (!isRunningSession(session) || session.kind !== 'agent') return null;
  if (
    hasQuestion(session.pendingQuestionCount, capabilities.awaitingAnswer && session.awaitingAnswer) ||
    session.awaitingApproval
  ) {
    return { title: `Close ${name}?`, body: `${name} is waiting for your answer to a question or approval. ${keep}` };
  }
  if (displayStatus(session) === 'working') {
    return { title: `Close ${name}?`, body: `${name} is in the middle of a turn, which stops. ${keep}` };
  }
  if (session.backgroundWorkDetectedAt.length > 0) {
    return { title: `Close ${name}?`, body: `${name} still has background work running, which stops. ${keep}` };
  }
  return null;
}

/**
 * One sentence for a dialog that closes several sessions at once, naming the coordinators among
 * them and their open threads ('' when there is none).
 */
export function coordinatorsClosingLine(closing: readonly GhostexSession[], sessions: readonly GhostexSession[]): string {
  const coordinators = closing.filter((session) => session.isCoordinator);
  if (coordinators.length === 0) return '';
  const names = coordinators.map((coordinator) => {
    const open = openThreadCount(coordinator, sessions);
    return open > 0 ? `${sessionTitle(coordinator)} and its ${threads(open)}` : sessionTitle(coordinator);
  });
  return ` This closes ${names.join(', ')} too; restoring a coordinator brings its threads back.`;
}
