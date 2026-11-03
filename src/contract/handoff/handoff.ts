/**
 * Handoff's rules on the phone: the new message box's text, where a handoff can go, and what the
 * sheet remembers.
 *
 * A port of packages/gx-core/src/session_handoff.rs, handoff_target.rs and handoff_prefs.rs (gx-core runs on neither
 * the phone nor its WebAssembly chat core), held to them by `handoffFixture.json`, which
 * packages/gx-core/src/handoff_fixture_tests.rs writes from the Rust functions.
 *
 * CDXC:TranscriptExport 2026-10-31 DECISION:
 * User: the phone gets the desktop's lead-in and its Handoff / Export, with the same words. Q863: the box holds a lead-in naming the session and project, the document's link, a blank line, and the caret two lines below the link. "allow either handing off in the current project and current machine and all that (default) or handing off to another machine/another project": the session's own computer comes first, starting on this project, then every other connected computer. Q862: the button names where the session goes. "we should remember what the user picked last time": see `parseHandoffPrefs`.
 */

/** `You are continuing from "<session>" in <project>.` */
export function handoffLeadIn(sessionTitle: string, projectTitle: string): string {
  const session = oneLine(sessionTitle);
  const project = oneLine(projectTitle);
  if (session.length > 0 && project.length > 0) return `You are continuing from "${session}" in ${project}.`;
  if (session.length > 0) return `You are continuing from "${session}".`;
  if (project.length > 0) return `You are continuing from a session in ${project}.`;
  return 'You are continuing from another session.';
}

/**
 * What a handoff's new message box holds: the lead-in, the document's link, and the two line breaks
 * that leave the caret two lines below it. Never sent for the user.
 */
export function handoffDraft(path: string, sessionTitle: string, projectTitle: string): string {
  const label = oneLine(`${sessionTitle} Handoff`).replace(/[\\[\]]/g, '\\$&');
  const destination = /[\s<>]/.test(path) ? `<${path.replace(/[\\<>]/g, '\\$&')}>` : path.replace(/[\\()]/g, '\\$&');
  return `${handoffLeadIn(sessionTitle, projectTitle)}\n\n[${label}](${destination})\n\n`;
}

/**
 * The draft for a computer that types a staged draft raw (see `computerStagesLineBreaks`): one line,
 * so no line break can act as the Return key.
 */
export function singleLineHandoffDraft(draft: string): string {
  return draft.replace(/\n+/g, ' ');
}

/**
 * Whether this Ghostex version on a computer stages a multi-line draft as one paste. Up to 10.41.0
 * gxserver wrote it raw, and a bare line break there is the Return key: it would send the message,
 * or answer a startup prompt. An unknown version counts as too old.
 */
export function computerStagesLineBreaks(version: string | null): boolean {
  const parts = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  if (parts === null) return false;
  const [major, minor, patch] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  return major !== 10 ? major > 10 : minor !== 41 ? minor > 41 : patch > 0;
}

function oneLine(text: string): string {
  return text.trim().split(/\s+/u).filter((word) => word.length > 0).join(' ');
}

/** A git remote URL reduced to `host/owner/repo`, lowercased, so its forms compare equal. */
export function repositoryKey(url: string): string | null {
  let rest = url.trim();
  if (rest.length === 0) return null;
  const scheme = rest.indexOf('://');
  if (scheme >= 0) {
    rest = rest.slice(scheme + 3);
  } else {
    const colon = rest.indexOf(':');
    if (colon >= 0 && !rest.slice(0, colon).includes('/')) {
      // scp form: `git@github.com:owner/repo.git`.
      return normalizeHostAndPath(afterLastAt(rest.slice(0, colon)), rest.slice(colon + 1));
    }
  }
  const slash = rest.indexOf('/');
  const authority = slash >= 0 ? rest.slice(0, slash) : rest;
  const path = slash >= 0 ? rest.slice(slash + 1) : '';
  // `ssh://git@host:22/owner/repo`: the port is not part of the repository.
  return normalizeHostAndPath(afterLastAt(authority).split(':')[0] ?? '', path);
}

