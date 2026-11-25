/**
 * Workspace filtering for the sessions drawer: which of a computer's workspaces the phone shows,
 * and the summary that workspace's projects, sessions and Spaces are drawn from.
 *
 * CDXC:Workspaces 2026-10-09 SEE-ALSO:
 * The rules mirror gx-core `sidebar_view/workspaces.rs` (`WindowWorkspace`, `project_workspace_id`):
 * a project or Space with no or an unknown `workspaceId` belongs to the default workspace, a
 * worktree project follows its parent checkout's, an `everyWorkspace` project shows in every
 * workspace, and a row whose project the summary does not list is never hidden. On the phone each
 * computer is its own tab with its own workspaces, so the desktop's rule for a remote machine's
 * tab (shown only in the workspace it was assigned to) has no counterpart here.
 *
 * CDXC:Workspaces 2026-11-26 SEE-ALSO: the DECISION at `SidebarWorkspace::show_spaces_from` in
 * packages/gx-protocol/src/side_state.rs. A workspace's `showSpacesFrom` adds those workspaces'
 * Spaces after its own, and the projects those Spaces claim (and nothing else of theirs), as gx-core
 * `WindowWorkspace::joined` does; its `hiddenSpaceIds` leaves some of them off the row.
 */

import type {
  GhostexMobileSummary,
  GhostexProject,
  GhostexSidebarSpace,
  GhostexWorkspace,
  GhostexWorkspaces,
} from '../contract/mobileSummary';
import { isSidebarSpaceProject } from '../spaces/otherSpace';

/** `id` when it names a workspace, else the default workspace's (`SidebarWorkspacesState::resolve`). */
export function resolveWorkspaceId(workspaces: GhostexWorkspaces, id: string | undefined): string {
  if (id !== undefined && workspaces.workspaces[id] !== undefined) return id;
  return workspaces.defaultWorkspaceId;
}

/** Workspaces in display order. */
export function orderedWorkspaces(workspaces: GhostexWorkspaces): GhostexWorkspace[] {
  return workspaces.order.flatMap((workspaceId) => {
    const workspace = workspaces.workspaces[workspaceId];
    return workspace === undefined ? [] : [workspace];
  });
}

/**
 * The workspace one tap on the workspace tile's letter switches to: the most recently shown other
 * workspace, else the next one in display order. Null with a single workspace, when the letter
 * opens the menu instead. Mirrors gx-core `workspace_switch_target` (sidebar_menu/workspace.rs).
 */
export function workspaceSwitchTarget(
  workspaces: GhostexWorkspaces,
  currentId: string,
  recentIds: readonly string[],
): GhostexWorkspace | null {
  for (const id of recentIds) {
    if (id === currentId) continue;
    const recent = workspaces.workspaces[id];
    if (recent !== undefined) return recent;
  }
  const ordered = orderedWorkspaces(workspaces);
  const position = ordered.findIndex((workspace) => workspace.workspaceId === currentId);
  for (let offset = 0; offset < ordered.length; offset += 1) {
    const candidate = ordered[(position + 1 + offset) % ordered.length];
    if (candidate.workspaceId !== currentId) return candidate;
  }
  return null;
}

/** The workspace a project belongs to: its own, or its parent checkout's for a worktree project. */
function projectWorkspaceId(
  workspaces: GhostexWorkspaces,
  projectsById: ReadonlyMap<string, GhostexProject>,
  project: GhostexProject,
): string {
  const parent =
    project.worktreeParentProjectId.length > 0 ? projectsById.get(project.worktreeParentProjectId) : undefined;
  return resolveWorkspaceId(workspaces, parent?.workspaceId ?? project.workspaceId);
}

function projectsById(summary: GhostexMobileSummary): Map<string, GhostexProject> {
  return new Map(summary.projects.map((project) => [project.projectId, project]));
}

/**
 * The other workspaces whose Spaces `workspaceId`'s list shows, in workspace display order
 * (`SidebarWorkspacesState::joined_workspace_ids`): known ids only, never itself.
 */
export function joinedWorkspaceIds(workspaces: GhostexWorkspaces, workspaceId: string): string[] {
  const wanted = workspaces.workspaces[workspaceId]?.showSpacesFrom ?? [];
  if (wanted.length === 0) return [];
  return workspaces.order.filter((id) => id !== workspaceId && wanted.includes(id));
}

/**
 * The projects the joined workspaces' own Spaces claim (gx-core `joined_space_projects`): a project
 * of a joined workspace is kept when one of that workspace's Spaces lists its group, or, ungrouped,
 * the project itself (a worktree counts as its parent checkout).
 */
