/**
 * Automations data model, schedule/status wording, and Triage rules on the phone.
 * Mirrors the desktop Automate view (`apps/desktop/src/app/native_automate/model.rs` and `drafts.rs`)
 * so both apps parse the same gxserver `automationState` payload and sort Runs and Triage identically.
 */

export type AutomationAgentOption = {
  readonly agentId: string;
  readonly label: string;
  readonly icon?: string;
};

export type AutomationTargetProject = {
  readonly projectId: string;
  readonly label: string;
  readonly path: string;
  readonly canUseWorktrees: boolean;
  readonly worktreeUnavailableReason?: string;
};

export type AutomationSchedule =
  | { readonly kind: 'once'; readonly runAt: string }
  | { readonly kind: 'interval'; readonly everyMs: number }
  | { readonly kind: 'daily'; readonly time: string; readonly timezone: string }
  | { readonly kind: 'weekly'; readonly days: readonly number[]; readonly time: string; readonly timezone: string }
  | { readonly kind: 'cron'; readonly expression: string; readonly timezone: string };

export type AutomationExecutionMode =
  | { readonly kind: 'local' }
  | { readonly kind: 'worktree'; readonly setupCommand?: string }
  | {
      readonly kind: 'thread';
      readonly agentSessionId?: string;
      readonly expiresAt?: string;
      readonly sessionId?: string;
    };

export type AutomationDefinition = {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly agentId: string;
  readonly enabled: boolean;
  readonly nextRunAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly projectIds: readonly string[];
  readonly schedule: AutomationSchedule;
  readonly executionMode: AutomationExecutionMode;
  readonly model?: string;
  readonly effort?: string;
  readonly ownerBotId?: string;
};

export type AutomationRunWorktree = {
  readonly branch: string;
  readonly path: string;
};

export type AutomationRun = {
  readonly id: string;
  readonly automationId: string;
  readonly projectId: string;
  readonly status: string;
  readonly sessionId: string | null;
  readonly errorMessage: string | null;
  readonly findingsSummary: string | null;
  readonly isArchived: boolean;
  readonly isUnread: boolean;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly worktree: AutomationRunWorktree | null;
};

export type AutomationState = {
  readonly agents: readonly AutomationAgentOption[];
  readonly automations: readonly AutomationDefinition[];
  readonly defaultAgentId: string | null;
  readonly projectCanUseWorktrees: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly projects: readonly AutomationTargetProject[];
  readonly runs: readonly AutomationRun[];
  readonly worktreeUnavailableReason: string | null;
};

export type AutomationsScope =
  | { readonly kind: 'all' }
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly projectName: string;
      readonly projectPath: string;
    };

export type AutomationTab = 'automations' | 'runs' | 'triage';

export type RunStatusTone = 'danger' | 'warning' | 'accent' | 'success' | 'muted';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const INTERVAL_PRESETS: ReadonlyArray<{ readonly ms: number; readonly label: string }> = [
  { ms: 5 * 60_000, label: 'Every 5 minutes' },
  { ms: 15 * 60_000, label: 'Every 15 minutes' },
  { ms: 30 * 60_000, label: 'Every 30 minutes' },
  { ms: 60 * 60_000, label: 'Hourly' },
  { ms: 6 * 60 * 60_000, label: 'Every 6 hours' },
  { ms: 12 * 60 * 60_000, label: 'Every 12 hours' },
];

/** Matches `PROJECT_AUTOMATION_TRIAGE_RECENT_COMPLETED_LIMIT` on desktop. */
const TRIAGE_RECENT_COMPLETED_LIMIT = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSchedule(raw: unknown): AutomationSchedule | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const kind = trimmedText(obj.kind);
  switch (kind) {
    case 'once': {
      const runAt = trimmedText(obj.runAt);
      return runAt === null ? null : { kind: 'once', runAt };
    }
    case 'interval': {
      const everyMs = typeof obj.everyMs === 'number' && Number.isFinite(obj.everyMs) ? obj.everyMs : null;
      return everyMs === null || everyMs <= 0 ? null : { kind: 'interval', everyMs };
    }
    case 'daily': {
      const time = trimmedText(obj.time);
      return time === null ? null : { kind: 'daily', time, timezone: trimmedText(obj.timezone) ?? '' };
    }
    case 'weekly': {
      const time = trimmedText(obj.time);
      const days = Array.isArray(obj.days)
        ? obj.days.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
        : [];
      return time === null ? null : { kind: 'weekly', days, time, timezone: trimmedText(obj.timezone) ?? '' };
    }
    case 'cron': {
      const expression = trimmedText(obj.expression);
      return expression === null ? null : { kind: 'cron', expression, timezone: trimmedText(obj.timezone) ?? '' };
    }
    default:
      return null;
  }
}