function afterLastAt(authority: string): string {
  return authority.slice(authority.lastIndexOf('@') + 1);
}

function normalizeHostAndPath(rawHost: string, rawPath: string): string | null {
  const host = rawHost.trim().replace(/^(?:www\.)+/, '').toLowerCase();
  const trimmed = rawPath.trim().replace(/^\/+|\/+$/g, '');
  const path = (trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed).replace(/^\/+|\/+$/g, '');
  return host.length === 0 || path.length === 0 ? null : `${host}/${path.toLowerCase()}`;
}

/** The repository's own name (`ghostex` for `git@github.com:maddada/ghostex.git`). */
export function repositoryDisplayName(url: string): string | null {
  const key = repositoryKey(url);
  const name = key?.split('/').pop() ?? '';
  return name.length > 0 ? name : null;
}

function folderName(path: string): string | null {
  const name = path.trim().replace(/[/\\]+$/, '').split(/[/\\]/).pop()?.trim() ?? '';
  return name.length > 0 ? name.toLowerCase() : null;
}

export type HandoffProjectCandidate = {
  projectId: string;
  title: string;
  path: string | null;
  originUrl: string | null;
  isWorktree: boolean;
};

export type HandoffProjectChoice = {
  projectId: string;
  title: string;
  path: string | null;
  sameRepo: boolean;
  /** The project the session is in: this project, here. */
  isOwn: boolean;
};

export type HandoffComputerRanking = {
  choices: HandoffProjectChoice[];
  preferredProjectId: string | null;
  missingRepository: string | null;
};

/**
 * Ranks a computer's projects for a session: the same repository first (a project's main checkout
 * before its worktrees), then the rest as given. `ownProject` is the session's project when this is
 * the session's own computer: it comes first and is what the row starts on, and that computer never
 * lacks the repository.
 */
export function rankHandoffComputer(
  originUrl: string | null,
  sourcePath: string | null,
  candidates: readonly HandoffProjectCandidate[],
  ownProject: string | null,
): HandoffComputerRanking {
  const sourceKey = originUrl === null ? null : repositoryKey(originUrl);
  const sourceFolder = sourcePath === null ? null : folderName(sourcePath);
  const sameRepo = (candidate: HandoffProjectCandidate): boolean =>
    sourceKey !== null
      ? candidate.originUrl !== null && repositoryKey(candidate.originUrl) === sourceKey
      : sourceFolder !== null && candidate.path !== null && folderName(candidate.path) === sourceFolder;
  const choices: HandoffProjectChoice[] = candidates
    .map((candidate, index) => {
      const matched = sameRepo(candidate);
      return {
        rank: matched ? (candidate.isWorktree ? 1 : 0) : 2,
        index,
        choice: {
          projectId: candidate.projectId,
          title: candidate.title,
          path: candidate.path,
          sameRepo: matched,
          isOwn: false,
        },
      };
    })
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((row) => row.choice);
  let preferredProjectId = choices[0]?.sameRepo === true ? choices[0].projectId : null;
  const missingRepository =
    preferredProjectId === null && ownProject === null && originUrl !== null ? repositoryDisplayName(originUrl) : null;
  const ownIndex = ownProject === null ? -1 : choices.findIndex((choice) => choice.projectId === ownProject);
  if (ownIndex >= 0) {
    const [own] = choices.splice(ownIndex, 1);
    choices.unshift({ ...own!, isOwn: true });
    preferredProjectId = own!.projectId;
  }
  return { choices, preferredProjectId, missingRepository };
}

/** The button of a handoff going somewhere else: where it goes, with the computer when it leaves its own. */
export function handoffDestinationLabel(projectTitle: string, computerLabel: string, isSource: boolean): string {
  return isSource ? `Handoff to ${projectTitle}` : `Handoff to ${projectTitle} on ${computerLabel}`;
}

