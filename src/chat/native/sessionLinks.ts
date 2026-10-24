/**
 * A session's PR, issue and Linear links as the chat strip and its sheet draw them: each entry's
 * glyph and colour, its state word and its second line.
 *
 * CDXC:SessionLinks 2026-10-24 SEE-ALSO:
 * The phone's copy of packages/gx-core/src/sidebar_view/links.rs (the desktop's rules); the two
 * must give the same glyphs, colours, words and lines. What they read comes from gxserver
 * (server/src/session_links/) through the mobile summary's `links`.
 */

import type { GhostexSessionLink, GhostexSessionLinks } from '../../contract/mobileSummary';
import type { WorkChipGlyph } from '../../components/sessions/workChipModel';
import { SidebarPalette } from '../../theme/palette';

export type SessionLinkLook = { glyph: WorkChipGlyph; color: string };

/**
 * The icon says the kind (a branch for a PR, the GitHub mark for an issue, the Linear logo for a
 * ticket) and its colour the state (gx-core `SessionLink::glyph`).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "Let's please not show text for issue and for Pull Request I think it's better to just show
 * branch icon for PRs and show github icon for issues and a linear icon for linear issues." Each
 * icon keeps its state colour. This supersedes the same day's kind word on the second line and the
 * per-state PR and issue icons.
 */
export function sessionLinkLook(link: GhostexSessionLink): SessionLinkLook {
  switch (link.kind) {
    case 'pullRequest':
      switch (link.state) {
        case 'open':
          return { glyph: 'branch', color: SidebarPalette.WORK_OPEN };
        case 'merged':
          return { glyph: 'branch', color: SidebarPalette.WORK_MERGED };
        case 'closed':
          return { glyph: 'branch', color: SidebarPalette.WORK_CLOSED };
        default:
          return { glyph: 'branch', color: SidebarPalette.WORK_DRAFT };
      }
    case 'issue':
      return {
        glyph: 'github',
        color:
          link.state === 'closed'
            ? SidebarPalette.WORK_MERGED
            : link.state === 'open'
              ? SidebarPalette.WORK_OPEN
              : SidebarPalette.WORK_DRAFT,
      };
    case 'linear': {
      const inReview = link.stateName.toLowerCase().includes('review');
      switch (link.state) {
        case 'started':
          return { glyph: 'linearLogo', color: inReview ? SidebarPalette.WORK_REVIEW : SidebarPalette.WORK_STARTED };
        case 'completed':
          return { glyph: 'linearLogo', color: SidebarPalette.WORK_DONE };
        case '':
          return { glyph: 'linearLogo', color: SidebarPalette.WORK_LINEAR };
        default:
          return { glyph: 'linearLogo', color: SidebarPalette.WORK_DRAFT };
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

/**
 * The second line: only what is worth acting on, an open PR's checks and review and the PR that
 * closes an issue ("Closed by #284"); empty draws a one-line row (gx-core `detail_line`).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "i dont like the "You added"/"mentioned in chat" text there i think no need for that". Where
 * a link came from is not shown; only "Closed by #284" stays.
 */
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
  const closedBy = link.source === 'closes' ? link.sourceLabel : '';
  return [checks, review, closedBy].filter((part) => part.length > 0).join(' · ');
}

/** `#318 · Port the Find screen · Open`, what a chip reads out. */
export function sessionLinkSummary(link: GhostexSessionLink): string {
  return [link.label, link.title, sessionLinkStateLabel(link)].filter((part) => part.length > 0).join(' · ');
}

/**
 * What a session row shows of its links, from the computer's Settings > Session Cards > Session
 * links in the sidebar (`sidebarSessionLinks`). The phone's copy of gx-core's
 * `SessionLinksDisplay` and `SessionLinks::row` (packages/gx-core/src/sidebar_view/links.rs); the
 * two must agree. The phone has no hover, so its long-press menu's Links row opens the full list.
 */
export type SessionLinksDisplay = 'always' | 'selected' | 'badge' | 'open' | 'off';

export function sessionLinksDisplay(value: unknown): SessionLinksDisplay {
  return value === 'always' || value === 'selected' || value === 'open' || value === 'off' ? value : 'badge';
}

export type SessionLinksRow = {
  /** The links the row's second line shows, in order; empty draws no line. */
  line: GhostexSessionLink[];
  /** The Badge option's count, coloured by the most pressing link; with `suggested`, the count of
   * a session's suggestions while it has no links, drawn muted and dashed. */
  badge: { count: number; color: string; suggested: boolean } | null;
};

/** The colour of the most pressing link (gx-core `most_pressing_tone`). */
export function mostPressingLinkColor(links: readonly GhostexSessionLink[]): string {
  let best = { rank: 5, color: SidebarPalette.WORK_DRAFT as string };
  for (const link of links) {
    const candidate =
      link.checks === 'failing' || link.review === 'changesRequested'
        ? { rank: 0, color: SidebarPalette.WORK_CLOSED }
        : link.review === 'reviewRequired' || link.checks === 'pending'
          ? { rank: 1, color: SidebarPalette.WORK_PENDING }
          : !link.finished && link.state !== 'draft'
            ? { rank: 2, color: sessionLinkLook(link).color }
            : !link.finished
              ? { rank: 3, color: SidebarPalette.WORK_DRAFT }
              : { rank: 4, color: SidebarPalette.WORK_MERGED };
    if (candidate.rank < best.rank) best = candidate;
  }
  return best.color;
}

export function sessionLinksRow(
  sessionLinks: GhostexSessionLinks | undefined,
  display: SessionLinksDisplay,
  selected: boolean,
): SessionLinksRow {
  if (sessionLinks === undefined || display === 'off') return { line: [], badge: null };
  const links = sessionLinks.items;
  if (links.length === 0) {
    // CDXC:SessionLinks 2026-10-24 DECISION: User: "why didn't we suggest #263 here for this session?" A session whose only links are suggestions shows a quiet badge counting them, under every option but Off (gx-core `SessionLinks::row`).
    const suggested = sessionLinks.suggested.length;
    return suggested > 0
      ? { line: [], badge: { count: suggested, color: SidebarPalette.MUTED, suggested: true } }
      : { line: [], badge: null };
  }
  switch (display) {
    case 'always':
      return { line: [...links], badge: null };
    case 'selected':
      return { line: selected ? [...links] : [], badge: null };
    case 'open':
      return { line: links.filter((link) => !link.finished), badge: null };
    case 'badge':
      return { line: [], badge: { count: links.length, color: mostPressingLinkColor(links), suggested: false } };
  }
}
