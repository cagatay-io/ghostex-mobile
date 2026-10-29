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
  /** The Badge option's badge: one link's ID (`label`) and "+N" (`more`) for the others, coloured by
   * the most pressing link; with `suggested`, the count of a session's suggestions while it has no
   * links, drawn muted and dashed. */
  badge: { count: number; color: string; suggested: boolean; label: string; more: number } | null;
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
    const candidate = pressingRank(link);
    if (candidate.rank < best.rank) best = candidate;
  }
  return best.color;
}

/** How pressing an open link is, lowest first, and its colour (gx-core `SessionLink::pressing_rank`). */
function pressingRank(link: GhostexSessionLink): { rank: number; color: string } {
  return link.checks === 'failing' || link.review === 'changesRequested'
    ? { rank: 0, color: SidebarPalette.WORK_CLOSED }
    : link.review === 'reviewRequired' || link.checks === 'pending'
      ? { rank: 1, color: SidebarPalette.WORK_PENDING }
      : link.state !== 'draft'
        ? { rank: 2, color: sessionLinkLook(link).color }
        : { rank: 3, color: SidebarPalette.WORK_DRAFT };
}

/**
 * A link badge's colour (the session row's badge and the chat's Links pill): the state's colour
 * muted to the desktop project header's diff numbers (desktop `session_link_badge_color` in
 * native_sidebar/link_chips.rs, whose CDXC:SessionLinks 2026-10-29 DECISION holds the user's words:
 * "make it match the color of the + lines that we have there in project header ... also please same
 * for the purple we have for merged or closed"). Open work takes the header's "+N" green, failing
 * checks or changes asked for its "-N" red, every other state its own hue at that softness; all at
 * the header's 70%. `light` picks the header's light values (the chat's light theme).
 */
export function linkBadgeColor(vivid: string, light = false): string {
  const [dark, lightValue] = LINK_BADGE_COLORS[vivid.toUpperCase()] ?? LINK_BADGE_COLORS[SidebarPalette.WORK_DRAFT]!;
  return `${light ? lightValue : dark}B3`;
}

/** Each state colour's muted badge colour, dark and light (the desktop's values). */
const LINK_BADGE_COLORS: Record<string, readonly [string, string]> = {
  [SidebarPalette.WORK_OPEN]: ['#9CC894', '#2A7A3A'],
  [SidebarPalette.WORK_CLOSED]: ['#DCA8A4', '#C43A42'],
  [SidebarPalette.WORK_MERGED]: ['#AA94C8', '#4B2A7A'],
  [SidebarPalette.WORK_DRAFT]: ['#AEAEAE', '#525252'],
  [SidebarPalette.WORK_PENDING]: ['#C8B794', '#7A5F2A'],
  [SidebarPalette.WORK_STARTED]: ['#C8BE94', '#7A6A2A'],
  [SidebarPalette.WORK_REVIEW]: ['#94C8AE', '#2A7A52'],
  [SidebarPalette.WORK_DONE]: ['#9497C8', '#2A2F7A'],
  [SidebarPalette.WORK_LINEAR]: ['#9497C8', '#2A2F7A'],
};

/**
 * The link the badge and the chat's Links pill name (gx-core `SessionLinks::badge_link`): the first
 * pinned one; else the most pressing open one, the first in the list on a tie; else the first.
 */
export function sessionLinksBadgeLink(links: readonly GhostexSessionLink[]): GhostexSessionLink | undefined {
  const pinned = links.find((link) => link.pinned);
  if (pinned !== undefined) return pinned;
  let best: { rank: number; link: GhostexSessionLink } | undefined;
  for (const link of links) {
    if (link.finished) continue;
    const rank = pressingRank(link).rank;
    if (best === undefined || rank < best.rank) best = { rank, link };
  }
  return best?.link ?? links[0];
}

/**
 * The badge's text: the named link's ID and how many others follow it as "+N" (gx-core
 * `SessionLinks::badge_label`, whose CDXC:SessionLinks 2026-10-28 DECISION holds the user's words:
 * "If we pin one link, or if it's just one link, we should show the ID for that link instead of just
 * showing the number of total links. Then we can put +3"; and its 2026-10-28 line "let's not show the
 * repo name here": a PR from another repo reads `#151`, not `maestro_ed#151`).
 */
export function sessionLinksBadgeLabel(links: readonly GhostexSessionLink[]): { label: string; more: number } | null {
  const link = sessionLinksBadgeLink(links);
  return link === undefined ? null : { label: sessionLinkBadgeId(link), more: links.length - 1 };
}

/**
 * The label without its repo name (gx-core `SessionLink::badge_id`): `maestro_ed#151` is `#151`;
 * `#151` and a Linear ID stay. The user: "let's not show the repo name here".
 */
