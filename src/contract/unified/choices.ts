/**
 * Where a new session starts: the projects the agent menu and the new chat's tray offer, the
 * machine each starts on, the project New session aims at, and the filter after it starts.
 *
 * A port of packages/gx-core/src/unified_sidebar/choices.rs, held to it by `unifiedFixture.json`.
 * The user's decisions behind these rules (Q1163 to Q1187) are recorded there.
 */

import type { UnifiedFilter, UnifiedProjectInput } from './build';
import { repoIdentity } from './repo';

export type UnifiedChoiceMachineInput = {
  machine: string;
  label: string;
  /** A session can start there now; one that isn't keeps its chip, dimmed. */
  connected: boolean;
  projects: (Pick<UnifiedProjectInput, 'projectId' | 'title' | 'path' | 'gitRemoteOriginUrl' | 'worktreeParentPath'> & {
    /** The project has an open session on this machine. */
    hasSessions?: boolean;
  })[];
};

export type UnifiedChoiceMachine = {
  machineId: string;
  label: string;
  connected: boolean;
  projectId: string;
};

export type UnifiedProjectChoice = {
  repoKey: string;
  label: string;
  machines: UnifiedChoiceMachine[];
  /** Which machine the row starts on (`defaultMachine`). */
  selected: number;
  /** One of its machines has an open session; the list says "No sessions" otherwise. */
  hasSessions: boolean;
  /** One of the last projects a session was started in, listed first under Recent. */
  recent: boolean;
};

/** Where a new session starts: a project of a repository on one machine. */
export type UnifiedNewSessionTarget = { repoKey: string; machineId: string; projectId: string };

/** The project you have open, on its machine, with its repository; it can be a worktree. */
export type ActiveProject = { repoKey: string; machineId: string; projectId: string };

function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The machine a project starts on: the last one used for it, else the one you are on, else this
 * computer, else its first connected machine, skipping a machine that isn't connected.
 */
export function defaultMachine(
  choice: Pick<UnifiedProjectChoice, 'repoKey' | 'machines'>,
  lastMachines: Readonly<Record<string, string>>,
  currentMachine: string,
  localMachine = 'local',
): number {
  const connectedChip = (machineId: string | undefined) =>
    choice.machines.findIndex((chip) => chip.machineId === machineId && chip.connected);
  for (const candidate of [lastMachines[choice.repoKey], currentMachine, localMachine]) {
    const chip = connectedChip(candidate);
    if (chip >= 0) return chip;
  }
  const first = choice.machines.findIndex((chip) => chip.connected);
  return first >= 0 ? first : 0;
}

/**
 * One row per repository, its machines behind it: recent projects first in the order they were
 * last used, then the rest A to Z, projects with no open session included. Each machine points at
 * its main checkout; a worktree stands in only when the machine has nothing else of the repository.
 */
