/**
 * Session-attention acknowledgement (desktop parity): tapping a session row in
 * the sessions drawer or a terminal tab clears that session's attention
 * status, exactly like clicking a session in the desktop gpui sidebar. Runs
 * `ghostex acknowledge-session-attention` and optimistically clears the local
 * inventory dot; the poll loop restores server truth if the CLI call fails.
 */

import { acknowledgeAttentionCommand, acknowledgeCoordinatorThreadsCommand } from '../commands/ghostexCli';
import { runGhostexCli } from '../components/sessions/cli';
import { displayStatus, type GhostexSession } from '../contract/mobileSummary';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';

/**
 * Fire-and-forget: no-op unless the session's current display status is
 * `attention` (matching the desktop's acknowledge guard, which never clears
 * working/done/error states on click).
 */
export function acknowledgeSessionAttention(machineId: string, sessionId: string): void {
  const sessions = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary?.sessions ?? [];
  const session = sessions.find((entry) => entry.sessionId === sessionId);
  if (session === undefined) return;
  const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
  if (machine === undefined) return;
  if (hasFinishedThread(sessions, session)) {
    void runGhostexCli(machine, acknowledgeCoordinatorThreadsCommand(session.globalRef))
      .then(() => useInventoryStore.getState().refreshMachine(machine))
      .catch(() => {
        // Best effort, like the desktop's: the threads keep their dot until the next view.
      });
  }
  if (displayStatus(session) !== 'attention') return;
  useInventoryStore.getState().acknowledgeAttentionLocally(machineId, sessionId);
  void runGhostexCli(machine, acknowledgeAttentionCommand(sessionId))
    .then(() => useInventoryStore.getState().refreshMachine(machine))
    .catch(() => {
      // Failed acknowledge: the cleared fingerprint makes the next poll
      // restore the server-side attention state.
    });
}

/**
 * Whether the session is an orchestrator with a thread under it (at any depth) that may hold a
 * finished turn the user has not seen: in attention, no question card, and not gxserver's `waiting` (a permission
 * prompt or a bell). gxserver decides
 * which really finished, since only it knows why a session is in attention.
 * CDXC:Coordinators 2026-10-24 SEE-ALSO: the user's decision on `acknowledge_coordinator_threads` in server/src/coordinators/seen_threads.rs ("when i see the main thread itself then that should clear the blue dot on all the sub threads below it"); the desktop's twin is gx-core `attention::has_finished_thread`.
 */
function hasFinishedThread(sessions: readonly GhostexSession[], coordinator: GhostexSession): boolean {
  if (!coordinator.isCoordinator || coordinator.globalRef.length === 0) return false;
  const key = (projectId: string, sessionId: string) => JSON.stringify([projectId, sessionId]);
  const visited = new Set([key(coordinator.projectId, coordinator.sessionId)]);
  const pending = [coordinator];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    for (const thread of sessions) {
      if (thread.coordinatorProjectId !== parent.projectId || thread.coordinatorSessionId !== parent.sessionId)
        continue;
      const threadKey = key(thread.projectId, thread.sessionId);
      if (visited.has(threadKey)) continue;
      visited.add(threadKey);
      if (
        thread.activity === 'attention' &&
        thread.pendingQuestionCount === 0 &&
        thread.coordinatorThreadState !== 'waiting'
      )
        return true;
      pending.push(thread);
    }
  }
  return false;
}