/** A Project row: the title, its mark, and the folder. */
export function handoffProjectLabel(title: string, isOwn: boolean, sameRepo: boolean, path: string | null): string {
  const mark = isOwn ? ' (this project)' : sameRepo ? ' (same repo)' : '';
  return `${title}${mark}${path !== null && path.length > 0 ? ` · ${path}` : ''}`;
}

/** The first line of the branch notice, or null when there is nothing to warn about. */
export function branchDifferenceLine(
  sourceBranch: string | null,
  targetBranch: string | null,
  targetLabel: string,
): string | null {
  const source = sourceBranch?.trim() ?? '';
  const target = targetBranch?.trim() ?? '';
  if (source.length === 0 || target.length === 0 || source === target) return null;
  return `This session is on ${source}; the project on ${targetLabel} is on ${target}.`;
}

/** A computer as the phone knows it, for {@link handoffComputers}. */
export type HandoffMachineInput = {
  machineId: string;
  label: string;
  connected: boolean;
  projects: readonly HandoffProjectCandidate[];
};

export type HandoffComputer = HandoffComputerRanking & {
  machineId: string;
  label: string;
  /** The computer the session runs on: its transcript is already there. */
  isSource: boolean;
};

/**
 * The computers a handoff can go to: the session's own first, starting on this project, then every
 * other connected one, each with its projects ranked for this session.
 */
export function handoffComputers(
  machines: readonly HandoffMachineInput[],
  source: { machineId: string; projectId: string },
): HandoffComputer[] {
  const sourceProject =
    machines
      .find((machine) => machine.machineId === source.machineId)
      ?.projects.find((project) => project.projectId === source.projectId) ?? null;
  const computers: HandoffComputer[] = [];
  for (const machine of machines) {
    const isSource = machine.machineId === source.machineId;
    if (!isSource && !machine.connected) continue;
    const ranking = rankHandoffComputer(
      sourceProject?.originUrl ?? null,
      sourceProject?.path ?? null,
      machine.projects.filter((project) => (project.path ?? '').trim().length > 0),
      isSource ? source.projectId : null,
    );
    computers.push({ ...ranking, machineId: machine.machineId, label: machine.label, isSource });
  }
  return computers.sort((left, right) => Number(right.isSource) - Number(left.isSource));
}

/** The computer the choices point at: the pick while it is still offered, else the first. */
export function handoffComputer(
  computers: readonly HandoffComputer[],
  selectedMachineId: string | null,
): HandoffComputer | null {
  return computers.find((computer) => computer.machineId === selectedMachineId) ?? computers[0] ?? null;
}

/** The project on that computer: the pick when it is one of its projects, else the one with the repository. */
export function handoffProject(computer: HandoffComputer, selectedProjectId: string | null): HandoffProjectChoice | null {
  const find = (id: string | null) => computer.choices.find((choice) => choice.projectId === id) ?? null;
  return find(selectedProjectId) ?? find(computer.preferredProjectId);
}

/** Whether the destination is somewhere other than this project here. */
export function handoffIsElsewhere(computer: HandoffComputer, project: HandoffProjectChoice): boolean {
  return !(computer.isSource && project.isOwn);
}

export const DESTINATION_HERE = 'This project, same computer';
export const DESTINATION_PICK_PROJECT = 'Pick a project';

/** The destination row's words: always where the session goes. */
export function handoffDestinationSummary(
  open: boolean,
  computer: HandoffComputer | null,
  project: HandoffProjectChoice | null,
): string {
  if (!open) return DESTINATION_HERE;
  if (computer === null || project === null) return DESTINATION_PICK_PROJECT;
  if (!handoffIsElsewhere(computer, project)) return DESTINATION_HERE;
  return computer.isSource ? `${project.title}, same computer` : `${project.title} on ${computer.label}`;
}

/** Another repository on the session's own computer has no branch to compare with. */
export function handoffBranchNoticeApplies(computer: HandoffComputer, project: HandoffProjectChoice): boolean {
  return !computer.isSource || project.sameRepo;
}