function parseExecutionMode(raw: unknown): AutomationExecutionMode {
  const obj = asRecord(raw);
  if (obj === null) return { kind: 'local' };
  const kind = trimmedText(obj.kind);
  if (kind === 'worktree') {
    const setupCommand = trimmedText(obj.setupCommand) ?? undefined;
    return setupCommand === undefined ? { kind: 'worktree' } : { kind: 'worktree', setupCommand };
  }
  if (kind === 'thread') {
    return {
      kind: 'thread',
      ...(trimmedText(obj.agentSessionId) !== null ? { agentSessionId: trimmedText(obj.agentSessionId)! } : {}),
      ...(trimmedText(obj.expiresAt) !== null ? { expiresAt: trimmedText(obj.expiresAt)! } : {}),
      ...(trimmedText(obj.sessionId) !== null ? { sessionId: trimmedText(obj.sessionId)! } : {}),
    };
  }
  return { kind: 'local' };
}

function parseAgent(raw: unknown): AutomationAgentOption | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const agentId = trimmedText(obj.agentId);
  if (agentId === null) return null;
  const label = trimmedText(obj.label) ?? agentId;
  const icon = trimmedText(obj.icon) ?? undefined;
  return { agentId, label, ...(icon !== undefined ? { icon } : {}) };
}

function parseTargetProject(raw: unknown): AutomationTargetProject | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const projectId = trimmedText(obj.projectId);
  if (projectId === null) return null;
  const path = trimmedText(obj.path) ?? '';
  const label = trimmedText(obj.label) ?? (path.split(/[\\/]/u).pop() || projectId);
  const worktreeUnavailableReason = trimmedText(obj.worktreeUnavailableReason) ?? undefined;
  return {
    projectId,
    label,
    path,
    canUseWorktrees: obj.canUseWorktrees === true,
    ...(worktreeUnavailableReason !== undefined ? { worktreeUnavailableReason } : {}),
  };
}

function parseDefinition(raw: unknown, fallbackProjectId: string): AutomationDefinition | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const id = trimmedText(obj.id);
  const name = trimmedText(obj.name);
  const agentId = trimmedText(obj.agentId);
  const schedule = parseSchedule(obj.schedule);
  if (id === null || name === null || agentId === null || schedule === null) return null;
  const projectIds = Array.isArray(obj.projectIds)
    ? obj.projectIds.map(trimmedText).filter((value): value is string => value !== null)
    : [];
  const resolvedProjectIds = projectIds.length > 0 ? projectIds : fallbackProjectId.length > 0 ? [fallbackProjectId] : [];
  const model = trimmedText(obj.model) ?? undefined;
  const effort = trimmedText(obj.effort) ?? undefined;
  const ownerBotId = trimmedText(obj.ownerBotId) ?? undefined;
  return {
    id,
    name,
    prompt: typeof obj.prompt === 'string' ? obj.prompt : '',
    agentId,
    enabled: obj.enabled === true,
    nextRunAt: trimmedText(obj.nextRunAt),
    createdAt: trimmedText(obj.createdAt),
    updatedAt: trimmedText(obj.updatedAt),
    projectIds: resolvedProjectIds,
    schedule,
    executionMode: parseExecutionMode(obj.executionMode),
    ...(model !== undefined ? { model } : {}),
    ...(effort !== undefined ? { effort } : {}),
    ...(ownerBotId !== undefined ? { ownerBotId } : {}),
  };
}