export function sessionLinkBadgeId(link: GhostexSessionLink): string {
  const at = link.label.indexOf('#');
  return link.kind !== 'linear' && at >= 0 ? link.label.slice(at) : link.label;
}

/** The Links pill on the chat's bar above the composer (gx-core `SessionLinks::chat_pill`). */
export type SessionLinksChatPill = {
  /** The named link's ID (the badge's), or "3 suggested". */
  label: string;
  /** The other linked links, drawn "+N" in a lighter weight. */
  more: number;
  color: string;
  /** Only suggestions: drawn quietly (muted, dashed), like the sidebar's suggestions badge. */
  suggested: boolean;
  accessibilityLabel: string;
};

/**
 * The Links pill, or null with nothing to show (gx-core `SessionLinks::chat_pill`, whose
 * CDXC:SessionLinks 2026-10-28 DECISION holds the user's words: "move the links to always be in the
 * bar above the composer ... between Tasks and Threads ... The look of the pill needs to look like the
 * one we have in the sidebar"). The badge's text and colour; `muted` colours a suggestions-only pill.
 */
export function sessionLinksChatPill(
  links: GhostexSessionLinks | undefined,
  muted: string,
  light = false,
): SessionLinksChatPill | null {
  if (links === undefined) return null;
  const { items, suggested } = links;
  if (items.length === 0) {
    if (suggested.length === 0) return null;
    return {
      label: `${suggested.length} suggested`,
      more: 0,
      color: muted,
      suggested: true,
      accessibilityLabel: `Links, ${suggested.length} suggested`,
    };
  }
  const text = sessionLinksBadgeLabel(items);
  const named = sessionLinksBadgeLink(items);
  if (text === null || named === undefined) return null;
  const summary = sessionLinkSummary(named);
  return {
    label: text.label,
    more: text.more,
    color: linkBadgeColor(mostPressingLinkColor(items), light),
    suggested: false,
    accessibilityLabel: text.more > 0 ? `Links, ${summary} and ${text.more} more` : `Links, ${summary}`,
  };
}

/**
 * Suggestions the sheet shows before its "Show all" row (gx-core `SUGGESTED_SHOWN_FIRST`, whose
 * CDXC:SessionLinks 2026-10-27 DECISION holds the user's words: "5, then a Show all row").
 */
export const SUGGESTED_SHOWN_FIRST = 5;

/**
 * Linked links up to which the sheet opens with Suggested unfolded, whatever the saved fold says
 * (gx-core `SUGGESTED_OPEN_UP_TO_LINKED`, whose CDXC:SessionLinks 2026-10-28 DECISION holds the
 * user's words: "if there are 2 or fewer links, then expand Suggested in any case").
 */
export const SUGGESTED_OPEN_UP_TO_LINKED = 2;

/** Whether a sheet opening on `linkedCount` linked links shows Suggested unfolded. */
export function suggestedOpensUnfolded(linkedCount: number): boolean {
  return linkedCount <= SUGGESTED_OPEN_UP_TO_LINKED;
}

/** The suggestions the sheet draws: every one with `all`, else the first `SUGGESTED_SHOWN_FIRST`. */
export function suggestionsShown<T>(suggested: readonly T[], all: boolean): readonly T[] {
  return all ? suggested : suggested.slice(0, SUGGESTED_SHOWN_FIRST);
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
  // A suggestion's × dismisses it, which also lands it under Removed.
  const dismissed = links.suggested.filter((link) => keys.includes(link.key));
  if (gone.length === 0 && dismissed.length === 0) return links;
  const known = new Set(links.removed.map((link) => link.key));
  return {
    items: links.items.filter((link) => !keys.includes(link.key)),
    suggested: links.suggested.filter((link) => !keys.includes(link.key)),
    removed: [...[...gone, ...dismissed].filter((link) => !known.has(link.key)), ...links.removed],
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
      ? { line: [], badge: { count: suggested, color: SidebarPalette.MUTED, suggested: true, label: String(suggested), more: 0 } }
      : { line: [], badge: null };
  }
  // Pinned links lead `items` (gxserver sorts them first) and show under every option but Off and
  // Badge, whose badge names one and counts the rest (gx-core `SessionLinks::row`).
  const pinned = links.filter((link) => link.pinned);
  switch (display) {
    case 'always':
      return { line: [...links], badge: null };
    case 'selected':
      return { line: selected ? [...links] : pinned, badge: null };
    case 'open':
      return { line: links.filter((link) => link.pinned || !link.finished), badge: null };
    case 'badge': {
      const text = sessionLinksBadgeLabel(links);
      return {
        line: [],
        badge:
          text === null
            ? null
            : {
                count: links.length,
                color: linkBadgeColor(mostPressingLinkColor(links)),
                suggested: false,
                label: text.label,
                more: text.more,
              },
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
