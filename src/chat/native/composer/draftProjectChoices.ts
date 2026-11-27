/**
 * The tray's project chip: the choices it offers and the move a pick makes.
 *
 * CDXC:Worktrees 2026-10-31 DECISION:
 * User (Q847, Q856): the phone's tray picks the project and machine like the desktop's. A session row can't change project, so a pick starts the same agent as a draft there, with the composer's text, opens it, then gxserver closes this draft (`/api/draftWorktree {finish, moved}`), which only closes a session still a draft. If the start fails the draft stays open with its text.
 *
 * CDXC:Worktrees 2026-11-03 DECISION:
 * User (Q1186 "split"): the tray has a project chip that lists projects only, and a machine chip beside it that changes the machine, the same model as the agent menu; both move the draft as above. This supersedes Q848's machine chips inside the project search.
 *
 * CDXC:NewSession 2026-11-25 DECISION:
 * User: "clicking on \"No project\" to switch it on and off is SO bad currently :( it literally
 * switches so much stuff cuz it's going between spaces/projects :( ... I want turning this on and
 * off to be fully stable and smooth. also changing the project that a new session is a part of
 * needs to be also same super stable and not jumpy like it is now no matter what project i pick
 * and what space that project is in".
 * Q4849: `"follow"` ("but how to make this super fast and smooth?").
 * Q4850: `"keep-space"` ("yes but please smooth").
 * Toggling "No project" or picking another project/computer before Send only stores a pending
 * target on the open composer (0 ms, zero `RustChatHost` teardown, keyboard stays up, Sessions
 * list Space and filters untouched). On Send, the draft commits on the server, retargets the
 * existing `RustChatHost` and tab in place with zero blank flash, and keeps the Sessions list's
 * Space and filters as they are.
 * SEE-ALSO: apps/desktop/src/app/native_chat/draft_project_picker.rs, apps/desktop/src/app/gx_store/unified_new_session.rs.
 */

import type { UnifiedProjectChoice } from '../../../contract/unified/choices';
import { homeProjectIdIn, noProjectIdIn } from '../../../contract/chief';
import { useInventoryStore } from '../../../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore } from '../../../machines/store';
import {
  noteNewSessionIn,
  noteNewSessionKeepSpace,
  projectChoicesNow,
} from '../../../screens/sessions-screen/new-session-place';
import { machineRecordFor } from '../../../screens/terminal-screen/session-lookups';
import { attachSessionKey, useTerminalStore } from '../../../terminal/sessions';
import { retargetRustChatHost, type RustChatHost } from '../../rust/host';
import { sessionChatRpc } from '../../rust/transport';
import type { MachineConnectionTarget } from '../../../machines/credentials';
import { createAgentWithFirstInputDraft, machineAgents, openSessionTab } from '../sessionShell';
import { markDraftTouched } from '../untouchedDrafts';

export type PendingDraftTarget = {
  repoKey: string;
  machineId: string;
  projectId: string;
  label: string;
  isMainHub: boolean;
};

let carriedCoordinatorDraft = false;

export function setCarryCoordinatorDraft(flag: boolean): void {
  carriedCoordinatorDraft = flag;
}

export function takeCarryCoordinatorDraft(): boolean {
  const value = carriedCoordinatorDraft;
  carriedCoordinatorDraft = false;
  return value;
}

/**
 * Where the draft's No project pill sends it on a computer: its No project project, else its home project on a
 * computer from before No project (CDXC:Projects 2026-11-27 in contract/chief.ts `noProjectIdIn`).
 */
export function homeProjectIdForMachine(machineId: string): string | null {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary ?? null;
  return noProjectIdIn(summary);
}

/** A project the No project pill stands for: No project, or the home project (whose new chats gxserver puts there). */
export function isHomeProject(machineId: string, projectId: string): boolean {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary ?? null;
  return projectId.length > 0 && (projectId === noProjectIdIn(summary) || projectId === homeProjectIdIn(summary));
}

/** The No project pill's words, as the sidebar names the project (gx-core `NO_PROJECT_NAME`, Q5285 A). */
export const NO_PROJECT_NAME = 'No project';
/** The pending target key of the No project pill's choice. */
export const NO_PROJECT_REPO_KEY = 'no-project';