function parseRunWorktree(raw: unknown): AutomationRunWorktree | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const path = trimmedText(obj.path) ?? '';
  const branch = trimmedText(obj.branch) ?? '';
  if (path.length === 0 && branch.length === 0) return null;
  return { branch, path };
}

function parseRun(raw: unknown, fallbackProjectId: string): AutomationRun | null {
  const obj = asRecord(raw);
  if (obj === null) return null;
  const id = trimmedText(obj.id);
  const automationId = trimmedText(obj.automationId);
  const status = trimmedText(obj.status);
  if (id === null || automationId === null || status === null) return null;
  return {
    id,
    automationId,
    projectId: trimmedText(obj.projectId) ?? fallbackProjectId,
    status,
    sessionId: trimmedText(obj.sessionId),
    errorMessage: trimmedText(obj.errorMessage),
    findingsSummary: trimmedText(obj.findingsSummary),
    isArchived: obj.isArchived === true,
    isUnread: obj.isUnread === true,
    createdAt: trimmedText(obj.createdAt) ?? '',
    completedAt: trimmedText(obj.completedAt),
    worktree: parseRunWorktree(obj.worktree),
  };
}

export function runSortTime(run: AutomationRun): number {
  const ms = Date.parse(run.completedAt ?? run.createdAt);
  return Number.isFinite(ms) ? ms : 0;
}

export function compareRunsNewestFirst(left: AutomationRun, right: AutomationRun): number {
  const diff = runSortTime(right) - runSortTime(left);
  return diff !== 0 ? diff : left.id.localeCompare(right.id);
}

/** Parses an `automationState` object from gxserver, dropping malformed items individually. */
export function parseAutomationState(raw: unknown): AutomationState {
  const obj = asRecord(raw) ?? {};
  const projectId = trimmedText(obj.projectId) ?? '';
  const agents = Array.isArray(obj.agents)
    ? obj.agents.map(parseAgent).filter((entry): entry is AutomationAgentOption => entry !== null)
    : [];
  const automations = Array.isArray(obj.automations)
    ? obj.automations
        .map((entry) => parseDefinition(entry, projectId))
        .filter((entry): entry is AutomationDefinition => entry !== null)
    : [];
  const projects = Array.isArray(obj.projects)
    ? obj.projects.map(parseTargetProject).filter((entry): entry is AutomationTargetProject => entry !== null)
    : [];
  const runs = Array.isArray(obj.runs)
    ? obj.runs
        .map((entry) => parseRun(entry, projectId))
        .filter((entry): entry is AutomationRun => entry !== null)
        .sort(compareRunsNewestFirst)
    : [];
  return {
    agents,
    automations,
    defaultAgentId: trimmedText(obj.defaultAgentId),
    projectCanUseWorktrees: obj.projectCanUseWorktrees === true,
    projectId,
    projectName: trimmedText(obj.projectName) ?? '',
    projectPath: trimmedText(obj.projectPath) ?? '',
    projects,
    runs,
    worktreeUnavailableReason: trimmedText(obj.worktreeUnavailableReason),
  };
}

export const EMPTY_AUTOMATION_STATE: AutomationState = {
  agents: [],
  automations: [],
  defaultAgentId: null,
  projectCanUseWorktrees: false,
  projectId: '',
  projectName: '',
  projectPath: '',
  projects: [],
  runs: [],
  worktreeUnavailableReason: null,
};

