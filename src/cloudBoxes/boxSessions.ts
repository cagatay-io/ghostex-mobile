/**
 * A box's sessions as the phone lists them: read from the box's own gxserver while it is up, from
 * the rows its computer cached while it sleeps, and shown inside their home project.
 *
 * CDXC:CloudBoxes 2026-11-02 DECISION:
 * User (Q1015 "in project with badge"): cloud sessions sit in their project with a ☁ badge whose
 * dot shows the box state, and box machines never get a machine tab. The phone keeps each box's
 * own summary under its hidden machine (`cloudbox:<boxId>`, what the chat and every request to the
 * box read) and adds a copy of its rows to the home computer's summary for the lists, renamed into
 * the home project, so both the Project and the Unified lists draw them where the desktop does.
 * SEE-ALSO: packages/gx-core/src/cloud_boxes.rs (`cached_box_snapshot`, the merge rule),
 * server/src/ghostex_cli/sessions/mobile_summary.rs (the summary shape this builds)
 */

import { parseMobileSummary, type GhostexMobileSummary, type GhostexSession } from '../contract/mobileSummary';
import type { CloudBoxEntry } from './store';
import { cloudBoxMachineId, type CloudBox } from './types';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The session field every box row carries: the badge, and where requests about it go. */
export function cloudBoxStamp(box: CloudBox, boxProjectId: string): Json {
  return {
    boxId: box.boxId,
    provider: box.provider,
    state: box.state,
    boxName: box.name,
    homeProjectId: box.homeProjectId,
    machineId: cloudBoxMachineId(box.boxId),
    boxProjectId,
    startedAt: box.startedAt,
    costTotalUsd: box.costTotalUsd,
    usdPerHour: box.usdPerHour,
  };
}

/**
 * The summary of an up box from its gxserver's `readPresentationSnapshot` answer: the projects and
 * sessions the CLI's mobile summary would carry, in the keys `parseMobileSummary` reads.
 */
export function boxSummaryFromPresentation(entry: CloudBoxEntry, answer: unknown): GhostexMobileSummary | null {
  const snapshot = isObject(answer) && isObject(answer.snapshot) ? answer.snapshot : null;
  if (snapshot === null) return null;
  const rows = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
  const projects = rows(snapshot.projects).map((project) => ({
    projectId: project.projectId,
    name: typeof project.title === 'string' ? project.title : project.name,
    path: project.path,
    gitRemoteOriginUrl: project.gitRemoteOriginUrl,
    worktree: project.worktree,
  }));
  const projectById = new Map(projects.map((project) => [project.projectId, project]));
  const sessions = rows(snapshot.sessions)
    .filter((session) => session.lifecycleState !== 'stopped' && session.lifecycleState !== 'closed')
    .map((session) => {
      const project = projectById.get(session.projectId);
      return {
        ...session,
        agent: session.agentId ?? session.agent,
        provider: session.sessionPersistenceProvider ?? 'zmx',
        projectName: project?.name ?? '',
        projectPath: project?.path ?? '',
        status: session.lifecycleState,
        // The box's gxserver publishes no git row for its sessions; the branch it put the session on
        // rides in its `cloudBox` field (Pull branch, Open PR).
        gitStatus:
          session.gitStatus ??
          (isObject(session.cloudBox) && typeof session.cloudBox.branch === 'string'
            ? { branch: session.cloudBox.branch }
            : undefined),
        cloudBox: cloudBoxStamp(entry.box, typeof session.projectId === 'string' ? session.projectId : ''),
      };
    });
  return parseMobileSummary(JSON.stringify({ sessions, projects }));
}

/**
 * The summary of a box that is not up, from the rows its computer cached (`reportBoxSessions`):
 * listed, faded like sleeping sessions, and opening one never wakes the box.
 */
