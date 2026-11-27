/**
 * Move to project on the phone: a chat in No project moves into one of the computer's projects from its long-press
 * menu (`ghostex move-session-to-project`, server/src/no_project/move_chat.rs), then opens where it went.
 *
 * CDXC:Projects 2026-11-27 DECISION:
 * User (Q5262 B, Q5263 A, Q5284 A): the phone lists, starts and moves chats without a project like the desktop. The
 * chat moves at once with no confirm: a Claude or Codex chat resumes in the project's folder under a new ref, any
 * other agent starts there from a handover of the chat (the user's messages and the agent's final replies). Its files
 * stay where they are. The phone's project sheet stands in for the desktop's project submenu, listing only that
 * computer's own projects, since the chat moves on its own computer.
 * SEE-ALSO: apps/desktop/src/app/native_sidebar/move_to_project.rs, packages/gx-core/src/sidebar_menu/menus.rs
 * (`no_project_moves`, the same targets).
 */

import { homeProjectIdIn, noProjectIdIn } from '../../contract/chief';
import { isAutopilotProject } from '../../contract/gbotsFilter';
import type { UnifiedProjectChoice } from '../../contract/unified/choices';
import { moveSessionToProjectCommand } from '../../commands/ghostexCli';
import { runGhostexCli } from '../../components/sessions/cli';
import { useInventoryStore } from '../../inventory/store';
import type { MachineConnectionTarget } from '../../machines/credentials';
import { projectChoicesNow } from './new-session-place';

/** The projects a chat in No project on `machineId` can move to: that computer's own, without No project or home. */
export function moveToProjectChoicesNow(machineId: string): UnifiedProjectChoice[] {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary ?? null;
  if (summary === null) return [];
  const left = new Set<string>(
    [noProjectIdIn(summary), homeProjectIdIn(summary)].filter((id): id is string => id !== null),
  );
  for (const project of summary.projects) {
    if (isAutopilotProject(project) || project.worktreeParentProjectId.length > 0) left.add(project.projectId);
  }
  return projectChoicesNow(machineId).flatMap((choice) => {
    const here = choice.machines.find((machine) => machine.machineId === machineId);
    if (here === undefined || left.has(here.projectId)) return [];
    return [{ ...choice, machines: [here], selected: 0 }];
  });
}

/** Moves the chat and answers where it is now (its project and session ids). Throws with gxserver's reason. */
export async function moveChatToProject(
  machine: MachineConnectionTarget,
  from: { projectId: string; sessionId: string },
  targetProjectId: string,
): Promise<{ projectId: string; sessionId: string }> {
  const answer = await runGhostexCli(
    machine,
    moveSessionToProjectCommand(from.sessionId, from.projectId, targetProjectId),
  );
  const session = answer.json?.session;
  const moved = typeof session === 'object' && session !== null ? (session as Record<string, unknown>) : {};
  const projectId = typeof moved.projectId === 'string' && moved.projectId.length > 0 ? moved.projectId : targetProjectId;
  const sessionId = typeof moved.sessionId === 'string' && moved.sessionId.length > 0 ? moved.sessionId : from.sessionId;
  return { projectId, sessionId };
}