/** Merges per-project states from one computer into a single "All projects" state. */
export function mergeAutomationStates(
  states: readonly AutomationState[],
  fallbackProjects: readonly AutomationTargetProject[] = [],
): AutomationState {
  const agentsById = new Map<string, AutomationAgentOption>();
  const automationsById = new Map<string, AutomationDefinition>();
  const runsById = new Map<string, AutomationRun>();
  const projectsById = new Map<string, AutomationTargetProject>();

  for (const project of fallbackProjects) {
    projectsById.set(project.projectId, project);
  }
  for (const state of states) {
    for (const agent of state.agents) {
      if (!agentsById.has(agent.agentId)) agentsById.set(agent.agentId, agent);
    }
    for (const project of state.projects) {
      projectsById.set(project.projectId, project);
    }
    if (state.projectId.length > 0 && !projectsById.has(state.projectId)) {
      projectsById.set(state.projectId, {
        projectId: state.projectId,
        label: state.projectName || state.projectId,
        path: state.projectPath,
        canUseWorktrees: state.projectCanUseWorktrees,
        ...(state.worktreeUnavailableReason !== null ? { worktreeUnavailableReason: state.worktreeUnavailableReason } : {}),
      });
    }
    for (const automation of state.automations) {
      automationsById.set(automation.id, automation);
    }
    for (const run of state.runs) {
      runsById.set(run.id, run);
    }
  }

  const automations = [...automationsById.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    const leftNext = left.nextRunAt !== null ? Date.parse(left.nextRunAt) : Number.POSITIVE_INFINITY;
    const rightNext = right.nextRunAt !== null ? Date.parse(right.nextRunAt) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(leftNext) && Number.isFinite(rightNext) && leftNext !== rightNext) {
      return leftNext - rightNext;
    }
    return left.name.localeCompare(right.name);
  });

  const runs = [...runsById.values()].sort(compareRunsNewestFirst);
  const first = states[0];

  return {
    agents: [...agentsById.values()],
    automations,
    defaultAgentId: first?.defaultAgentId ?? null,
    projectCanUseWorktrees: false,
    projectId: '',
    projectName: 'All projects',
    projectPath: '',
    projects: [...projectsById.values()],
    runs,
    worktreeUnavailableReason: null,
  };
}

/** Replaces one project's automations and runs inside a merged "All projects" state after a mutation. */
export function replaceProjectSlice(merged: AutomationState, nextProjectState: AutomationState): AutomationState {
  const pid = nextProjectState.projectId;
  if (pid.length === 0) return merged;
  const keptAutomations = merged.automations.filter((entry) => automationProjectId(entry) !== pid);
  const keptRuns = merged.runs.filter((run) => run.projectId !== pid);
  const mergedProjects = new Map(merged.projects.map((project) => [project.projectId, project]));
  for (const project of nextProjectState.projects) {
    mergedProjects.set(project.projectId, project);
  }
  const mergedAgents = new Map(merged.agents.map((agent) => [agent.agentId, agent]));
  for (const agent of nextProjectState.agents) {
    if (!mergedAgents.has(agent.agentId)) mergedAgents.set(agent.agentId, agent);
  }
  const automations = [...keptAutomations, ...nextProjectState.automations].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    const leftNext = left.nextRunAt !== null ? Date.parse(left.nextRunAt) : Number.POSITIVE_INFINITY;
    const rightNext = right.nextRunAt !== null ? Date.parse(right.nextRunAt) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(leftNext) && Number.isFinite(rightNext) && leftNext !== rightNext) {
      return leftNext - rightNext;
    }
    return left.name.localeCompare(right.name);
  });
  const runs = [...keptRuns, ...nextProjectState.runs].sort(compareRunsNewestFirst);
  return {
    ...merged,
    agents: [...mergedAgents.values()],
    projects: [...mergedProjects.values()],
    automations,
    runs,
  };
}

export function automationProjectId(automation: AutomationDefinition): string {
  return automation.projectIds[0] ?? '';
}

export function isRunActive(run: AutomationRun): boolean {
  return run.status === 'queued' || run.status === 'running';
}

export function runSummary(run: AutomationRun): string {
  if (run.findingsSummary !== null && run.findingsSummary.length > 0) return run.findingsSummary;
  if (run.errorMessage !== null && run.errorMessage.length > 0) return run.errorMessage;
  return 'Run is waiting for agent output.';
}

export function visibleRuns(state: AutomationState): AutomationRun[] {
  return state.runs.filter((run) => !run.isArchived);
}

function triageActionable(run: AutomationRun): boolean {
  return run.isUnread || run.status === 'findings' || run.status === 'needs_attention' || run.status === 'failed';
}

