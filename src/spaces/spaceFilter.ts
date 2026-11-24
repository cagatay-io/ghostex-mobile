/**
 * Space filtering for the sessions drawer: which Space a machine is showing,
 * and the summary that Space's content is built from.
 *
 * The membership rule itself lives in ./otherSpace, mirrored verbatim from
 * packages/shared/sidebar-spaces-other.ts, so the phone and the desktop sidebar
 * can never disagree about what a Space — or the built-in Other — contains.
 */

import type { GhostexMobileSummary, GhostexSidebarSpace, GhostexSidebarSpaces } from '../contract/mobileSummary';
import { chiefOnIn } from '../contract/chief';
import { isAutopilotProject, withoutGbots } from '../contract/gbotsFilter';
import { countTileStatus, type TileStatusCounts } from '../contract/grouping';
import { ACTIVE_SPACE_ID, filterSummaryForActiveProjects, type ActiveProjectsContext } from './activeProjects';
import { isSidebarSpaceProject, isUnassignedSidebarSpaceProject, OTHER_SIDEBAR_SPACE_ID } from './otherSpace';

/** The Space row as rendered: the machine's Spaces in order, then Other last. */
export type SpaceRowItem = {
  spaceId: string;
  name: string;
  /** COMMAND_ICONS glyph name. */
  icon: string;
  color: string;
};

/** Spaces in `order`, ignoring ids the daemon no longer knows. */
export function orderedSpaces(spaces: GhostexSidebarSpaces): GhostexSidebarSpace[] {
  return spaces.order.flatMap((spaceId) => {
    const space = spaces.spaces[spaceId];
    return space === undefined ? [] : [space];
  });
}

/**
 * The default selection rule, mirroring `resolveSelectedSidebarSpace` in
 * packages/core-ui/sidebar-app/space-filtering.ts: nothing stored — and a
 * stored Space the daemon no longer has — shows the FIRST Space in order, or
 * Other when the machine has no Spaces. Never a ghost Space, and never an
 * "unfiltered" view.
 */
export function resolveSelectedSpaceId(
  spaces: GhostexSidebarSpaces,
  storedSpaceId: string | undefined,
  activeProjects = false,
): string {
  if (storedSpaceId === OTHER_SIDEBAR_SPACE_ID) return OTHER_SIDEBAR_SPACE_ID;
  // The Active projects star (./activeProjects.ts) resolves while the computer shows it; off, it falls back.
  if (activeProjects && storedSpaceId === ACTIVE_SPACE_ID) return ACTIVE_SPACE_ID;
  // A hidden Space is never the selection: the phone has no Show hidden to draw it with (spaceRowItems).
  const shown = (spaceId: string): boolean => {
    const space = spaces.spaces[spaceId];
    return space !== undefined && space.hidden !== true;
  };
  if (storedSpaceId !== undefined && shown(storedSpaceId)) {
    return storedSpaceId;
  }
  return spaces.order.find(shown) ?? OTHER_SIDEBAR_SPACE_ID;
}

/**
 * Collection ("group") each project resolves to, including one level of
 * worktree inheritance — mirroring `createProjectCollectionIdByProjectId` in
 * packages/core-ui/sidebar-app/drag-drop-geometry.ts.
 */
export function collectionIdByProjectId(summary: GhostexMobileSummary): Map<string, string> {
  const result = new Map<string, string>();
  for (const collection of summary.projectCollections) {
    for (const projectId of collection.projectIds) result.set(projectId, collection.collectionId);
  }
  for (const project of summary.projects) {
    const parentProjectId = project.worktreeParentProjectId;
    if (parentProjectId.length === 0) continue;
    const inherited = result.get(parentProjectId);
    if (inherited !== undefined) result.set(project.projectId, inherited);
  }
  return result;
}

/**
 * The summary the drawer renders for one Space. Collections are left verbatim because
 * `buildDrawerItems` already drops a collection whose member projects are gone.
 *
 * Returns the input unchanged when the machine has no Spaces at all — Other
 * alone would then be every project, and the row is hidden.
 */