export function unifiedProjectChoices(
  machines: readonly UnifiedChoiceMachineInput[],
  lastMachines: Readonly<Record<string, string>>,
  recentRepos: readonly string[],
  currentMachine: string,
  localMachine = 'local',
): UnifiedProjectChoice[] {
  const byRepo = new Map<string, UnifiedProjectChoice>();
  for (const machine of machines) {
    const picks = new Map<string, { project: UnifiedChoiceMachineInput['projects'][number]; label: string }>();
    const withSessions = new Set<string>();
    for (const project of machine.projects) {
      const repo = repoIdentity(project.gitRemoteOriginUrl, project.path, project.worktreeParentPath, project.title);
      if (project.hasSessions === true) withSessions.add(repo.key);
      const pick = picks.get(repo.key);
      if (pick === undefined || (pick.project.worktreeParentPath !== null && project.worktreeParentPath === null)) {
        picks.set(repo.key, { project, label: pick?.label ?? repo.label });
      }
    }
    for (const repoKey of [...picks.keys()].sort(byCodePoint)) {
      const { project, label } = picks.get(repoKey)!;
      let choice = byRepo.get(repoKey);
      if (choice === undefined) {
        choice = { repoKey, label, machines: [], selected: 0, hasSessions: false, recent: false };
        byRepo.set(repoKey, choice);
      }
      choice.hasSessions ||= withSessions.has(repoKey);
      choice.machines.push({
        machineId: machine.machine,
        label: machine.label,
        connected: machine.connected,
        projectId: project.projectId,
      });
    }
  }
  const choices = [...byRepo.values()];
  for (const choice of choices) {
    choice.selected = defaultMachine(choice, lastMachines, currentMachine, localMachine);
    choice.recent = recentRepos.includes(choice.repoKey);
  }
  const rank = (choice: UnifiedProjectChoice) => {
    const index = recentRepos.indexOf(choice.repoKey);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return choices.sort(
    (left, right) =>
      rank(left) - rank(right) ||
      byCodePoint(left.label.toLowerCase(), right.label.toLowerCase()) ||
      byCodePoint(left.repoKey, right.repoKey),
  );
}

/** The rows whose name, or a machine's name, holds every typed word. */
export function filterProjectChoices(choices: readonly UnifiedProjectChoice[], query: string): UnifiedProjectChoice[] {
  const words = query.toLowerCase().split(/\s+/u).filter((word) => word.length > 0);
  return choices.filter((choice) => {
    const haystack = [choice.label, ...choice.machines.map((machine) => machine.label)].join('\n').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The next connected machine in `forward`'s direction, stopping at the ends. */
export function moveProjectChoiceMachine(choice: UnifiedProjectChoice, forward: boolean): number {
  if (forward) {
    for (let index = choice.selected + 1; index < choice.machines.length; index += 1) {
      if (choice.machines[index]!.connected) return index;
    }
  } else {
    for (let index = choice.selected - 1; index >= 0; index -= 1) {
      if (choice.machines[index]!.connected) return index;
    }
  }
  return choice.selected;
}

/**
 * Where the agent menu starts: the filtered repository when the filter is exactly one (on the
 * machine you have open when that project is yours), else the project you have open, else the
 * list's first project.
 */
export function unifiedNewSessionTarget(
  filter: Pick<UnifiedFilter, 'repos'>,
  choices: readonly UnifiedProjectChoice[],
  active: ActiveProject | null,
): UnifiedNewSessionTarget | null {
  const targetOf = (choice: UnifiedProjectChoice): UnifiedNewSessionTarget | null => {
    const machine = choice.machines[choice.selected];
    return machine === undefined
      ? null
      : { repoKey: choice.repoKey, machineId: machine.machineId, projectId: machine.projectId };
  };
  let here: UnifiedNewSessionTarget | null = null;
  if (active !== null) {
    const choice = choices.find((entry) => entry.repoKey === active.repoKey);
    if (choice !== undefined && choice.machines.some((machine) => machine.machineId === active.machineId)) {
      here = { repoKey: active.repoKey, machineId: active.machineId, projectId: active.projectId };
    }
  }
  if (filter.repos.length === 1) {
    const choice = choices.find((entry) => entry.repoKey === filter.repos[0]);
    if (choice !== undefined) {
      if (here !== null && here.repoKey === choice.repoKey) return here;
      return targetOf(choice);
    }
  }
  if (here !== null) return here;
  const first = choices[0];
  return first === undefined ? null : targetOf(first);
}

/**
 * The filter once a session has started in `repoKey` on `machineId` (in `spaceKey`): every kind of
 * pick that would hide it gains it, and a kind with no pick stays empty. The text search stays.
 */
export function widenFilterForNewSession(
  filter: UnifiedFilter,
  repoKey: string,
  machineId: string,
  spaceKey: string | null,
): UnifiedFilter {
  const add = (picks: readonly string[], value: string) =>
    picks.length === 0 || picks.includes(value) ? [...picks] : [...picks, value].sort(byCodePoint);
  return {
    repos: add(filter.repos, repoKey),
    machines: add(filter.machines, machineId),
    spaces: spaceKey === null ? [...filter.spaces] : add(filter.spaces, spaceKey),
    query: filter.query,
  };
}

/** Whether `widenFilterForNewSession` changes anything. */
export function filterHides(filter: UnifiedFilter, widened: UnifiedFilter): boolean {
  return (
    widened.repos.length !== filter.repos.length ||
    widened.machines.length !== filter.machines.length ||
    widened.spaces.length !== filter.spaces.length
  );
}