export function mainHubMachineChoice(): UnifiedProjectChoice | null {
  const inventories = useInventoryStore.getState().inventoriesByMachineId;
  const machines = enabledMachines(useMachinesStore.getState())
    .map((machine) => {
      const inventory = inventories[machine.id];
      const homeId = noProjectIdIn(inventory?.summary ?? null);
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
    repoKey: NO_PROJECT_REPO_KEY,
    label: NO_PROJECT_NAME,
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

/**
 * Commits a pending target destination on Send (Q4849 `"follow"` + Q4850 `"keep-space"`):
 * moves the draft in place on the same computer (or creates + closes across computers), retargets
 * the live `RustChatHost` and open tab in place with zero teardown flash, and updates Recent
 * without switching Space or widening Unified filters.
 */
export async function commitPendingDraftSend(input: {
  from: MachineConnectionTarget;
  fromProjectId: string;
  fromSessionId: string;
  agentId: string;
  to: MachineConnectionTarget;
  toProjectId: string;
  agentModel?: string | null;
  agentEffort?: string | null;
  startingCoordinator?: boolean;
  skillOnlyStart?: boolean;
}): Promise<{ host: RustChatHost | null; projectId: string; sessionId: string }> {
  const { from, to, agentId } = input;
  const fromSessionKey = attachSessionKey(from.id, input.fromSessionId);
  markDraftTouched(fromSessionKey);

  if (from.id === to.id) {
    const moved = await sessionChatRpc(from, 'moveDraftSession', {
      projectId: input.fromProjectId,
      sessionId: input.fromSessionId,
      targetProjectId: input.toProjectId,
      ...(input.agentModel ? { agentModel: input.agentModel } : {}),
      ...(input.agentEffort ? { agentEffort: input.agentEffort } : {}),
      ...(input.startingCoordinator
        ? { promoteCoordinator: { forDraft: true, skillOnlyStart: input.skillOnlyStart === true } }
        : {}),
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
      const host = retargetRustChatHost(
        { machine: from, projectId: input.fromProjectId, sessionId: input.fromSessionId },
        { machine: to, projectId: nextProjectId, sessionId: nextSessionId },
      );
      useTerminalStore.getState().retargetAttachTab(fromSessionKey, {
        machineId: to.id,
        projectId: nextProjectId,
        sessionId: nextSessionId,
      });
      noteNewSessionKeepSpace(to.id, nextProjectId);
      const record = machineRecordFor(to.id);
      if (record !== null) void useInventoryStore.getState().refreshMachine(record).catch(() => undefined);
      return { host, projectId: nextProjectId, sessionId: nextSessionId };
    }
  }

  const agent = machineAgents(to.id).find((entry) => entry.agentId === agentId) ?? { agentId };
  const nextSessionId = await createAgentWithFirstInputDraft(to, {
    projectId: input.toProjectId,
    agent,
    draft: '',
  });
  if (input.startingCoordinator) {
    await sessionChatRpc(to, 'promoteCoordinator', {
      projectId: input.toProjectId,
      sessionId: nextSessionId,
      goal: '',
      forDraft: true,
      skillOnlyStart: input.skillOnlyStart === true,
    }).catch(() => undefined);
  }
  const host = retargetRustChatHost(
    { machine: from, projectId: input.fromProjectId, sessionId: input.fromSessionId },
    { machine: to, projectId: input.toProjectId, sessionId: nextSessionId },
  );
  useTerminalStore.getState().retargetAttachTab(fromSessionKey, {
    machineId: to.id,
    projectId: input.toProjectId,
    sessionId: nextSessionId,
  });
  noteNewSessionKeepSpace(to.id, input.toProjectId);
  void sessionChatRpc(from, 'draftWorktree', {
    projectId: input.fromProjectId,
    sessionId: input.fromSessionId,
    finish: true,
    moved: true,
  }).catch(() => undefined);
  const record = machineRecordFor(to.id);
  if (record !== null) void useInventoryStore.getState().refreshMachine(record).catch(() => undefined);
  return { host, projectId: input.toProjectId, sessionId: nextSessionId };
}
