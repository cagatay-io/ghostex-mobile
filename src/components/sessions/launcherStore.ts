/**
 * Header launcher preferences, mirroring the desktop sidebar's persistence:
 * - the agent picked last anywhere, and the one picked in each project and each Space
 *   (desktop "ghostex-sidebar-project-terminal-launcher" and
 *   "ghostex.sidebar.agentLauncherChoices.v1"); which one a project's split-button starts is
 *   ./agentChoice.ts,
 * - the last-run quick action per project for the actions button
 *   (desktop "ghostex.titlebar.lastActionCommandByProject:<projectKey>").
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { QuickActionRef } from '../../actions/quickActions';
import { readAgentChoiceMap, rememberAgentChoice, type AgentChoicePlace } from './agentChoice';

const LAUNCHER_STORAGE_KEY = 'drawer.launcher.v1';

/**
 * A last-run mark as stored: a project action as its bare commandId (the form every earlier version wrote), a
 * Global Action with its scope.
 */
type PersistedLastAction = string | { scope: 'global'; commandId: string };

type PersistedLauncher = {
  primaryAgentId?: string;
  agentByProject?: Record<string, string>;
  agentBySpace?: Record<string, string>;
  lastActionByProject?: Record<string, PersistedLastAction>;
};

type LauncherState = {
  hydrated: boolean;
  /** The agent picked last anywhere ('' = none yet, which starts the first agent). */
  primaryAgentId: string;
  /** The agent picked in each project, keyed `${machineId}:${projectId}`. */
  agentByProject: Record<string, string>;
  /** The agent picked in each Space, keyed `${machineId}:${spaceId}`. */
  agentBySpace: Record<string, string>;
  /** Last-run quick action, keyed `${machineId}:${projectId}`. */
  lastActionByProject: Record<string, QuickActionRef>;

  hydrate: () => Promise<void>;
  /** Remembers a launched agent for its project, its Space and as the last pick. */
  rememberAgent: (agentId: string, place: AgentChoicePlace) => void;
  setLastAction: (machineId: string, projectId: string, action: QuickActionRef) => void;
};

export function lastActionKey(machineId: string, projectId: string): string {
  return `${machineId}:${projectId}`;
}

function readLastAction(value: unknown): QuickActionRef | null {
  if (typeof value === 'string') return { scope: 'project', commandId: value };
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { scope?: unknown; commandId?: unknown };
  return record.scope === 'global' && typeof record.commandId === 'string'
    ? { scope: 'global', commandId: record.commandId }
    : null;
}

export const useLauncherStore = create<LauncherState>()((set, get) => {
  const persist = (): void => {
    const { primaryAgentId, agentByProject, agentBySpace } = get();
    const lastActionByProject: Record<string, PersistedLastAction> = {};
    for (const [key, action] of Object.entries(get().lastActionByProject)) {
      lastActionByProject[key] =
        action.scope === 'project' ? action.commandId : { scope: 'global', commandId: action.commandId };
    }
    const payload: PersistedLauncher = { primaryAgentId, agentByProject, agentBySpace, lastActionByProject };
    void AsyncStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(payload));
  };

  return {
    hydrated: false,
    primaryAgentId: '',
    agentByProject: {},
    agentBySpace: {},
    lastActionByProject: {},

    hydrate: async () => {
      if (get().hydrated) return;
      let primaryAgentId = '';
      let agentByProject: Record<string, string> = {};
      let agentBySpace: Record<string, string> = {};
      const lastActionByProject: Record<string, QuickActionRef> = {};
      try {
        const raw = await AsyncStorage.getItem(LAUNCHER_STORAGE_KEY);
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            const record = parsed as PersistedLauncher;
            if (typeof record.primaryAgentId === 'string') primaryAgentId = record.primaryAgentId;
            agentByProject = readAgentChoiceMap(record.agentByProject);
            agentBySpace = readAgentChoiceMap(record.agentBySpace);
            if (typeof record.lastActionByProject === 'object' && record.lastActionByProject !== null) {
              for (const [key, value] of Object.entries(record.lastActionByProject)) {
                const action = readLastAction(value);
                if (action !== null) lastActionByProject[key] = action;
              }
            }
          }
        }
      } catch {
        // Corrupt launcher state falls back to defaults.
      }
      set({ hydrated: true, primaryAgentId, agentByProject, agentBySpace, lastActionByProject });
    },

    rememberAgent: (agentId, place) => {
      const { primaryAgentId, agentByProject, agentBySpace } = get();
      const next = rememberAgentChoice(
        { last: primaryAgentId, byProject: agentByProject, bySpace: agentBySpace },
        agentId,
        place,
      );
      set({ primaryAgentId: next.last, agentByProject: next.byProject, agentBySpace: next.bySpace });
      persist();
    },

    setLastAction: (machineId, projectId, action) => {
      set({
        lastActionByProject: {
          ...get().lastActionByProject,
          [lastActionKey(machineId, projectId)]: action,
        },
      });
      persist();
    },
  };
});
