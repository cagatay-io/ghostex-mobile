/**
 * A session's PR, issue and Linear links as the chat strip and its sheet draw them: each entry's
 * glyph and colour, its state word and its second line.
 *
 * CDXC:SessionLinks 2026-10-24 SEE-ALSO:
 * The phone's copy of packages/gx-core/src/sidebar_view/links.rs (the desktop's rules); the two
 * must give the same glyphs, colours, words and lines. What they read comes from gxserver
 * (server/src/session_links/) through the mobile summary's `links`.
 */

import type { GhostexSessionLink } from '../../contract/mobileSummary';
import type { WorkChipGlyph } from '../../components/sessions/workChipModel';
import { SidebarPalette } from '../../theme/palette';

export type SessionLinkLook = { glyph: WorkChipGlyph; color: string };

export function sessionLinkLook(link: GhostexSessionLink): SessionLinkLook {
  switch (link.kind) {
    case 'pullRequest':
      switch (link.state) {
        case 'open':
          return { glyph: 'pullRequest', color: SidebarPalette.WORK_OPEN };
        case 'merged':
          return { glyph: 'merged', color: SidebarPalette.WORK_MERGED };
        case 'closed':
          return { glyph: 'pullRequest', color: SidebarPalette.WORK_CLOSED };
        default:
          return { glyph: 'pullRequest', color: SidebarPalette.WORK_DRAFT };
      }
    case 'issue':
      if (link.state === 'closed') return { glyph: 'issueClosed', color: SidebarPalette.WORK_MERGED };
      return {
        glyph: 'issueOpen',
        color: link.state === 'open' ? SidebarPalette.WORK_OPEN : SidebarPalette.WORK_DRAFT,
      };
    case 'linear': {
      const inReview = link.stateName.toLowerCase().includes('review');
      switch (link.state) {
        case 'started':
          return inReview
            ? { glyph: 'linearReview', color: SidebarPalette.WORK_REVIEW }
            : { glyph: 'linearStarted', color: SidebarPalette.WORK_STARTED };
        case 'completed':
          return { glyph: 'linearDone', color: SidebarPalette.WORK_DONE };
        case 'canceled':
          return { glyph: 'linearCanceled', color: SidebarPalette.WORK_DRAFT };
        case 'backlog':
        case 'triage':
          return { glyph: 'linearBacklog', color: SidebarPalette.WORK_DRAFT };
        case '':
          return { glyph: 'linearCircle', color: SidebarPalette.WORK_LINEAR };
        default:
          return { glyph: 'linearCircle', color: SidebarPalette.WORK_DRAFT };
      }
    }
  }
}

/** The mark after a PR's number: its checks. */
export function sessionLinkChecksMark(link: GhostexSessionLink): SessionLinkLook | null {
  switch (link.checks) {
    case 'passing':
      return { glyph: 'checksPassing', color: SidebarPalette.WORK_OPEN };
    case 'failing':
      return { glyph: 'checksFailing', color: SidebarPalette.WORK_CLOSED };
    case 'pending':
      return { glyph: 'checksPending', color: SidebarPalette.WORK_PENDING };
    default:
      return null;
  }
}

/** "Open", "Draft", "Merged", "Closed", or the Linear team's own name for the state. */
export function sessionLinkStateLabel(link: GhostexSessionLink): string {
  if (link.kind === 'linear') return link.stateName;
  return link.state.length > 0 ? link.state[0].toUpperCase() + link.state.slice(1) : '';
}

/** The second line: checks, review and where the link came from. */
export function sessionLinkDetailLine(link: GhostexSessionLink): string {
  const checks =
    link.checks === 'passing'
      ? 'Checks passing'
      : link.checks === 'failing'
        ? 'Checks failing'
        : link.checks === 'pending'
          ? 'Checks running'
          : '';
  const review =
    link.review === 'reviewRequired'
      ? 'Review requested'
      : link.review === 'approved'
        ? 'Approved'
        : link.review === 'changesRequested'
          ? 'Changes requested'
          : '';
  return [checks, review, link.sourceLabel].filter((part) => part.length > 0).join(' · ');
}

/** `#318 · Port the Find screen · Open`, what a chip reads out. */
export function sessionLinkSummary(link: GhostexSessionLink): string {
  return [link.label, link.title, sessionLinkStateLabel(link)].filter((part) => part.length > 0).join(' · ');
}
