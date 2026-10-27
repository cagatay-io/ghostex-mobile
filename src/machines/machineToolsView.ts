/**
 * The rows of a computer's Agent CLIs and Skills and tools on the phone (machineTools.ts reads and
 * runs them): pure, so they are tested without the app.
 */

export const TOO_OLD_MESSAGE = "This computer's Ghostex is too old for this; update Ghostex there first.";

export type ToolJob = {
  id?: string;
  operation?: string;
  status?: string;
  error?: string | null;
  output?: string;
};

/** One `/api/agentCliMaintenance` `list` entry, as far as the phone reads it. */
export type AgentCli = {
  agentId: string;
  name?: string | null;
  executablePath?: string | null;
  version?: string | null;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  updateHeldBack?: string | null;
  detectedMethodId?: string | null;
  methods?: { id: string; label?: string; unavailableReason?: string | null }[];
  job?: ToolJob | null;
};

/** One `/api/managedTools` entry. */
export type ManagedTool = {
  id: string;
  label?: string;
  supported?: boolean;
  installed?: boolean;
  version?: string | null;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  actions?: string[];
  unsupportedReason?: string | null;
  unavailableReason?: string | null;
  terminalCommand?: string | null;
  permissionNote?: string | null;
  /** Its check ran past the time limit on the computer (GitHub #336): why. */
  notAnswering?: string | null;
  job?: ToolJob | null;
};

export type MachineSkill = {
  skillName: string;
  name?: string | null;
  installed?: boolean;
  unavailableReason?: string | null;
};

export type MachineIntegrations = {
  platform?: string;
  ghostexCli?: { installed?: boolean; path?: string | null };
  skills?: MachineSkill[];
};

export type RowTone = 'muted' | 'success' | 'warning';

export type RowAction = { label: string; operation: string; methodId?: string };

export type ToolRowView = {
  key: string;
  title: string;
  detail: string;
  tone: RowTone;
  busy: boolean;
  action: RowAction | null;
};

export function jobActive(job: ToolJob | null | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

function runningWord(operation: string | undefined): string {
  switch (operation) {
    case 'update':
      return 'Updating';
    case 'reinstall':
      return 'Reinstalling';
    case 'uninstall':
      return 'Uninstalling';
    default:
      return 'Installing';
  }
}

/** A failed job's last words, so a row says why. */
function failedJob(job: ToolJob | null | undefined): string | null {
  if (job?.status !== 'failed') return null;
  return job.error?.trim() || 'The last install did not finish.';
}

/** An agent CLI row: installed or not, its version, an update (desktop: agents/remote_machine.rs). */
export function agentCliRow(agent: AgentCli): ToolRowView {
  const key = `agent:${agent.agentId}`;
  const title = agent.name?.trim() || agent.agentId;
  const installed = (agent.executablePath ?? '') !== '';
  if (jobActive(agent.job)) {
    return {
      key,
      title,
      detail: agent.job?.status === 'queued' ? 'Waiting…' : `${runningWord(agent.job?.operation)}…`,
      tone: 'muted',
      busy: true,
      action: null,
    };
  }
  const failure = failedJob(agent.job);
  if (!installed) {
    const method = agent.methods?.find((candidate) => !candidate.unavailableReason) ?? null;
    const unavailable = method === null ? agent.methods?.[0]?.unavailableReason?.trim() : null;
    return {
      key,
      title,
      detail: failure ?? unavailable ?? 'Not installed',
      tone: failure !== null || unavailable ? 'warning' : 'muted',
      busy: false,
      action: method === null ? null : { label: 'Install', operation: 'install', methodId: method.id },
    };
  }
  const version = agent.version?.trim();
  let detail = version ? `Installed · ${version}` : 'Installed';
  const update = agent.updateAvailable === true && !agent.updateHeldBack && agent.detectedMethodId;
  if (agent.updateAvailable === true && agent.latestVersion) detail += ` · ${agent.latestVersion} available`;
  return {
    key,
    title,
    detail: failure ?? detail,
    tone: failure !== null ? 'warning' : 'success',
    busy: false,
    action: update ? { label: 'Update', operation: 'update', methodId: agent.detectedMethodId ?? undefined } : null,
  };
}

/** A tool row, `permissionNote` first: an installed Desktop control tool without its macOS grants isn't done. */
export function toolRow(tool: ManagedTool): ToolRowView {
  const key = `tool:${tool.id}`;
  const title = tool.label?.trim() || tool.id;
  if (tool.supported !== true) {
    return {
      key,
      title,
      detail: tool.unsupportedReason?.trim() || 'Not available on this computer.',
      tone: 'muted',
      busy: false,
      action: null,
    };
  }
  if (jobActive(tool.job)) {
    return {
      key,
      title,
      detail:
        tool.job?.status === 'queued'
          ? 'Waiting for another install to finish…'
          : `${runningWord(tool.job?.operation)}…`,
      tone: 'muted',
      busy: true,
      action: null,
    };
  }
  const notAnswering = tool.notAnswering?.trim();
  if (notAnswering) {
    return {
      key,
      title,
      detail: `Not answering. ${notAnswering}`,
      tone: 'warning',
      busy: false,
      action: { label: 'Retry', operation: 'retry' },
    };
  }
  const failure = failedJob(tool.job);
  const can = (operation: string) => tool.actions?.includes(operation) === true;
  if (tool.installed !== true) {
    const viaTerminal = (tool.terminalCommand ?? '') !== '';
    const blocked =
      tool.unavailableReason?.trim() || (viaTerminal ? 'Install it from a terminal on that computer.' : null);
    return {
      key,
      title,
      detail: failure ?? blocked ?? 'Not installed',
      tone: failure !== null ? 'warning' : 'muted',
      busy: false,
      action: can('install') && !viaTerminal ? { label: 'Install', operation: 'install' } : null,
    };
  }
  const version = tool.version?.trim();
  const note = tool.permissionNote?.trim();
  let detail = version ? `Installed · ${version}` : 'Installed';
  if (tool.updateAvailable === true && tool.latestVersion) detail += ` · ${tool.latestVersion} available`;
  if (note) detail = `${version ? `${version}. ` : ''}${note}`;
  return {
    key,
    title,
    detail: failure ?? detail,
    tone: failure !== null || note || tool.updateAvailable === true ? 'warning' : 'success',
    busy: false,
    action: tool.updateAvailable === true && can('update') ? { label: 'Update', operation: 'update' } : null,
  };
}

/** A bundled skill row: Install, or why this computer can't have it. */
export function skillRow(skill: MachineSkill): ToolRowView {
  const key = `skill:${skill.skillName}`;
  const title = skill.name?.trim() || skill.skillName;
  const unavailable = skill.unavailableReason?.trim();
  if (unavailable) return { key, title, detail: unavailable, tone: 'muted', busy: false, action: null };
  if (skill.installed === true) {
    return {
      key,
      title,
      detail: `Installed · $${skill.skillName}`,
      tone: 'success',
      busy: false,
      action: { label: 'Remove', operation: 'uninstallSkill' },
    };
  }
  return {
    key,
    title,
    detail: 'Not installed',
    tone: 'muted',
    busy: false,
    action: { label: 'Install', operation: 'installSkill' },
  };
}

/** Desktop control tools first, the way the desktop groups them. */
export const DESKTOP_CONTROL_TOOL_IDS = ['trycua', 'spaceo'];

/** The words for a failed call: `notFound` is a gxserver from before the endpoint. */
export function answerError(error: { code?: string | null; message: string }, unreachable: string): string {
  if (error.code === 'notFound') return TOO_OLD_MESSAGE;
  return error.message.trim() || unreachable;
}