function joinedSpaceProjectIds(
  summary: GhostexMobileSummary,
  workspaces: GhostexWorkspaces,
  byId: ReadonlyMap<string, GhostexProject>,
  joined: readonly string[],
): Set<string> {
  const collectionOf = new Map<string, string>();
  for (const collection of summary.projectCollections) {
    for (const projectId of collection.projectIds) collectionOf.set(projectId, collection.collectionId);
  }
  const spacesOf = new Map<string, GhostexSidebarSpace[]>();
  for (const spaceId of summary.sidebarSpaces.order) {
    const space = summary.sidebarSpaces.spaces[spaceId];
    if (space === undefined) continue;
    const owner = resolveWorkspaceId(workspaces, space.workspaceId);
    if (!joined.includes(owner)) continue;
    spacesOf.set(owner, [...(spacesOf.get(owner) ?? []), space]);
  }
  const claimed = new Set<string>();
  for (const project of summary.projects) {
    const spaces = spacesOf.get(projectWorkspaceId(workspaces, byId, project));
    if (spaces === undefined) continue;
    const parentProjectId = project.worktreeParentProjectId.length > 0 ? project.worktreeParentProjectId : undefined;
    const collectionId = collectionOf.get(parentProjectId ?? project.projectId);
    const listed = spaces.some((space) =>
      isSidebarSpaceProject({ collectionId, parentProjectId, projectId: project.projectId, space }),
    );
    if (listed) claimed.add(project.projectId);
  }
  return claimed;
}

/**
 * The summary the drawer renders for one workspace: its projects, their sessions, and its Spaces,
 * then the Spaces of the workspaces it shows (`joinedWorkspaceIds`) with the projects they claim.
 * Unchanged when the computer has no workspaces.
 */
export function filterSummaryForWorkspace(summary: GhostexMobileSummary, workspaceId: string): GhostexMobileSummary {
  const workspaces = summary.workspaces;
  if (workspaces === null) return summary;
  const byId = projectsById(summary);
  const joined = joinedWorkspaceIds(workspaces, workspaceId);
  const joinedProjectIds =
    joined.length === 0 ? new Set<string>() : joinedSpaceProjectIds(summary, workspaces, byId, joined);
  const projects = summary.projects.filter(
    (project) =>
      project.everyWorkspace === true ||
      projectWorkspaceId(workspaces, byId, project) === workspaceId ||
      joinedProjectIds.has(project.projectId),
  );
  const keptProjectIds = new Set(projects.map((project) => project.projectId));
  const sessions = summary.sessions.filter(
    (session) => !byId.has(session.projectId) || keptProjectIds.has(session.projectId),
  );
  // Own Spaces first, then each joined workspace's in workspace order, as gx-core `window_spaces` sorts the row.
  const spaceIdsOf = (ownerId: string): string[] =>
    summary.sidebarSpaces.order.filter((spaceId) => {
      const space = summary.sidebarSpaces.spaces[spaceId];
      return space !== undefined && resolveWorkspaceId(workspaces, space.workspaceId) === ownerId;
    });
  const ownSpaceIds = spaceIdsOf(workspaceId);
  const hiddenHere = workspaces.workspaces[workspaceId]?.hiddenSpaceIds ?? [];
  const spaces: Record<string, GhostexSidebarSpace> = Object.fromEntries(
    ownSpaceIds.map((spaceId) => [spaceId, summary.sidebarSpaces.spaces[spaceId]]),
  );
  const spaceIds = [...ownSpaceIds];
  for (const joinedId of joined) {
    const name = workspaces.workspaces[joinedId]?.name ?? joinedId;
    for (const spaceId of spaceIdsOf(joinedId)) {
      const space = summary.sidebarSpaces.spaces[spaceId];
      // Hide Here leaves the Space off this workspace's row only (the phone has no Show hidden).
      spaces[spaceId] = {
        ...space,
        joinedWorkspaceName: name,
        hidden: space.hidden === true || hiddenHere.includes(spaceId),
      };
      spaceIds.push(spaceId);
    }
  }
  return { ...summary, projects, sessions, sidebarSpaces: { order: spaceIds, spaces } };
}

/** `workspaceId`'s list shows `sessionId`: its own, an every-workspace one, or one of a joined Space's projects. */
export function workspaceShowsSession(
  summary: GhostexMobileSummary,
  workspaceId: string,
  sessionId: string,
): boolean {
  return filterSummaryForWorkspace(summary, workspaceId).sessions.some((session) => session.sessionId === sessionId);
}

/** The workspace a project is shown in (a worktree follows its parent's), or null when the computer has none. */
export function projectWorkspaceIdOf(summary: GhostexMobileSummary, projectId: string): string | null {
  const workspaces = summary.workspaces;
  if (workspaces === null) return null;
  const byId = projectsById(summary);
  const project = byId.get(projectId);
  return project === undefined ? null : projectWorkspaceId(workspaces, byId, project);
}

/**
 * The workspace a session is shown in, or null when it shows in every workspace (its project is
 * shown everywhere, is unknown to the summary, or the computer has no workspaces).
 */
export function sessionWorkspaceId(summary: GhostexMobileSummary, sessionId: string): string | null {
  const workspaces = summary.workspaces;
  if (workspaces === null) return null;
  const session = summary.sessions.find((entry) => entry.sessionId === sessionId);
  if (session === undefined) return null;
  const byId = projectsById(summary);
  const project = byId.get(session.projectId);
  if (project === undefined || project.everyWorkspace === true) return null;
  return projectWorkspaceId(workspaces, byId, project);
}
