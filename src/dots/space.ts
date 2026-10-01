/**
 * The Dots chip of the phone's Space row: its reserved id and the two views of a computer's
 * inventory it splits (dot projects only, and everything else).
 *
 * CDXC:OpenDots 2026-10-01 WHY:
 * Dot projects are ordinary gxserver projects, so every Space and the plain list would show them; like the desktop's `SidebarMode::Dots`, they are listed only under the Dots chip, flat (no groups or Spaces), and never anywhere else.
 * SEE-ALSO: packages/gx-core/src/sidebar_view/ (`SidebarMode::Dots`), src/spaces/spaceFilter.ts, src/components/sessions/drawerModel.ts.
 */

import { EMPTY_SIDEBAR_SPACES, type GhostexMobileSummary } from '../contract/mobileSummary';

/**
 * Reserved selection id for the Dots chip. User Space ids are `space-<position>-<base36>` and the
 * built-in Other is `other`, so no Space can claim it.
 */
export const DOTS_SIDEBAR_SPACE_ID = 'dots';
export const DOTS_SIDEBAR_SPACE_LABEL = 'Dots';
/** The Dots chip's selected rail: the default dot's body color. */
export const DOTS_SIDEBAR_SPACE_COLOR = '#ffa7c4';

function dotProjectIds(summary: GhostexMobileSummary): Set<string> {
  const ids = new Set<string>();
  for (const project of summary.projects) if (project.isDot) ids.add(project.projectId);
  return ids;
}

/** The inventory without dot projects or their sessions (every Space, Other and the plain list). */
export function withoutDotProjects(summary: GhostexMobileSummary): GhostexMobileSummary {
  const ids = dotProjectIds(summary);
  if (ids.size === 0) return summary;
  return {
    ...summary,
    projects: summary.projects.filter((project) => !ids.has(project.projectId)),
    sessions: summary.sessions.filter((session) => !ids.has(session.projectId)),
  };
}

/** Only dot projects and their sessions, flat: no collections and no Spaces. */
export function dotsOnlySummary(summary: GhostexMobileSummary): GhostexMobileSummary {
  const ids = dotProjectIds(summary);
  return {
    ...summary,
    projects: summary.projects.filter((project) => ids.has(project.projectId)),
    sessions: summary.sessions.filter((session) => ids.has(session.projectId)),
    projectCollections: [],
    sidebarSpaces: EMPTY_SIDEBAR_SPACES,
  };
}

/** Pending approvals across every dot on the computer (the OpenDots row's badge). */
export function dotsNeedsYouCount(summary: GhostexMobileSummary | null): number {
  if (summary === null) return 0;
  return summary.projects.reduce((total, project) => total + (project.isDot ? project.dotNeedsYou : 0), 0);
}