export function filterSummaryForSpace(
  whole: GhostexMobileSummary,
  selectedSpaceId: string,
  active?: ActiveProjectsContext,
): GhostexMobileSummary {
  if (selectedSpaceId === ACTIVE_SPACE_ID) {
    const collections = collectionIdByProjectId(withoutGbots(whole));
    return filterSummaryForActiveProjects(whole, active ?? { nowMs: Date.now(), focusedSessionId: null }, (projectId) =>
      collections.get(projectId),
    );
  }
  // A Space only shows and counts the user's projects: GBots follow Main Hub instead (contract/gbots.ts).
  // Autopilot's supervisor sessions follow Main Hub while Main Hub is on, so carry them along whenever Main Hub stays.
  const autopilotProjects = chiefOnIn(whole) ? whole.projects.filter(isAutopilotProject) : [];
  const autopilotIds = new Set(autopilotProjects.map((project) => project.projectId));
  const autopilotSessions =
    autopilotIds.size > 0 ? whole.sessions.filter((session) => autopilotIds.has(session.projectId)) : [];
  const summary = withoutGbots(whole);
  const spaces = orderedSpaces(summary.sidebarSpaces);
  if (spaces.length === 0) {
    if (autopilotProjects.length > 0 && summary.projects.some((project) => project.isHome === true)) {
      return {
        ...summary,
        projects: [...summary.projects, ...autopilotProjects],
        sessions: [...summary.sessions, ...autopilotSessions],
      };
    }
    return summary;
  }
  const selectedSpace =
    selectedSpaceId === OTHER_SIDEBAR_SPACE_ID ? null : (summary.sidebarSpaces.spaces[selectedSpaceId] ?? null);
  const collectionByProjectId = collectionIdByProjectId(summary);

  const keepProject = (projectId: string, worktreeParentProjectId: string): boolean => {
    const membership = {
      collectionId: collectionByProjectId.get(projectId),
      parentProjectId: worktreeParentProjectId.length > 0 ? worktreeParentProjectId : undefined,
      projectId,
    };
    return selectedSpace === null
      ? isUnassignedSidebarSpaceProject({ ...membership, spaces })
      : isSidebarSpaceProject({ ...membership, space: selectedSpace });
  };

  const knownProjectIds = new Set(summary.projects.map((project) => project.projectId));
  /*
   * CDXC:Chief 2026-11-08 SEE-ALSO: the DECISION in packages/gx-core/src/sidebar_view/assemble.rs. The home
   * project (Main Hub's) is a Space member like any project; with Show on all Spaces it is in every one.
   */
  const projects = summary.projects.filter(
    (project) =>
      (project.isHome === true && summary.chiefShowOnAllSpaces === true) ||
      keepProject(project.projectId, project.worktreeParentProjectId),
  );
  const keptProjectIds = new Set(projects.map((project) => project.projectId));
  /*
   * A session whose project the inventory does not list cannot be resolved to a
   * collection or a parent, so no Space claims it and Other is the only view
   * left that can show it — the same call the desktop row predicate makes for
   * an unresolvable project id.
   */
  // Chief of Staff's row is pinned in Main Hub wherever its session lives (contract/grouping.ts), so
  // it shows where Main Hub does.
  const homeKept = projects.some((project) => project.isHome === true);
  const sessions = summary.sessions.filter((session) =>
    session.isChief && homeKept
      ? true
      : knownProjectIds.has(session.projectId)
        ? keptProjectIds.has(session.projectId)
        : selectedSpace === null,
  );
  if (homeKept && autopilotProjects.length > 0) {
    return {
      ...summary,
      projects: [...projects, ...autopilotProjects],
      sessions: [...sessions, ...autopilotSessions],
    };
  }

  if (projects.length === summary.projects.length && sessions.length === summary.sessions.length) {
    return summary;
  }
  return { ...summary, projects, sessions };
}

/**
 * The machine's own Spaces as row items, in order. The built-in Other button is
 * appended by the row component, which owns its reserved id, label, and glyph.
 *
 * CDXC:Spaces 2026-11-21 SEE-ALSO: the DECISION at `Space::shown` in packages/gx-core/src/sidebar_view/spaces.rs.
 * A Space hidden on the desktop is left off the phone's row; the phone has no Show hidden, so it is unhidden there.
 * Its projects stay its members, so they do not move to Other (`filterSummaryForSpace` still reads every Space).
 */
export function spaceRowItems(spaces: GhostexSidebarSpaces): SpaceRowItem[] {
  return orderedSpaces(spaces).filter((space) => space.hidden !== true).map((space) => ({
    spaceId: space.spaceId,
    name: space.name,
    icon: space.icon,
    color: space.color,
  }));
}

/**
 * The counts each Space button's status dot draws: the sessions that Space
 * shows, each under its most urgent state (packages/gx-core/src/sidebar_view/
 * assemble.rs, the Space rows), for every Space plus Other.
 */
export function spaceSessionCounts(
  summary: GhostexMobileSummary | null,
  spaceIds: readonly string[],
  active?: ActiveProjectsContext,
): Record<string, TileStatusCounts> {
  const counts: Record<string, TileStatusCounts> = {};
  if (summary === null) return counts;
  for (const spaceId of [...spaceIds, OTHER_SIDEBAR_SPACE_ID]) {
    counts[spaceId] = countTileStatus(filterSummaryForSpace(summary, spaceId, active).sessions, summary.capabilities);
  }
  return counts;
}
