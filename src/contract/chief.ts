/**
 * Chief on the phone: each computer's Ghostex-wide coordinator (server/src/chief/), the session
 * its summary flags `isChief`.
 *
 * CDXC:Chief 2026-11-08 DECISION:
 * User (Q1745, Q1747): the phone shows "same row" as the desktop, under the Spaces tabs: the
 * selected computer's Chief, with "+N" that unfolds the other paired computers' Chiefs the way a
 * coordinator's threads fold. It follows each computer's switch (`builtInFeaturesOff`).
 * SEE-ALSO: packages/gx-core/src/sidebar_view/chief.rs (the desktop's rows), components/sessions/ChiefRow.tsx.
 */

import type { GhostexSession, GhostexMobileSummary } from './mobileSummary';

/**
 * Chief's name on its row and its menus: "Chief of Staff". The one place the phone spells it, as
 * server/src/chief/mod.rs `CHIEF_TITLE` is gxserver's (CDXC:Chief 2026-11-08 there).
 */
export const CHIEF_LABEL = 'Ask Ghostex AI';
/**
 * Its name inside a sentence. CDXC:Chief 2026-11-21 DECISION (server/src/chief/mod.rs): Chief of Staff is "Ask Ghostex AI" on
 * its row and in menus, "Ghostex AI" in a sentence.
 */
export const CHIEF_NAME = 'Ghostex AI';

/**
 * The home project's name on its header and menu: "Main Hub".
 *
 * CDXC:Chief 2026-11-08 SEE-ALSO: the DECISION on `native_sidebar_home_menu` in apps/desktop/src/app/native_sidebar/
 * chief.rs. Main Hub is only the home project's header (a tap folds it); Chief of Staff is a session row pinned first
 * under it, whose long press has New Chat and Change Agent.
 */
export const HOME_LABEL = 'Main Hub';

/**
 * What Main Hub is, said where the desktop shows its hover card (apps/desktop/src/app/native_sidebar/chief_row_view.rs
 * `main_hub_tooltip_lines`): at the top of its long-press menu and its first-open picker, since a phone has no hover.
 *
 * CDXC:Chief 2026-11-08 SEE-ALSO: the Q1931 DECISION on `main_hub_tooltip_content` in that file.
 */
export const MAIN_HUB_EXPLANATION = [
  "The home for chats that don't belong to a project: quick questions, terminals and agents started in your home folder.",
  'Ghostex AI, pinned at the top, is the agent that sees and steers every Ghostex agent on this computer, and talks to Ghostex AI on your other computers.',
] as const;

/** The one dot a Chief's row draws, in the session card's order. */
export function chiefCounts(session: GhostexSession) {
  const approval = session.awaitingApproval;
  const question = !approval && (session.pendingQuestionCount > 0 || session.awaitingAnswer);
  const working = !approval && !question && session.activity === 'working';
  const attention = !approval && !question && session.activity === 'attention';
  const background = !approval && !question && !working && !attention && session.backgroundWorkDetectedAt.length > 0;
  return {
    approvalCount: approval ? 1 : 0,
    questionCount: question ? 1 : 0,
    workingCount: working ? 1 : 0,
    attentionCount: attention ? 1 : 0,
    backgroundWorkCount: background ? 1 : 0,
  };
}

export function chiefHasDot(counts: ReturnType<typeof chiefCounts>): boolean {
  return Object.values(counts).some((count) => count > 0);
}

/**
 * Whether the computer has a home project (server/src/chief/home.rs): then its Chief is that project's header in the
 * list, not the row under the Spaces tabs.
 *
 * CDXC:Chief 2026-11-08 SEE-ALSO: the DECISIONs in packages/gx-core/src/sidebar_view/chief.rs (Chief is the home's
 * header) and apps/desktop/src/app/native_sidebar/chief.rs. The phone shows one computer per tab, like the desktop's
 * Separate by machine, so each tab's home carries that computer's Chief.
 */
export function hasHomeProject(summary: Pick<GhostexMobileSummary, 'projects'> | null | undefined): boolean {
  return homeProjectIdIn(summary) !== null;
}

/** The computer's home project id (Main Hub, server/src/chief/home.rs), or `null` when absent. */
export function homeProjectIdIn(summary: Pick<GhostexMobileSummary, 'projects'> | null | undefined): string | null {
  const id = summary?.projects.find((project) => project.isHome === true)?.projectId?.trim() ?? '';
  return id.length > 0 ? id : null;
}

/** Chief's built-in feature id, as the computer lists it. */
export const CHIEF_FEATURE = 'chief';

