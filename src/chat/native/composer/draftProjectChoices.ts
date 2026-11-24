/**
 * The tray's project chip: the choices it offers and the move a pick makes.
 *
 * CDXC:Worktrees 2026-10-31 DECISION:
 * User (Q847, Q856): the phone's tray picks the project and machine like the desktop's. A session row can't change project, so a pick starts the same agent as a draft there, with the composer's text, opens it, then gxserver closes this draft (`/api/draftWorktree {finish, moved}`), which only closes a session still a draft. If the start fails the draft stays open with its text.
 *
 * CDXC:Worktrees 2026-11-03 DECISION:
 * User (Q1186 "split"): the tray has a project chip that lists projects only, and a machine chip beside it that changes the machine, the same model as the agent menu; both move the draft as above. This supersedes Q848's machine chips inside the project search.
 * SEE-ALSO: apps/desktop/src/app/gx_store/unified_new_session.rs.
 */

import type { UnifiedProjectChoice } from '../../../contract/unified/choices';
import { homeProjectIdIn } from '../../../contract/chief';
import { useInventoryStore } from '../../../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore } from '../../../machines/store';
import { noteNewSessionIn, projectChoicesNow } from '../../../screens/sessions-screen/new-session-place';
import { machineRecordFor } from '../../../screens/terminal-screen/session-lookups';
import { attachSessionKey } from '../../../terminal/sessions';
import { sessionChatRpc } from '../../rust/transport';
import type { MachineConnectionTarget } from '../../../machines/credentials';
import { createAgentWithFirstInputDraft, machineAgents, openSessionTab } from '../sessionShell';
import { markDraftTouched } from '../untouchedDrafts';

let carriedCoordinatorDraft = false;

export function setCarryCoordinatorDraft(flag: boolean): void {
  carriedCoordinatorDraft = flag;
}

export function takeCarryCoordinatorDraft(): boolean {
  const value = carriedCoordinatorDraft;
  carriedCoordinatorDraft = false;
  return value;
}

export function homeProjectIdForMachine(machineId: string): string | null {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary ?? null;
  return homeProjectIdIn(summary);
}

export function isHomeProject(machineId: string, projectId: string): boolean {
  const homeId = homeProjectIdForMachine(machineId);
  return homeId !== null && homeId === projectId;
}

export function mainHubMachineChoice(): UnifiedProjectChoice | null {
  const inventories = useInventoryStore.getState().inventoriesByMachineId;
  const machines = enabledMachines(useMachinesStore.getState())
    .map((machine) => {
      const inventory = inventories[machine.id];
      const homeId = homeProjectIdIn(inventory?.summary ?? null);
      if (homeId === null) return null;
      return {
        machineId: machine.id,
        label: machineDisplayLabel(machine),
        projectId: homeId,
        connected: (inventory?.lastError ?? null) === null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (machines.length === 0) return null;
  return {
    repoKey: 'main-hub',
    label: 'Main Hub',
    detail: null,
    machines,
    selected: 0,
    hasSessions: true,
    recent: false,
  };
}

export function draftProjectChoices(currentMachineId: string): UnifiedProjectChoice[] {
  return projectChoicesNow(currentMachineId);
}

export async function moveDraftToProject(input: {
  from: MachineConnectionTarget;
  fromProjectId: string;
  fromSessionId: string;
  agentId: string;
  text: string;
  to: MachineConnectionTarget;
  toProjectId: string;
  agentModel?: string | null;
  agentEffort?: string | null;
}): Promise<void> {
  const { from, to, agentId } = input;
  // Moving a draft is a deliberate change; do not treat leaving the old tab as an untouched discard.
  markDraftTouched(attachSessionKey(from.id, input.fromSessionId));
  if (from.id === to.id) {
    const moved = await sessionChatRpc(from, 'moveDraftSession', {
      projectId: input.fromProjectId,
      sessionId: input.fromSessionId,
      targetProjectId: input.toProjectId,
      text: input.text,
      ...(input.agentModel ? { agentModel: input.agentModel } : {}),
      ...(input.agentEffort ? { agentEffort: input.agentEffort } : {}),
    }).catch(() => ({ result: null, error: { message: 'unsupported' } }));
    if (moved.error === null) {
      const payload = (moved.result ?? {}) as { sessionId?: unknown; projectId?: unknown };
      const nextSessionId =
        typeof payload.sessionId === 'string' && payload.sessionId.trim().length > 0
          ? payload.sessionId.trim()
          : input.fromSessionId;
      const nextProjectId =
        typeof payload.projectId === 'string' && payload.projectId.trim().length > 0
          ? payload.projectId.trim()
          : input.toProjectId;
      noteNewSessionIn(to.id, nextProjectId);
      const record = machineRecordFor(to.id);
      if (record !== null) void useInventoryStore.getState().refreshMachine(record).catch(() => undefined);
      await openSessionTab(to, nextSessionId, nextProjectId);
      return;
    }
  }
  const agent = machineAgents(to.id).find((entry) => entry.agentId === agentId) ?? { agentId };
  const sessionId = await createAgentWithFirstInputDraft(to, {
    projectId: input.toProjectId,
    agent,
    draft: input.text,
  });
  // As every start notes it: the repository merged across computers, a lone computer as `local`, and
  // the project's Space, so a Unified filter narrowed by computer or Space widens to show the draft.
  noteNewSessionIn(to.id, input.toProjectId);
  await openSessionTab(to, sessionId, input.toProjectId);
  await sessionChatRpc(from, 'draftWorktree', {
    projectId: input.fromProjectId,
    sessionId: input.fromSessionId,
    finish: true,
    moved: true,
  });
}
