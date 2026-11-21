/**
 * Missing-agent refusal handling for agent launches and draft switches.
 *
 * When gxserver refuses a launch or agent switch because the agent's CLI is not installed on that
 * computer (`agentNotInstalled` / "<Agent> isn't installed on this computer." from
 * `server/src/agents/cli_missing.rs`), the phone shows a dedicated plain-worded notice card
 * instead of raw error text, with a button that opens that computer's Agent CLIs screen.
 */

import { create } from 'zustand';

import { navigationRef } from '../app/deepLinks';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { scanJsonObjects } from '../contract/mobileSummary';
import { isDemoMachine } from '../demo/identity';
import { machineDisplayLabel, useMachinesStore } from '../machines/store';

/** gxserver error code for a missing agent CLI (`server/src/agents/cli_missing.rs`). */
export const AGENT_NOT_INSTALLED_CODE = 'agentNotInstalled';

/** Sentence gxserver emits when refusing a missing CLI (`agent_not_installed_error`). */
export const AGENT_NOT_INSTALLED_SENTENCE = " isn't installed on this computer.";

const FALLBACK_AGENT_NAME = 'This agent';
const MAX_AGENT_NAME_LENGTH = 80;

export type MissingAgentError = {
  agentName: string;
};

export type MissingAgentNoticeState = {
  machineId: string;
  agentName: string;
};

export type MissingAgentNoticeCopy = {
  title: string;
  body: string;
  openLabel: string | null;
};

function extractNameFromSentence(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const index = line.indexOf(AGENT_NOT_INSTALLED_SENTENCE);
    if (index <= 0) continue;
    const name = line.slice(0, index).trim();
    if (name.length > 0 && name.length <= MAX_AGENT_NAME_LENGTH && !/[{}"\t]/u.test(name)) {
      return name;
    }
  }
  return null;
}

function parseFromJsonBlocks(text: string): MissingAgentError | null {
  return scanJsonObjects<MissingAgentError | null>(text, (block, start) => {
    try {
      const parsed: unknown = JSON.parse(block);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const codeField = typeof record.code === 'string' ? record.code.trim() : '';
        const errorField = typeof record.error === 'string' ? record.error.trim() : '';
        const messageField = typeof record.message === 'string' ? record.message.trim() : '';
        const code =
          codeField.length > 0 ? codeField : errorField === AGENT_NOT_INSTALLED_CODE ? AGENT_NOT_INSTALLED_CODE : null;
        if (code !== null && code !== AGENT_NOT_INSTALLED_CODE) {
          return { done: false, nextIndex: start + block.length };
        }
        const candidateText = messageField.length > 0 ? messageField : errorField;
        const fromSentence = extractNameFromSentence(candidateText);
        if (fromSentence !== null) {
          return { done: true, result: { agentName: fromSentence } };
        }
        if (code === AGENT_NOT_INSTALLED_CODE) {
          return { done: true, result: { agentName: FALLBACK_AGENT_NAME } };
        }
      }
    } catch {
      // Shell output can contain non-JSON brace blocks; keep scanning.
    }
    return { done: false, nextIndex: start + block.length };
  });
}

function parseFromText(text: string): MissingAgentError | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const fromJson = parseFromJsonBlocks(trimmed);
  if (fromJson !== null) return fromJson;
  const fromSentence = extractNameFromSentence(trimmed);
  return fromSentence !== null ? { agentName: fromSentence } : null;
}

/**
 * Recognizes a missing-agent refusal from a structured chat RPC error (`code: 'agentNotInstalled'`),
 * a thrown `GhostexCliFailure` (`raw` JSON from `ghostex create-agent --json` and sibling verbs),
 * or plain refusal text. Returns null for unrelated or legacy-computer errors so existing error
 * handling stays untouched.
 */
export function parseAgentNotInstalled(error: unknown): MissingAgentError | null {
  if (error === null || error === undefined) return null;
  if (typeof error === 'string') return parseFromText(error);

  if (typeof error === 'object') {
    const record = error as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
      raw?: unknown;
    };
    const codeField = typeof record.code === 'string' ? record.code.trim() : '';
    const errorField = typeof record.error === 'string' ? record.error.trim() : '';
    const messageField = typeof record.message === 'string' ? record.message.trim() : '';
    const rawField = typeof record.raw === 'string' ? record.raw.trim() : '';
    const code =
      codeField.length > 0 ? codeField : errorField === AGENT_NOT_INSTALLED_CODE ? AGENT_NOT_INSTALLED_CODE : null;

    if (code !== null && code !== AGENT_NOT_INSTALLED_CODE) {
      return null;
    }

    if (rawField.length > 0) {
      const fromRaw = parseFromText(rawField);
      if (fromRaw !== null) return fromRaw;
    }

    if (messageField.length > 0) {
      const fromMessage = parseFromText(messageField);
      if (fromMessage !== null) return fromMessage;
    }

    if (errorField.length > 0 && errorField !== AGENT_NOT_INSTALLED_CODE) {
      const fromError = parseFromText(errorField);
      if (fromError !== null) return fromError;
    }

    if (code === AGENT_NOT_INSTALLED_CODE) {
      return { agentName: FALLBACK_AGENT_NAME };
    }
  }

  return null;
}

/** Whether the phone can open the Agent CLIs screen (`MachineForm` `tools` section) for `machineId`. */
export function canOpenAgentClis(machineId: string): boolean {
  if (machineId.length === 0 || isCloudBoxMachineId(machineId)) return false;
  const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
  return machine !== undefined && !isDemoMachine(machine);
}

/** Plain-worded title, two-sentence body, and action label for the missing-agent notice card. */
export function missingAgentNoticeCopy(agentName: string, machineId: string): MissingAgentNoticeCopy {
  const name = agentName.trim().length > 0 ? agentName.trim() : FALLBACK_AGENT_NAME;
  const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
  const computer = machine !== undefined ? machineDisplayLabel(machine) : null;
  const place = computer !== null ? computer : 'this computer';
  const canOpen = canOpenAgentClis(machineId);
  return {
    title: `${name} isn't installed`,
    body: canOpen
      ? `${name} isn't installed on ${place}. Open Agent CLIs to install it, or pick another agent.`
      : `${name} isn't installed on ${place}. Install it in Settings > Agents on that computer, or pick another agent.`,
    openLabel: canOpen ? 'Open Agent CLIs' : null,
  };
}

export const useMissingAgentNotice = create<{ notice: MissingAgentNoticeState | null }>(() => ({
  notice: null,
}));

export function showMissingAgentNotice(machineId: string, agentName: string): void {
  useMissingAgentNotice.setState({ notice: { machineId, agentName } });
}

export function dismissMissingAgentNotice(): void {
  useMissingAgentNotice.setState({ notice: null });
}

/** If `error` is a missing-agent refusal, shows the notice card and returns true. */
export function reportMissingAgentError(machineId: string, error: unknown): boolean {
  const parsed = parseAgentNotInstalled(error);
  if (parsed === null) return false;
  showMissingAgentNotice(machineId, parsed.agentName);
  return true;
}

/** Dismisses the notice card and opens that computer's Agent CLIs screen (same route as the model picker's "+"). */
export function openAgentClisScreen(machineId: string): void {
  dismissMissingAgentNotice();
  if (canOpenAgentClis(machineId) && navigationRef.isReady()) {
    navigationRef.navigate('MachineForm', { machineId, section: 'tools' });
  }
}