export type HandoffCard = 'agent' | 'markdown';

/** What the file holds beyond its messages. All off until the user changes them. */
export type HandoffInclude = { commands: boolean; patches: boolean; reasoning: boolean };

export type HandoffDestination = { machineId: string; projectId: string };

/**
 * How much of the conversation the file holds: the "Whole conversation" switch, and while it is off
 * the slider's last 1 to 100 turns (handoff_prefs.rs, CDXC:TranscriptExport 2026-11-03).
 */
export type HandoffHistory = { all: boolean; turns: number };

/** The slider's stops. */
export const HANDOFF_HISTORY_STOPS: readonly number[] = [1, 2, 3, 5, 10, 20, 50, 100];
export const HANDOFF_HISTORY_DEFAULT_TURNS = 20;

/** The stop nearest `turns`, the lower one on a tie. */
export function handoffHistoryStop(turns: number): number {
  let nearest = HANDOFF_HISTORY_STOPS[0] ?? HANDOFF_HISTORY_DEFAULT_TURNS;
  for (const stop of HANDOFF_HISTORY_STOPS) {
    if (Math.abs(stop - turns) < Math.abs(nearest - turns)) nearest = stop;
  }
  return nearest;
}

/** The stop's index on the slider. */
export function handoffHistoryStopIndex(turns: number): number {
  return Math.max(0, HANDOFF_HISTORY_STOPS.indexOf(handoffHistoryStop(turns)));
}

/** The computer's `--last-turns`: null for the whole conversation. */
export function handoffLastTurns(history: HandoffHistory): number | null {
  return history.all ? null : history.turns;
}

/** The slider's value and the Include heading's first half: "Last 20 turns", "Last turn", "Whole conversation". */
export function handoffHistoryLabel(history: HandoffHistory): string {
  if (history.all) return 'Whole conversation';
  return history.turns === 1 ? 'Last turn' : `Last ${history.turns} turns`;
}

/** The Include heading, e.g. "Last 10 turns · Messages only". */
export function handoffIncludeSummary(history: HandoffHistory, include: string): string {
  return `${handoffHistoryLabel(history)} · ${include}`;
}

/** About how many tokens `bytes` of the file are: "900", "9k", "1.2M". A token is about four bytes. */
export function handoffTokensText(bytes: number): string {
  const tokens = Math.ceil(bytes / 4);
  if (tokens < 1_000) return String(Math.max(10, Math.ceil(tokens / 10) * 10));
  if (tokens < 999_500) return `${Math.floor((tokens + 500) / 1_000)}k`;
  const tenths = Math.floor((tokens + 50_000) / 100_000);
  return tenths % 10 === 0 ? `${tenths / 10}M` : `${Math.floor(tenths / 10)}.${tenths % 10}M`;
}

/**
 * The slider's hint from the computer's count (`ghostex count-transcript-turns`): "10 of 120 turns ·
 * about 9k tokens (the whole is 87k)". `lastTurnsBytes[i]` is the size of the last `i + 1` turns.
 */
export function handoffHistoryEstimate(
  history: HandoffHistory,
  turns: number,
  wholeBytes: number,
  lastTurnsBytes: readonly number[],
): string {
  if (history.all || history.turns >= turns) {
    const allOfIt = turns === 1 ? 'The one turn' : `All ${turns} turns`;
    return `${allOfIt} · about ${handoffTokensText(wholeBytes)} tokens`;
  }
  const kept = lastTurnsBytes[history.turns - 1] ?? wholeBytes;
  return `${history.turns} of ${turns} turns · about ${handoffTokensText(kept)} tokens (the whole is ${handoffTokensText(wholeBytes)})`;
}

export type HandoffPrefs = {
  card: HandoffCard;
  include: HandoffInclude;
  includeOpen: boolean;
  /** The agent the user picked under Continue with; null means the session's own. */
  agentId: string | null;
  destination: HandoffDestination | null;
  /** The destination's choices open with nothing remembered to show. */
  destinationOpen: boolean;
  history: HandoffHistory;
};

