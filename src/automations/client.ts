/**
 * Automations client on the phone: reads and updates a computer's scheduled automations
 * directly on the computer that owns the project.
 *
 * Uses the computer's warm gxserver HTTP link (`POST /api/readAutomationState`, etc.) when
 * available, and falls back to the existing `ghostex automation-*` CLI commands over SSH when
 * the computer has no warm forward (legacy SSH-only links). Because both paths already exist
 * on gxserver (including 11.13.0 headless servers), this works over the air with no server update.
 */

import { chatMachineLink, unreachableMessage } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import {
  automationArchiveRunCommand,
  automationMarkRunReadCommand,
  automationRunNowCommand,
  automationSetEnabledCommand,
  automationStateCommand,
} from '../commands/ghostexCli';
import { runGhostexCli } from '../components/sessions/cli';
import { isDemoMachineId } from '../demo/identity';
import type { MachineConnectionTarget } from '../machines/credentials';
import { machineNameById } from '../machines/store';
import {
  EMPTY_AUTOMATION_STATE,
  mergeAutomationStates,
  parseAutomationState,
  type AutomationState,
  type AutomationTargetProject,
} from './model';

const READ_TIMEOUT_MS = 25_000;
const WRITE_TIMEOUT_MS = 45_000;
const SOCKET_CONCURRENCY = 4;
const SSH_CONCURRENCY = 2;

export type AutomationProjectRef = {
  readonly projectId?: string;
  readonly projectPath?: string;
  readonly name?: string;
};

export class AutomationsClientError extends Error {
  readonly unreachable: boolean;

  constructor(message: string, unreachable = false) {
    super(message);
    this.unreachable = unreachable;
  }
}

function extractAutomationStatePayload(raw: unknown): unknown | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.automationState === 'object' && obj.automationState !== null) {
    return obj.automationState;
  }
  const nested = obj.result;
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const inner = (nested as Record<string, unknown>).automationState;
    if (typeof inner === 'object' && inner !== null) return inner;
  }
  return null;
}

function scopeParams(project?: AutomationProjectRef): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const id = project?.projectId?.trim() ?? '';
  const path = project?.projectPath?.trim() ?? '';
  if (id.length > 0) params.projectId = id;
  if (path.length > 0) params.projectPath = path;
  return params;
}

/**
 * Sends one automation RPC to `machine` (never to another computer): warm HTTP forward first,
 * then `ghostex automation-*` over SSH when no forward is available.
 */
