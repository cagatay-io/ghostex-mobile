/**
 * Per-agent Session mode (`agentSessionMode`) read and write helpers for the phone app.
 *
 * Uses the exact same settings key and values as desktop (`agentSessionMode`: `{ [family]:
 * 'agent-cli' | 'non-cli' }`) where `'agent-cli'` is **Terminal** (default) and `'non-cli'` is
 * **Native** for Claude Code, Codex, and Antigravity.
 *
 * CDXC:AgentProviders 2026-11-24 SEE-ALSO:
 * packages/settings-catalog/src/pages/agents.rs (`agentSessionMode`),
 * server/src/settings_agent_writable.rs (`api_writable_json_keys`),
 * apps/mobile/app/src/screens/settings/AgentSessionModeRows.tsx,
 * apps/mobile/app/src/screens/machine-form/MachineToolsSection.tsx.
 */

import { chatMachineLink } from '../chat/rust/machine-link';
import type { MachineConnectionTarget } from '../machines/credentials';
import { machineNameById } from '../machines/store';

const CALL_TIMEOUT_MS = 12_000;

export type AgentSessionMode = 'agent-cli' | 'non-cli';
export type NativeModeFamily = 'claude' | 'codex' | 'antigravity';

export const NATIVE_MODE_AGENTS: readonly { family: NativeModeFamily; label: string }[] = [
  { family: 'claude', label: 'Claude Code' },
  { family: 'codex', label: 'Codex' },
  { family: 'antigravity', label: 'Antigravity' },
];

export const SESSION_MODE_OPTIONS: readonly { value: AgentSessionMode; label: string }[] = [
  { value: 'agent-cli', label: 'Terminal' },
  { value: 'non-cli', label: 'Native' },
];

export function canonicalNativeModeFamily(raw: string): NativeModeFamily | null {
  switch (raw.trim().toLowerCase()) {
    case 'claude':
    case 'claude-code':
      return 'claude';
    case 'codex':
    case 'codex-cli':
      return 'codex';
    case 'antigravity':
    case 'antigravity-cli':
    case 'agy':
      return 'antigravity';
    default:
      return null;
  }
}

export function extractAgentSessionModes(rawSettings: unknown): Record<string, AgentSessionMode> {
  const modes: Record<string, AgentSessionMode> = {};
  const settings = rawSettings as { agentSessionMode?: unknown; agentAcpMode?: unknown } | null | undefined;
  const raw = settings?.agentSessionMode;
  if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === 'non-cli' || value === 'agent-cli') {
        modes[key] = value;
      }
    }
  }
  // Match server (`server/src/acp/mod.rs::agent_acp_setting`): fall back to legacy `agentAcpMode`
  // booleans for any agent family not explicitly set under `agentSessionMode`.
  const legacy = settings?.agentAcpMode;
  if (legacy !== null && legacy !== undefined && typeof legacy === 'object' && !Array.isArray(legacy)) {
    for (const [key, value] of Object.entries(legacy as Record<string, unknown>)) {
      if (modes[key] === undefined && typeof value === 'boolean') {
        modes[key] = value ? 'non-cli' : 'agent-cli';
      }
    }
  }
  return modes;
}

export function modeForFamily(
  modes: Record<string, AgentSessionMode>,
  family: NativeModeFamily,
): AgentSessionMode {
  return modes[family] === 'non-cli' ? 'non-cli' : 'agent-cli';
}

export type ReadSessionModesResult =
  | { kind: 'values'; modes: Record<string, AgentSessionMode> }
  | { kind: 'unsupported'; message: string }
  | { kind: 'failed'; message: string };

export async function readAgentSessionModes(
  machine: MachineConnectionTarget,
): Promise<ReadSessionModesResult> {
  const computer = machineNameById(machine.id);
  const link = chatMachineLink(machine);
  const route = await link.routeOrRepair();
  if (route === 'legacy') {
    return {
      kind: 'unsupported',
      message: `Update Ghostex on ${computer} to change Session mode from the phone.`,
    };
  }
  if (route !== 'socket') {
    return {
      kind: 'failed',
      message: `Couldn't reach Ghostex on ${computer}; try again in a moment.`,
    };
  }
  const caps = link.capabilities();
  if (caps === null || !caps.includes('nativeModeSwitch')) {
    return {
      kind: 'unsupported',
      message: `Update Ghostex on ${computer} to change Session mode from the phone.`,
    };
  }
  const answer = await link.rpc('readSharedSettings', {}, CALL_TIMEOUT_MS);
  if (answer.error !== null) {
    return {
      kind: 'failed',
      message: answer.error.message,
    };
  }
  const settings = (answer.result as { settings?: unknown } | null | undefined)?.settings;
  return {
    kind: 'values',
    modes: extractAgentSessionModes(settings),
  };
}

export async function saveAgentSessionMode(
  machine: MachineConnectionTarget,
  family: NativeModeFamily,
  mode: AgentSessionMode,
  existingModes: Record<string, AgentSessionMode>,
): Promise<string | null> {
  const link = chatMachineLink(machine);
  const nextModes: Record<string, AgentSessionMode> = {
    ...existingModes,
    [family]: mode,
  };
  const answer = await link.rpc(
    'dispatchRendererCommand',
    {
      action: 'updateSettingsPatch',
      payload: {
        patch: { agentSessionMode: nextModes },
        source: 'mobile:agentSessionMode',
      },
    },
    CALL_TIMEOUT_MS,
  );
  return answer.error === null ? null : answer.error.message;
}