function triageWeight(run: AutomationRun): number {
  if (run.status === 'needs_attention' || run.status === 'failed') return 3;
  if (run.status === 'findings') return 2;
  return 1;
}

/** Exact port of desktop `AutomationState::triage_runs()`. */
export function triageRuns(state: AutomationState): AutomationRun[] {
  const visible = visibleRuns(state);
  const recentCompletedIds = new Set(
    visible
      .filter((run) => run.completedAt !== null && !isRunActive(run))
      .slice(0, TRIAGE_RECENT_COMPLETED_LIMIT)
      .map((run) => run.id),
  );
  return visible
    .filter((run) => triageActionable(run) || recentCompletedIds.has(run.id))
    .sort((left, right) => {
      if (left.isUnread !== right.isUnread) return right.isUnread ? 1 : -1;
      const weightDiff = triageWeight(right) - triageWeight(left);
      if (weightDiff !== 0) return weightDiff;
      return compareRunsNewestFirst(left, right);
    });
}

export function latestRunForAutomation(runs: readonly AutomationRun[], automationId: string): AutomationRun | null {
  for (const run of runs) {
    if (run.automationId === automationId) return run;
  }
  return null;
}

export function unreadCountForAutomation(runs: readonly AutomationRun[], automationId: string): number {
  let count = 0;
  for (const run of runs) {
    if (run.automationId === automationId && run.isUnread && !run.isArchived) count += 1;
  }
  return count;
}

export function attentionCount(state: AutomationState): number {
  let count = 0;
  for (const run of state.runs) {
    if (!run.isArchived && (run.isUnread || run.status === 'needs_attention' || run.status === 'failed')) {
      count += 1;
    }
  }
  return count;
}

function isWeekdays(days: readonly number[]): boolean {
  return days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Turns common 5-field cron expressions into plain English (e.g. `"0 * * * 0"` -> `"Hourly on Sundays"`),
 * falling back to the raw cron expression for complex schedules.
 */
function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/u);
  if (parts.length !== 5) return expression;
  const [minPart, hourPart, domPart, monPart, dowPart] = parts;
  if (domPart !== '*' || monPart !== '*') return expression;

  const parseDowList = (raw: string): number[] | null => {
    if (raw === '*') return [];
    const out: number[] = [];
    for (const token of raw.split(',')) {
      const range = /^([0-7])-([0-7])$/u.exec(token);
      if (range !== null) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end) return null;
        for (let d = start; d <= end; d += 1) out.push(d % 7);
        continue;
      }
      if (/^[0-7]$/u.test(token)) {
        out.push(Number(token) % 7);
        continue;
      }
      return null;
    }
    return [...new Set(out)].sort((a, b) => a - b);
  };

  const days = parseDowList(dowPart);
  if (days === null) return expression;

  const daySuffix = (): string => {
    if (days.length === 0 || days.length === 7) return '';
    if (isWeekdays(days)) return ' on weekdays';
    if (days.length === 2 && days[0] === 0 && days[1] === 6) return ' on weekends';
    if (days.length === 1) return ` on ${WEEKDAYS_PLURAL[days[0]]}`;
    return ` on ${days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')}`;
  };

  // Every N minutes: */N * * * *
  const minStep = /^\*\/(\d+)$/u.exec(minPart);
  if (minStep !== null && hourPart === '*') {
    const step = Number(minStep[1]);
    if (step > 0 && step < 60) {
      return `Every ${step} minute${step === 1 ? '' : 's'}${daySuffix()}`;
    }
  }

  // Hourly or every N hours at minute M: M * * * * or M */N * * *
  if (/^\d+$/u.test(minPart)) {
    const minute = Number(minPart);
    if (minute >= 0 && minute <= 59) {
      if (hourPart === '*') {
        const base = minute === 0 ? 'Hourly' : `Hourly at :${pad2(minute)}`;
        return `${base}${daySuffix()}`;
      }
      const hourStep = /^\*\/(\d+)$/u.exec(hourPart);
      if (hourStep !== null) {
        const step = Number(hourStep[1]);
        if (step > 0 && step < 24) {
          const base = step === 1 ? 'Hourly' : `Every ${step} hours`;
          return `${base}${daySuffix()}`;
        }
      }
      if (/^\d+$/u.test(hourPart)) {
        const hour = Number(hourPart);
        if (hour >= 0 && hour <= 23) {
          const time = `${pad2(hour)}:${pad2(minute)}`;
          if (days.length === 0 || days.length === 7) return `Daily at ${time}`;
          if (isWeekdays(days)) return `Weekdays at ${time}`;
          if (days.length === 1) return `${WEEKDAYS_PLURAL[days[0]]} at ${time}`;
          return `${days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')} at ${time}`;
        }
      }
    }
  }

  return expression;
}