const PREFS_VERSION = 2;

function savedText(value: unknown, key: string): string | null {
  const text = (value as Record<string, unknown> | null | undefined)?.[key];
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
}

/**
 * Reads a saved value, of this shape or an older one. A value from before this shape carries switches
 * the old dialog defaulted on, so they can't tell a choice from a default: everyone starts at the new
 * default. An old `handoffRemote` comes back as the agent card with its destination choices open.
 */
export function parseHandoffPrefs(value: unknown): HandoffPrefs {
  const mode = savedText(value, 'mode');
  const saved = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const card: HandoffCard = mode === 'export' ? 'markdown' : 'agent';
  const base: HandoffPrefs = {
    card,
    include: { commands: false, patches: false, reasoning: false },
    includeOpen: false,
    agentId: null,
    destination: null,
    destinationOpen: false,
    history: { all: false, turns: HANDOFF_HISTORY_DEFAULT_TURNS },
  };
  if (saved.version !== PREFS_VERSION) return { ...base, destinationOpen: mode === 'handoffRemote' };
  const machineId = savedText(saved.destination, 'machineId');
  const projectId = savedText(saved.destination, 'projectId');
  return {
    card,
    include: {
      commands: saved.includeCommands === true,
      patches: saved.includePatches === true,
      reasoning: saved.includeReasoning === true,
    },
    includeOpen: saved.includeOpen === true,
    agentId: savedText(saved, 'agentId'),
    destination: machineId !== null && projectId !== null ? { machineId, projectId } : null,
    destinationOpen: saved.destinationOpen === true,
    // Saved before the slider: its default.
    history: {
      all: saved.historyAll === true,
      turns:
        typeof saved.historyTurns === 'number' && Number.isFinite(saved.historyTurns) && saved.historyTurns >= 0
          ? handoffHistoryStop(Math.floor(saved.historyTurns))
          : HANDOFF_HISTORY_DEFAULT_TURNS,
    },
  };
}

/** The value to save, in this shape. */
export function handoffPrefsJson(prefs: HandoffPrefs): Record<string, unknown> {
  return {
    version: PREFS_VERSION,
    mode: prefs.card === 'markdown' ? 'export' : 'handoff',
    includeCommands: prefs.include.commands,
    includePatches: prefs.include.patches,
    includeReasoning: prefs.include.reasoning,
    includeOpen: prefs.includeOpen,
    destinationOpen: prefs.destinationOpen,
    historyAll: prefs.history.all,
    historyTurns: prefs.history.turns,
    ...(prefs.agentId !== null ? { agentId: prefs.agentId } : {}),
    ...(prefs.destination !== null ? { destination: prefs.destination } : {}),
  };
}

/**
 * The remembered destination this session opens on, or null for this project here: null when it is
 * the session's own project, or `offered` says that computer no longer offers that project.
 */
export function rememberedHandoffDestination(
  remembered: HandoffDestination | null,
  own: HandoffDestination,
  offered: (destination: HandoffDestination) => boolean,
): HandoffDestination | null {
  if (remembered === null) return null;
  if (remembered.machineId === own.machineId && remembered.projectId === own.projectId) return null;
  return offered(remembered) ? remembered : null;
}

/** {@link rememberedHandoffDestination} against the computers this sheet offers. */
export function openingHandoffDestination(
  remembered: HandoffDestination | null,
  computers: readonly HandoffComputer[],
): HandoffDestination | null {
  const own = computers.find((computer) => computer.isSource);
  if (own === undefined) return null;
  return rememberedHandoffDestination(
    remembered,
    { machineId: own.machineId, projectId: own.choices.find((choice) => choice.isOwn)?.projectId ?? '' },
    (destination) =>
      computers.some(
        (computer) =>
          computer.machineId === destination.machineId &&
          computer.choices.some((choice) => choice.projectId === destination.projectId),
      ),
  );
}