/** Whether Chief is on for a computer whose session summary is `summary` (none yet: on). */
export function chiefOnIn(summary: { builtInFeaturesOff?: readonly string[] } | null | undefined): boolean {
  return summary?.builtInFeaturesOff?.includes(CHIEF_FEATURE) !== true;
}

/** The computer's Chief session, if it has one. */
export function chiefSessionIn(
  summary: Pick<GhostexMobileSummary, 'sessions'> | null | undefined,
): GhostexSession | null {
  return summary?.sessions.find((session) => session.isChief) ?? null;
}

export type ChiefRowModel = {
  machineId: string;
  machineLabel: string;
  /** `null` before its first open: the row asks which agent runs it. */
  session: GhostexSession | null;
};

/**
 * The rows to draw: the selected computer's first (also before its first open), then every other
 * computer whose Chief is on and has been opened. Empty while the selected computer has Chief off.
 */
export function chiefRows(
  machines: readonly { id: string; label: string }[],
  summaries: Readonly<Record<string, Pick<GhostexMobileSummary, 'sessions' | 'builtInFeaturesOff'> | null | undefined>>,
  selectedMachineId: string,
): ChiefRowModel[] {
  const selected = machines.find((machine) => machine.id === selectedMachineId);
  if (selected === undefined) return [];
  const summary = summaries[selected.id];
  if (summary === null || summary === undefined || !chiefOnIn(summary)) return [];
  const others = machines
    .filter((machine) => machine.id !== selected.id)
    .flatMap((machine) => {
      const other = summaries[machine.id];
      const session = chiefOnIn(other) ? chiefSessionIn(other) : null;
      return session === null ? [] : [{ machineId: machine.id, machineLabel: machine.label, session }];
    });
  return [{ machineId: selected.id, machineLabel: selected.label, session: chiefSessionIn(summary) }, ...others];
}

/**
 * The agent Chief of Staff's first open starts on (`defaultAgentId` of `ghostex chief status`: the computer's
 * default agent, server/src/chief/model.rs). `null` from a computer whose Ghostex predates it, which keeps the
 * agent question.
 */
export function parseChiefDefaultAgent(json: unknown): string | null {
  const root = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  return typeof root.defaultAgentId === 'string' && root.defaultAgentId.length > 0 ? root.defaultAgentId : null;
}

/** `ghostex chief status --json`: the agents Chief can run on, for the first open. */
export function parseChiefAgents(json: unknown): { agentId: string; name: string }[] {
  const root = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const agents = Array.isArray(root.agents) ? root.agents : [];
  return agents.flatMap((agent) => {
    if (typeof agent !== 'object' || agent === null) return [];
    const row = agent as Record<string, unknown>;
    const agentId = typeof row.agentId === 'string' ? row.agentId : '';
    const name = typeof row.name === 'string' && row.name.length > 0 ? row.name : agentId;
    return agentId.length === 0 ? [] : [{ agentId, name }];
  });
}

/**
 * One earlier Ask Ghostex AI chat (asleep, still open) from `ghostex chief status --json`
 * (`earlierChats`, server/src/chief/session.rs `earlier_chats`).
 */
export type ChiefEarlierChat = {
  projectId: string;
  sessionId: string;
  title: string;
  /** ISO timestamp from `lastActiveAt` (or `createdAt` on the server); `null` when absent. */
  lastActiveAt: string | null;
};

/** `ghostex chief status --json`: Ghostex AI's earlier open chats, newest first. */
export function parseChiefEarlierChats(json: unknown): ChiefEarlierChat[] {
  const root = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const chats = Array.isArray(root.earlierChats) ? root.earlierChats : [];
  const parsed = chats.flatMap((entry): ChiefEarlierChat[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const projectId = typeof row.projectId === 'string' ? row.projectId.trim() : '';
    const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : '';
    if (projectId.length === 0 || sessionId.length === 0) return [];
    const title = typeof row.title === 'string' && row.title.trim().length > 0 ? row.title.trim() : CHIEF_LABEL;
    const lastActiveAt =
      typeof row.lastActiveAt === 'string' && row.lastActiveAt.trim().length > 0 ? row.lastActiveAt.trim() : null;
    return [{ projectId, sessionId, title, lastActiveAt }];
  });
  return parsed.sort((left, right) => (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? ''));
}

/** An earlier chat's timestamp in the phone's local time ("22 Nov, 10:58", or with the year when older). */
export function formatChiefEarlierChatDate(iso: string | null, nowMs = Date.now()): string {
  if (iso === null || iso.length === 0) return '';
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '';
  const sameYear = time.getFullYear() === new Date(nowMs).getFullYear();
  const day = time.toLocaleDateString(
    undefined,
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
  const clock = time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${clock}`;
}