async function callAutomationEndpoint(
  machine: MachineConnectionTarget,
  method: string,
  params: Record<string, unknown>,
  cliCommand: string,
  timeoutMs: number,
): Promise<AutomationState> {
  if (isDemoMachineId(machine.id)) {
    return EMPTY_AUTOMATION_STATE;
  }

  const link = chatMachineLink(machine);
  if ((await link.route()) === 'socket') {
    const sent = await link.request(method, params, timeoutMs);
    if (sent.kind === 'answered') {
      if (sent.answer.error !== null) {
        const isUnreachable = sent.answer.error.code === 'unreachable';
        throw new AutomationsClientError(sent.answer.error.message, isUnreachable);
      }
      const payload = extractAutomationStatePayload(sent.answer.result);
      if (payload === null) {
        throw new AutomationsClientError(`Ghostex on ${machineNameById(machine.id)} did not return automation data.`);
      }
      return parseAutomationState(payload);
    }
  }

  if (isCloudBoxMachineId(machine.id)) {
    throw new AutomationsClientError(unreachableMessage(machineNameById(machine.id)), true);
  }

  try {
    const reply = await runGhostexCli(machine, cliCommand, { timeoutMs });
    const payload = extractAutomationStatePayload(reply.json);
    if (payload === null) {
      throw new AutomationsClientError(`Ghostex on ${machineNameById(machine.id)} did not return automation data.`);
    }
    return parseAutomationState(payload);
  } catch (error) {
    if (error instanceof AutomationsClientError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const looksUnreachable = /couldn't reach|not connected|timed out|refused|network|unreachable/iu.test(message);
    throw new AutomationsClientError(message, looksUnreachable);
  }
}

export function readProjectAutomationState(
  machine: MachineConnectionTarget,
  project: AutomationProjectRef,
): Promise<AutomationState> {
  return callAutomationEndpoint(
    machine,
    'readAutomationState',
    scopeParams(project),
    automationStateCommand(project),
    READ_TIMEOUT_MS,
  );
}

/** Runs `work` over `items` with at most `limit` in flight at once. */
async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await work(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Reads all projects' automations from `machine` and merges them into one computer-wide view,
 * matching desktop's `gpui_automation_all_projects_state`. When `knownProjects` is empty (e.g.
 * the computer's inventory summary has not loaded yet), a seed call to `readAutomationState({})`
 * discovers the computer's registered target projects first.
 */
export async function readAllAutomationStates(
  machine: MachineConnectionTarget,
  knownProjects: readonly AutomationProjectRef[],
): Promise<AutomationState> {
  if (isDemoMachineId(machine.id)) {
    return EMPTY_AUTOMATION_STATE;
  }

  const route = await chatMachineLink(machine).route();
  const concurrency = route === 'socket' ? SOCKET_CONCURRENCY : SSH_CONCURRENCY;

  const dedupedKnown: AutomationProjectRef[] = [];
  const seenIds = new Set<string>();
  for (const project of knownProjects) {
    const id = project.projectId?.trim() ?? '';
    const path = project.projectPath?.trim() ?? '';
    if (id.length === 0 || id === 'quick-automations' || path.length === 0 || seenIds.has(id)) continue;
    seenIds.add(id);
    dedupedKnown.push({ projectId: id, projectPath: path, name: project.name });
  }

  // If inventory didn't give us projects yet, ask the server with empty scope: gxserver returns the
  // first project's state plus `projects` (all target projects on that computer).
  if (dedupedKnown.length === 0) {
    let seed: AutomationState;
    try {
      seed = await callAutomationEndpoint(
        machine,
        'readAutomationState',
        {},
        automationStateCommand(),
        READ_TIMEOUT_MS,
      );
    } catch (error) {
      // A computer with zero projects returns badRequest ("projectId or projectPath is required.").
      const text = error instanceof Error ? error.message : String(error);
      if (/projectId or projectPath is required/iu.test(text)) {
        return EMPTY_AUTOMATION_STATE;
      }
      throw error;
    }
    const remaining = seed.projects.filter(
      (project) =>
        project.projectId.length > 0 &&
        project.projectId !== 'quick-automations' &&
        project.projectId !== seed.projectId &&
        project.path.length > 0,
    );
    if (remaining.length === 0) {
      return mergeAutomationStates([seed], seed.projects);
    }
    const rest = await mapBounded(remaining, concurrency, (project) =>
      readProjectAutomationState(machine, { projectId: project.projectId, projectPath: project.path }),
    );
    const states: AutomationState[] = [seed];
    for (const outcome of rest) {
      if (outcome.status === 'fulfilled') states.push(outcome.value);
    }
    return mergeAutomationStates(states, seed.projects);
  }

  const settled = await mapBounded(dedupedKnown, concurrency, (project) =>
    readProjectAutomationState(machine, project),
  );
  const states: AutomationState[] = [];
  let firstError: unknown = null;
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') states.push(outcome.value);
    else if (firstError === null) firstError = outcome.reason;
  }
  if (states.length === 0 && firstError !== null) {
    throw firstError;
  }
  const fallbackProjects: AutomationTargetProject[] = dedupedKnown.map((project) => ({
    projectId: project.projectId ?? '',
    label: project.name?.trim() || project.projectPath?.split(/[\\/]/u).pop() || project.projectId || 'Project',
    path: project.projectPath ?? '',
    canUseWorktrees: false,
  }));
  return mergeAutomationStates(states, fallbackProjects);
}

export function setAutomationEnabled(
  machine: MachineConnectionTarget,
  project: AutomationProjectRef,
  automationId: string,
  enabled: boolean,
): Promise<AutomationState> {
  return callAutomationEndpoint(
    machine,
    'setAutomationEnabled',
    { ...scopeParams(project), automationId, enabled },
    automationSetEnabledCommand(automationId, enabled, project),
    WRITE_TIMEOUT_MS,
  );
}

export function runAutomationNow(
  machine: MachineConnectionTarget,
  project: AutomationProjectRef,
  automationId: string,
): Promise<AutomationState> {
  return callAutomationEndpoint(
    machine,
    'runAutomationNow',
    { ...scopeParams(project), automationId },
    automationRunNowCommand(automationId, project),
    WRITE_TIMEOUT_MS,
  );
}

export function markAutomationRunRead(
  machine: MachineConnectionTarget,
  project: AutomationProjectRef,
  runId: string,
): Promise<AutomationState> {
  return callAutomationEndpoint(
    machine,
    'markAutomationRunRead',
    { ...scopeParams(project), runId },
    automationMarkRunReadCommand(runId, project),
    WRITE_TIMEOUT_MS,
  );
}

export function archiveAutomationRun(
  machine: MachineConnectionTarget,
  project: AutomationProjectRef,
  runId: string,
): Promise<AutomationState> {
  return callAutomationEndpoint(
    machine,
    'archiveAutomationRun',
    { ...scopeParams(project), runId, removeWorktree: false },
    automationArchiveRunCommand(runId, project),
    WRITE_TIMEOUT_MS,
  );
}
