/**
 * New session › Where: This computer or Cloud Box, at the top of a project's agent menu.
 *
 * CDXC:CloudBoxes 2026-11-02 WHY:
 * The phone's New session starts a draft chat on the computer (`create-agent --defer-start`), and
 * that draft's new-chat bar already offers Cloud Box as its third segment, remembered per project
 * (Q1010 "per project"; gx-chat-core `menus/cloud_box.rs` reads `remembered`). So Where writes the
 * same remembered choice (`projectSettings.remember`) before the draft opens, and the draft opens
 * with Cloud Box picked: one rule, no second way to start a box from the phone while the computer
 * answers. The choice shows only while the computer has a provider connected.
 * SEE-ALSO: server/src/server/worktree_ops/draft_cloud_box.rs (`cloud_box_facts`, `remember_project_choice`)
 */

import { create } from 'zustand';

import { homeCloudBoxesRpc } from './boxLink';
import { cloudKitOf, cloudKitProject } from './cloudKit';

export type CloudWhere = {
  /** A provider is connected and available on that computer. */
  offered: boolean;
  /** The project's remembered choice. */
  cloud: boolean;
  /** The project's whole Cloud Box settings, written back with only `remember` changed. */
  settings: Record<string, unknown>;
  /**
   * The computer does not answer and the phone's cloud kit can start this project's box (Q1033
   * D7): the agents whose logins the kit carries, which the phone starts itself.
   */
  computerOff?: { agents: Array<{ agentId: string; name: string }> };
};

type WhereState = {
  byProject: Record<string, CloudWhere>;
  put: (key: string, where: CloudWhere) => void;
};

export const useCloudWhereStore = create<WhereState>()((set, get) => ({
  byProject: {},
  put: (key, where) => set({ byProject: { ...get().byProject, [key]: where } }),
}));

function whereKey(machineId: string, projectId: string): string {
  return `${machineId}:${projectId}`;
}

export function cloudWhereOf(machineId: string, projectId: string): CloudWhere | null {
  return useCloudWhereStore.getState().byProject[whereKey(machineId, projectId)] ?? null;
}

/** Reads whether the computer offers Cloud Box for the project, and what the project remembers. */
export async function loadCloudWhere(machineId: string, projectId: string): Promise<void> {
  if (projectId.length === 0) return;
  const [providers, project] = await Promise.all([
    homeCloudBoxesRpc(machineId, 'providers'),
    homeCloudBoxesRpc(machineId, 'projectSettings', { projectId }),
  ]);
  if (providers.error?.code === 'unreachable' || project.error?.code === 'unreachable') {
    const kitProject = await cloudKitProject(machineId, projectId);
    const kit = kitProject === null ? null : await cloudKitOf(machineId);
    if (kit === null) return;
    const agents = [...new Set(kit.accounts.map((account) => account.agent))].map((agentId) => ({
      agentId,
      name: agentId === 'claude' ? 'Claude' : agentId === 'codex' ? 'Codex' : agentId,
    }));
    useCloudWhereStore.getState().put(whereKey(machineId, projectId), {
      offered: true,
      cloud: true,
      settings: {},
      computerOff: { agents },
    });
    return;
  }
  if (providers.error !== null || project.error !== null) return;
  const rows = (providers.result as { providers?: Array<{ state?: string; available?: boolean }> } | null)?.providers ?? [];
  const settings = ((project.result as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<
    string,
    unknown
  >;
  useCloudWhereStore.getState().put(whereKey(machineId, projectId), {
    offered: rows.some((row) => row.state === 'connected' && row.available !== false),
    cloud: settings.remember === 'cloud',
    settings,
  });
}

/** Remembers This computer or Cloud Box for the project's next new chat; answers an error message. */
export async function setCloudWhere(machineId: string, projectId: string, cloud: boolean): Promise<string | null> {
  const current = cloudWhereOf(machineId, projectId);
  if (current === null) return 'Cloud Box is not available for this project.';
  const settings = {
    secrets: { files: [], vars: [] },
    ...current.settings,
    remember: cloud ? 'cloud' : 'local',
  };
  useCloudWhereStore.getState().put(whereKey(machineId, projectId), { ...current, cloud, settings });
  const answer = await homeCloudBoxesRpc(machineId, 'projectSettings', { projectId, settings });
  if (answer.error === null) return null;
  useCloudWhereStore.getState().put(whereKey(machineId, projectId), current);
  return answer.error.message;
}
