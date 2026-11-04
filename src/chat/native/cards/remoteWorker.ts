/**
 * A coordinator's worker on another computer than the coordinator's, in the Workers sheet: the
 * computer's name the row shows, and the notice a tap gives instead of opening it.
 *
 * CDXC:RemoteMachines 2026-11-04 DECISION:
 * User (A on the phone question): a worker a coordinator started on another computer (`ghostex
 * coordinator start-thread --computer`) is listed in the Workers sheet with that computer's name,
 * and a tap says it runs on that computer and to open it in Ghostex there. The phone talks only to
 * the coordinator's computer, so it cannot open the other one's session. The row's `serverId` and
 * `computer` come from gxserver (server/src/coordinators/panel.rs) through the core
 * (packages/gx-chat-core/src/extras/coordinator_threads.rs); the desktop opens such a row on that
 * computer (apps/desktop/src/app/native_chat/coordinator_threads.rs).
 */
import { str } from './json';

/** The computer a worker on another computer runs on, or `null` for one on the coordinator's own. */
export function remoteWorkerComputer(row: unknown): string | null {
  if (str(row, 'serverId').trim().length === 0) return null;
  const computer = str(row, 'computer').trim();
  return computer.length > 0 ? computer : 'another computer';
}

/** The toast a tap on a worker on another computer shows. */
export function remoteWorkerNotice(computer: string): { title: string; message: string } {
  return {
    title: `Runs on ${computer}`,
    message: `This worker runs on ${computer}. Open it in Ghostex on that computer.`,
  };
}

/**
 * The computer a host action to open a worker names, from the Workers sheet's rows: `null` when it
 * names none (a worker on the coordinator's computer), the row's computer when its server id
 * matches, else "another computer".
 */
export function remoteWorkerOfAction(params: unknown, rows: unknown): string | null {
  const serverId = str(params, 'serverId').trim();
  if (serverId.length === 0) return null;
  const projectId = str(params, 'projectId');
  const sessionId = str(params, 'sessionId');
  const row = (Array.isArray(rows) ? rows : []).find(
    (candidate) =>
      str(candidate, 'serverId') === serverId &&
      str(candidate, 'projectId') === projectId &&
      str(candidate, 'sessionId') === sessionId,
  );
  return (row !== undefined ? remoteWorkerComputer(row) : null) ?? 'another computer';
}