export function cachedBoxSummary(entry: CloudBoxEntry): GhostexMobileSummary {
  const box = entry.box;
  const sessions = box.sessions
    .filter((row) => row.archived !== true)
    .map((row) => ({
      sessionId: row.sessionId,
      projectId: row.projectId,
      title: row.title,
      displayTitle: row.title,
      agent: row.agentId ?? '',
      agentSessionId: row.agentSessionId ?? '',
      kind: row.agentId !== undefined && row.agentId.length > 0 ? 'agent' : 'terminal',
      provider: 'zmx',
      activity: 'idle',
      lifecycleState: 'sleeping',
      providerSessionState: 'exists',
      isSleeping: true,
      isLive: false,
      lastActiveAt: row.lastActiveAt ?? '',
      lastInteractionAt: row.lastActiveAt ?? '',
      gitStatus: row.branch === undefined ? undefined : { branch: row.branch },
      cloudBox: cloudBoxStamp(box, row.projectId),
    }));
  return parseMobileSummary(JSON.stringify({ sessions, projects: [] })) ?? emptySummary();
}

function emptySummary(): GhostexMobileSummary {
  return parseMobileSummary('{"sessions":[]}')!;
}

/**
 * The home computer's summary with its boxes' sessions in their home project. `boxSummaries` is
 * each box machine's summary by machine id. A box whose home project the computer no longer lists
 * keeps its rows only under its own machine.
 */
export function withBoxSessions(
  home: GhostexMobileSummary,
  boxes: readonly CloudBoxEntry[],
  boxSummaries: Readonly<Record<string, GhostexMobileSummary | null | undefined>>,
): GhostexMobileSummary {
  if (boxes.length === 0) return home;
  const homeSessions = home.sessions.map((session) => withStartedBox(session, boxes));
  const added: GhostexSession[] = [];
  for (const entry of boxes) {
    const homeProjectId = entry.box.homeProjectId ?? '';
    const project = home.projects.find((candidate) => candidate.projectId === homeProjectId);
    const summary = boxSummaries[cloudBoxMachineId(entry.box.boxId)];
    if (project === undefined || summary == null) continue;
    for (const session of summary.sessions) {
      if (session.cloudBox === undefined) continue;
      added.push({
        ...session,
        projectId: project.projectId,
        projectName: project.name ?? '',
        projectPath: project.path ?? '',
        groupId: '',
        sortOrder: null,
        // Listed with the sessions, never Drafts: a box's cached rows (box asleep) carry no draft
        // flag, so a not-started agent jumped from Drafts to the sessions when its box stopped.
        isDraft: undefined,
        // The registry's state wins: a row read a moment ago may predate a stop.
        cloudBox: { ...session.cloudBox, state: entry.box.state, boxName: entry.box.name },
      });
    }
  }
  const known = new Set(homeSessions.map((session) => session.sessionId));
  return { ...home, sessions: [...homeSessions, ...added.filter((session) => !known.has(session.sessionId))] };
}

/**
 * A home draft whose first message started a box: its badge reads that box's name and state, so a
 * failed start shows Failed instead of "Starts with the first message" (the draft row stays
 * `pending` until the box session replaces it). The phone's twin of gx-core's
 * `SessionCloudBoxBadge::with_started_box`.
 */
function withStartedBox(session: GhostexSession, boxes: readonly CloudBoxEntry[]): GhostexSession {
  const badge = session.cloudBox;
  if (badge === undefined || badge.state !== 'pending' || badge.boxId.length === 0) return session;
  const started = boxes.find((entry) => entry.box.boxId === badge.boxId)?.box;
  if (started === undefined) return session;
  return { ...session, cloudBox: { ...badge, state: started.state, boxName: started.name } };
}

/** The session as its box knows it (its own project id), for a row listed in the home project. */
export function boxSessionOf(session: GhostexSession): GhostexSession {
  const box = session.cloudBox;
  if (box === undefined || box.boxProjectId === undefined || box.boxProjectId === session.projectId) return session;
  return { ...session, projectId: box.boxProjectId };
}
