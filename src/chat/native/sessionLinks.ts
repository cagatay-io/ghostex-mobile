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

/**
 * What hovering a link says on the desktop, as the lines of the long-press menu's card: the full
 * title, then `#283 · GitHub issue`, `State: Open`, an open PR's checks and review (or the PR that
 * closes an issue), and `Repo: owner/repo` when the link is not in the session's own repo (gx-core
 * `SessionLink::hover_card_text`; the two must agree).
 */
export function sessionLinkCardLines(link: GhostexSessionLink): string[] {
  const loading = link.loading && link.title.length === 0;
  const title = link.title.length > 0 ? link.title : loading ? 'Loading…' : link.label;
  // CDXC:SessionLinks 2026-10-25 DECISION: User: "please make the tooltip just show the title and
  // branch, nothing else, no need to show the #123 again or show the state 'merged' thing". The
  // title, then a pull request's branch; as gx-core `hover_card_text`.
  const branch = link.kind === 'pullRequest' ? link.branch : '';
  return [title, branch].filter((line) => line.trim().length > 0);
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

/**
 * CDXC:SessionLinks 2026-10-27 DECISION:
 * User: "and also please make the sidebar show as badge by default". Badge is the default (the
 * computer's summary leaves the key out then); a computer set to another option sends it.
 */
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

/**
 * The colour of the most pressing link (gx-core `most_pressing_tone`): only open links colour it;
 * grey once every link is merged or closed.
 *
 * CDXC:SessionLinks 2026-10-27 DECISION:
 * User: "make the badge gray if it's merged (not open)". As gx-core's rule: a badge whose links are
 * all merged or closed is grey, not merged purple.
 */
export function mostPressingLinkColor(links: readonly GhostexSessionLink[]): string {
  let best = { rank: 4, color: SidebarPalette.WORK_DRAFT as string };
  for (const link of links) {
    if (link.finished) continue;
    const candidate =
      link.checks === 'failing' || link.review === 'changesRequested'
        ? { rank: 0, color: SidebarPalette.WORK_CLOSED }
        : link.review === 'reviewRequired' || link.checks === 'pending'
          ? { rank: 1, color: SidebarPalette.WORK_PENDING }
          : link.state !== 'draft'
            ? { rank: 2, color: sessionLinkLook(link).color }
            : { rank: 3, color: SidebarPalette.WORK_DRAFT };
    if (candidate.rank < best.rank) best = candidate;
  }
  return best.color;
}

/**
 * The list once `keys` are removed, before the computer publishes it: each leaves its group at once
 * and leads Removed, where Restore brings it back (gx-core `SessionLinks::without_removed`).
 *
 * CDXC:SessionLinks 2026-10-27 DECISION:
 * User: "please don't show undo here right away after i remove one. ther'es no need. i clicked twice
 * and confiremd already man". No "Removed · Undo" row; the removed link stays restorable under
 * Removed.
 */
export function sessionLinksWithoutRemoved(links: GhostexSessionLinks, keys: readonly string[]): GhostexSessionLinks {
  if (keys.length === 0) return links;
  const gone = links.items.filter((link) => keys.includes(link.key));
  if (gone.length === 0) return links;
  const known = new Set(links.removed.map((link) => link.key));
  return {
    items: links.items.filter((link) => !keys.includes(link.key)),
    suggested: links.suggested,
    removed: [...gone.filter((link) => !known.has(link.key)), ...links.removed],
  };
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
  // Pinned links lead `items` (gxserver sorts them first) and show under every option but Off;
  // under Badge the title row's badge counts the rest (gx-core `SessionLinks::row`).
  const pinned = links.filter((link) => link.pinned);
  switch (display) {
    case 'always':
      return { line: [...links], badge: null };
    case 'selected':
      return { line: selected ? [...links] : pinned, badge: null };
    case 'open':
      return { line: links.filter((link) => link.pinned || !link.finished), badge: null };
    case 'badge': {
      const rest = links.filter((link) => !link.pinned);
      return {
        line: pinned,
        badge: rest.length > 0 ? { count: rest.length, color: mostPressingLinkColor(rest), suggested: false } : null,
      };
    }
  }
}

/**
 * How many of a links line's chips fit in `available`, in order: the most that fit together with
 * the "+N" pill (`pillWidth` for its count) whenever any link is left out; `neverShown` links (the
 * finished ones under Open work only) count into "+N" too. gx-core `link_chips_that_fit`.
 */
export function linkChipsThatFit(
  chipWidths: readonly number[],
  neverShown: number,
  available: number,
  gap: number,
  pillWidth: (hidden: number) => number,
): number {
  for (let shown = chipWidths.length; shown >= 0; shown--) {
    const chips = chipWidths.slice(0, shown).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, shown - 1);
    const hidden = chipWidths.length - shown + neverShown;
    const pill = hidden === 0 ? 0 : pillWidth(hidden) + (shown > 0 ? gap : 0);
    if (chips + pill <= available) return shown;
  }
  return 0;
}