/** Plain-English schedule description, matching desktop `describe_schedule` plus friendly cron wording. */
export function describeSchedule(schedule: AutomationSchedule): string {
  switch (schedule.kind) {
    case 'once': {
      const ms = Date.parse(schedule.runAt);
      if (!Number.isFinite(ms)) return 'Once';
      return `Once on ${formatFullTimestamp(schedule.runAt)}`;
    }
    case 'interval': {
      const preset = INTERVAL_PRESETS.find((entry) => entry.ms === schedule.everyMs);
      if (preset !== undefined) return preset.label;
      const hourMs = 3_600_000;
      if (schedule.everyMs % hourMs === 0) {
        const hours = schedule.everyMs / hourMs;
        return hours === 1 ? 'Hourly' : `Every ${hours} hours`;
      }
      const minutes = Math.max(1, Math.round(schedule.everyMs / 60_000));
      return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
    }
    case 'daily':
      return `Daily at ${schedule.time}`;
    case 'weekly':
      if (isWeekdays(schedule.days)) return `Weekdays at ${schedule.time}`;
      if (schedule.days.length === 1) {
        return `Weekly ${WEEKDAYS[schedule.days[0]] ?? 'day'} at ${schedule.time}`;
      }
      if (schedule.days.length > 1) {
        const labels = schedule.days.map((d) => WEEKDAYS[d]?.slice(0, 3) ?? String(d)).join(', ');
        return `${labels} at ${schedule.time}`;
      }
      return `Weekly at ${schedule.time}`;
    case 'cron':
      return describeCron(schedule.expression);
  }
}

export function describeMode(mode: AutomationExecutionMode): string {
  switch (mode.kind) {
    case 'worktree':
      return 'Worktree';
    case 'thread':
      return 'Thread';
    case 'local':
      return 'Local checkout';
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case 'no_findings':
      return 'No findings';
    case 'needs_attention':
      return 'Needs attention';
    case 'findings':
      return 'Findings';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'queued':
      return 'Queued';
    case 'skipped':
      return 'Skipped';
    default: {
      const label = status.replace(/_/gu, ' ');
      return label.length === 0 ? 'Unknown' : label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
}

export function runStatusTone(status: string): RunStatusTone {
  switch (status) {
    case 'failed':
      return 'danger';
    case 'needs_attention':
      return 'warning';
    case 'findings':
    case 'running':
    case 'queued':
      return 'accent';
    case 'no_findings':
      return 'success';
    default:
      return 'muted';
  }
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatNextRun(iso: string | null, nowMs: number): string {
  if (iso === null) return 'Not scheduled';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Not scheduled';
  const diffMs = ms - nowMs;
  if (diffMs <= 0) return 'Due now';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)}m`;
  const target = new Date(ms);
  const now = new Date(nowMs);
  if (sameLocalDay(target, now)) return `Today ${formatClock(target)}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameLocalDay(target, tomorrow)) return `Tomorrow ${formatClock(target)}`;
  return `${MONTHS[target.getMonth()]} ${target.getDate()}, ${formatClock(target)}`;
}

export function formatRelativeOrDate(iso: string | null, nowMs: number): string {
  if (iso === null || iso.length === 0) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.floor((nowMs - ms) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  const date = new Date(ms);
  const now = new Date(nowMs);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return 'Yesterday';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatFullTimestamp(iso: string | null): string {
  if (iso === null || iso.length === 0) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const date = new Date(ms);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${formatClock(date)}`;
}
