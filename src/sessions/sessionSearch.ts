/**
 * Session search: which open sessions a query keeps, in what order, and under
 * which day heading, as the desktop Quick Access Sessions tab decides it.
 *
 * CDXC:Sessions 2026-09-30 SEE-ALSO:
 * CDXC:Sessions 2026-11-27 DECISION: User (Q5274): "Bring chat search to the phone's Sessions search in the same change: search the words through the computer as you described and show the same matched-words line under each chat, matching the desktop's one list." With a query the computer also matches what was said in each chat (`ghostex previous-sessions --chat-search`, gxserver's chat index): closed rows carry `chatMatch`, open sessions' matches come as `chatMatches`, and the list is one list, best match first, with the matched words under each chat, as gx-core `visible_items` / `session_groups` order and draw it. A computer whose ghostex predates this sends neither, and the search reads as before.
 *
 * Port of the desktop's session search rules in packages/gx-core/src/quick_access/sessions.rs (`filter_sessions`, `normalize_search_value`, `matches_token`, `visible_items`, `session_groups`) and packages/gx-core/src/quick_access/session_titles.rs (`is_default_session_search_title`), themselves ported from packages/core-ui/previous-session-search.ts. The phone reaches gx-chat-core through UniFFI but not gx-core, so the rules are mirrored here: a change to how the desktop matches, filters, orders or groups sessions changes this file in the same commit. The mobile summary carries no session `detail`, so that one search field is absent on the phone. Closed sessions come from the computer's `ghostex previous-sessions` (server/src/ghostex_cli/previous_sessions.rs, over `/api/listPreviousSessions`) and go through `filter_previous` and `dedupe_previous` here, as the desktop's do.
 */

import { sessionAgentName } from '../contract/mobileSummary/agentIcons';
import { effectiveSessionTag, resolveSessionTag } from '../contract/sessionTags';
import type { GhostexCustomSessionTags, GhostexSession } from '../contract/mobileSummary';
import { SessionSearchCopy } from '../copy';

// ---------------------------------------------------------------------------
// Text normalization and matching (sessions.rs).
// ---------------------------------------------------------------------------

/** `normalize_search_value`: camelCase split, every run of non-letters one space, lowercase. */
export function normalizeSessionSearchValue(value: string | undefined): string {
  if (value === undefined || value.length === 0) return '';
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** `fuzzy_includes`: the query's characters in order anywhere in the text. */
function fuzzyIncludes(text: string, query: string): boolean {
  let queryIndex = 0;
  for (const character of text) {
    if (character !== query[queryIndex]) continue;
    queryIndex += 1;
    if (queryIndex >= query.length) return true;
  }
  return query.length === 0;
}

/** `single_edit_distance`: equal, or one insertion, deletion or substitution apart. */
function hasSingleEditDistance(candidate: string, query: string): boolean {
  if (candidate === query) return true;
  if (Math.abs(candidate.length - query.length) > 1) return false;
  let candidateIndex = 0;
  let queryIndex = 0;
  let edits = 0;
  while (candidateIndex < candidate.length && queryIndex < query.length) {
    if (candidate[candidateIndex] === query[queryIndex]) {
      candidateIndex += 1;
      queryIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (candidate.length > query.length) {
      candidateIndex += 1;
    } else if (candidate.length < query.length) {
      queryIndex += 1;
    } else {
      candidateIndex += 1;
      queryIndex += 1;
    }
  }
  return true;
}

function isLongQueryTypoCandidate(candidate: string, query: string): boolean {
  return candidate.length >= Math.max(4, query.length - 1) && hasSingleEditDistance(candidate, query);
}

function hasAdjacentWordSingleEditDistance(words: readonly string[], query: string): boolean {
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (let index = start; index < words.length; index += 1) {
      joined += words[index];
      if (joined.length > query.length + 1) break;
      if (isLongQueryTypoCandidate(joined, query)) return true;
    }
  }
  return false;
}

/** `matches_token`: short tokens match as ordered letters, long ones allow one typo. */
function matchesToken(searchText: string, query: string): boolean {
  if (query.length <= 3) return fuzzyIncludes(searchText, query);
  if (searchText.includes(query)) return true;
  const compact = searchText.replace(/\s+/g, '');
  if ((query.length >= 5 && compact.includes(query)) || hasSingleEditDistance(compact, query)) {
    return true;
  }
  const words = searchText.split(/\s+/).filter((word) => word.length > 0);
  return words.some((word) => isLongQueryTypoCandidate(word, query)) || hasAdjacentWordSingleEditDistance(words, query);
}

// ---------------------------------------------------------------------------
// Default titles a search never lists (session_titles.rs).
// ---------------------------------------------------------------------------

const IGNORED_PLACEHOLDER_SESSION_TITLES: readonly string[] = [
  'terminal session',
  'amp cli session',
  'amp session',
  'antigravity cli session',
  'antigravity session',
  'claude session',
  'claude code session',
  'codebuddy session',
  'code buddy session',
  'codex session',
  'codex cli session',
  'command code session',
  'commandcode session',
  'copilot session',
  'cursor agent session',
  'cursor cli session',
  'cursor session',
  'freebuff session',
  'deepseek harness session',
  'dsh session',
  'mastra session',
  'mastra code session',
  'devin session',
  'droid session',
  'factory droid session',
  'grok session',
  'grok build session',
  'hermes session',
  'hermes agent session',
  'kimi session',
  'kimi code session',
  'kiro session',
  'kiro cli session',
  'omp session',
  'openclaude session',
  'open claude session',
  'opencode session',
  'open code session',
  'openai codex session',
  'pi session',
  'qoder session',
  'qodercli session',
  'rovo session',
  'rovo dev session',
  'rovodev session',
];

const DEFAULT_SESSION_AGENT_TITLE_NAMES: readonly string[] = [
  'Antigravity',
  'Amp CLI',
  'Claude',
  'CodeBuddy',
  'Codex',
  'Command Code',
  'Copilot',
  'Cursor CLI',
  'Mastra Code',
  'Devin',
  'Factory Droid',
  'Empryo',
  'Freebuff',
  'DeepSeek Harness',
  'Grok Build',
  'Hermes Agent',
  'Kimi Code',
  'Kiro CLI',
  'OMP',
  'OpenClaude',
  'OpenCode',
  'Pi',
  'Qoder',
  'Rovo Dev',
];

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

const PLACEHOLDER_TITLES: ReadonlySet<string> = (() => {
  const titles = new Set<string>(IGNORED_PLACEHOLDER_SESSION_TITLES);
  for (const title of IGNORED_PLACEHOLDER_SESSION_TITLES) {
    if (title === 'terminal session') continue;
    if (title.endsWith(' session')) titles.add(`${title.slice(0, -' session'.length)} agent session`);
  }
  for (const name of DEFAULT_SESSION_AGENT_TITLE_NAMES) {
    const normalized = collapseWhitespace(name).toLowerCase();
    if (normalized.length === 0) continue;
    titles.add(`${normalized} session`);
    titles.add(`${normalized} agent session`);
    if (normalized.endsWith(' cli')) titles.add(`${normalized.slice(0, -' cli'.length)} agent session`);
  }
  return titles;
})();

/** `LEADING_TERMINAL_TITLE_STATUS_MARKER_PATTERN` and the `OC |` prefixes `normalize_terminal_title` strips. */
const LEADING_STATUS_MARKERS = /^[\s⠀-⣿·•⋅◦✳*∗✶✻✽✸✹✺✷✴◐◑◒◓✦◇🤖🔔]+/u;
const LEADING_OC_PREFIXES = /^(?:OC\s*\|\s*)+/iu;
/** Cursor CLI's ` - ✅ Ready` and ` - ⏳ Working ...` suffixes (`normalize_cursor_title`). */
const CURSOR_STATUS_SUFFIX = /\s*-\s*(?:✅ Ready|⏳ Working [.·]+)$/u;
const CODEX_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Freebuff's `Freebuff: <prompt>` title (`normalize_terminal_title`). */
const FREEBUFF_TITLE_PREFIX = 'Freebuff: ';
const EMPRYO_TITLE_SUFFIX = ' \u2014 empryo';
const EMPRYO_WORKING_SUFFIX = ' \u00b7 working';

/** `is_empryo_channel_tail`: nothing, or one parenthesised label such as ` (beta)`. */
function isEmpryoChannelTail(tail: string): boolean {
  return tail === '' || /^ \([^()]+\)$/u.test(tail);
}

/** `strip_empryo_title_suffix`: Empryo's `<tab> · working \u2014 Empryo (beta)` title is its tab name. */
function stripEmpryoTitleSuffix(title: string): string {
  const trimmed = title.trimEnd();
  // ASCII-only folding keeps offsets into `trimmed`, as gx-core's does.
  const folded = trimmed.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
  if (!folded.includes('empryo')) return title;
  let body: string;
  if (folded.startsWith('empryo') && isEmpryoChannelTail(folded.slice('empryo'.length))) {
    body = '';
  } else {
    const index = folded.lastIndexOf(EMPRYO_TITLE_SUFFIX);
    if (index < 0 || !isEmpryoChannelTail(folded.slice(index + EMPRYO_TITLE_SUFFIX.length))) {
      return title;
    }
    body = trimmed.slice(0, index);
  }
  body = body.trimEnd();
  if (body.endsWith(EMPRYO_WORKING_SUFFIX)) {
    body = body.slice(0, -EMPRYO_WORKING_SUFFIX.length).trimEnd();
  }
  return body.length === 0 ? 'Empryo' : body;
}

function isCodexSessionIdTitle(title: string): boolean {
  let sanitized = title.trim().replace(LEADING_STATUS_MARKERS, '').replace(LEADING_OC_PREFIXES, '').trim();
  if (sanitized.startsWith(FREEBUFF_TITLE_PREFIX)) {
    sanitized = sanitized.slice(FREEBUFF_TITLE_PREFIX.length).trim();
  }
  sanitized = stripEmpryoTitleSuffix(sanitized).replace(CURSOR_STATUS_SUFFIX, '').trim();
  return CODEX_SESSION_ID.test(sanitized);
}

/** `is_default_session_search_title`: creation defaults, numbers, paths and status words. */
export function isDefaultSessionSearchTitle(title: string): boolean {
  const normalized = collapseWhitespace(title);
  if (normalized.length === 0) return false;
  const lower = normalized.toLowerCase();
  return (
    /^session \d+$/.test(lower) ||
    isCodexSessionIdTitle(normalized) ||
    /^👻(?:\s+Terminal Session)?$/u.test(normalized) ||
    /^[\s.:[\](){}!|\/\\_-]*(?:done|error|idle|thinking|working)[\s.:[\](){}!|\/\\_-]*$/i.test(normalized) ||
    PLACEHOLDER_TITLES.has(lower) ||
    normalized.startsWith('~') ||
    normalized.startsWith('/') ||
    ['…/', '…\\', '.../', '...\\'].some((prefix) => normalized.startsWith(prefix))
  );
}

// ---------------------------------------------------------------------------
// The fields a search reads from an open or a closed session (`SessionFields`).
// ---------------------------------------------------------------------------

type SearchFields = {
  alias: string;
  displayTitle: string;
  primaryTitle: string;
  terminalTitle: string;
  sessionTag: string;
  isFavorite: boolean;
};

/** `card_title`: the first non-empty of the display, primary and terminal titles, else the alias. */
function cardTitle(fields: SearchFields): string {
  for (const value of [fields.displayTitle, fields.primaryTitle, fields.terminalTitle]) {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return fields.alias;
}

function searchText(fields: SearchFields, catalog: GhostexCustomSessionTags | undefined): string {
  const tag = effectiveSessionTag(fields) === undefined ? undefined : resolveSessionTag(fields, catalog);
  return [fields.alias, fields.displayTitle, fields.primaryTitle, fields.terminalTitle, tag?.label]
    .map((part) => normalizeSessionSearchValue(part))
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Whether every query word is in the searchable title text as typed (gx-core `title_match`). */
function titleHoldsWords(fields: SearchFields, query: string, catalog: GhostexCustomSessionTags | undefined): boolean {
  const text = searchText(fields, catalog);
  return normalizeSessionSearchValue(query)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .every((token) => text.includes(token));
}

/** `filter_sessions`: default titles never match; every query token must. */
function filterSearchable<T>(
  items: readonly T[],
  fieldsOf: (item: T) => SearchFields,
  query: string,
  catalog: GhostexCustomSessionTags | undefined,
): T[] {
  const tokens = normalizeSessionSearchValue(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return items.filter((item) => {
    const fields = fieldsOf(item);
    if (isDefaultSessionSearchTitle(cardTitle(fields))) return false;
    if (tokens.length === 0) return true;
    const text = searchText(fields, catalog);
    return tokens.every((token) => matchesToken(text, token));
  });
}

function openFields(session: GhostexSession): SearchFields {
  return {
    alias: session.alias,
    // The summary folds `title` into `displayTitle`; read it too so a row never loses its name.
    displayTitle: session.displayTitle.length > 0 ? session.displayTitle : session.title,
    primaryTitle: session.primaryTitle,
    terminalTitle: session.terminalTitle,
    sessionTag: session.sessionTag,
    isFavorite: session.isFavorite,
  };
}

export function sessionSearchTitle(session: GhostexSession): string {
  return cardTitle(openFields(session));
}

// ---------------------------------------------------------------------------
// Closed sessions (`ghostex previous-sessions --json`).
// ---------------------------------------------------------------------------

/** One closed session a computer can bring back, as `ghostex previous-sessions` prints it. */
export type ClosedSession = {
  projectId: string;
  sessionId: string;
  projectTitle: string;
  displayTitle: string;
  primaryTitle: string;
  terminalTitle: string;
  title: string;
  agentIcon: string;
  agentName: string;
  sessionTag: string;
  isFavorite: boolean;
  closedAt: string;
  lastActiveAt: string;
  isRestorable: boolean;
  restoreUnavailableReason: string;
  externalSession: boolean;
  forkBranchCount: number;
  /** The chat words that matched the query (`--chat-search`), when they did. */
  chatMatch: ChatMatch | null;
};

/** A chat whose words matched the query: the words from near the match and whose they are. */
export type ChatMatch = {
  projectId: string;
  sessionId: string;
  snippet: string;
  /** `user` (the person) or `assistant` (the agent). */
  source: string;
  /** gxserver's match quality: whole words 1, word starts 0.8, inside words 0.3, a phrase +0.25. */
  quality: number;
  /** Where the search words are in `snippet`, as string index ranges. */
  highlights: [number, number][];
};

export type ClosedSessionsPage = {
  sessions: ClosedSession[];
  cursor: string | null;
  /** Every chat match of the query, open sessions' included (`chatMatches`). */
  chatMatches: ChatMatch[];
};

/** gxserver's UTF-8 byte ranges as string index ranges of `text`. */
function byteRangesToIndexRanges(text: string, ranges: unknown): [number, number][] {
  if (!Array.isArray(ranges)) return [];
  const indexAtByte = new Map<number, number>();
  let bytes = 0;
  let index = 0;
  for (const character of text) {
    indexAtByte.set(bytes, index);
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    index += character.length;
  }
  indexAtByte.set(bytes, index);
  const out: [number, number][] = [];
  for (const range of ranges) {
    if (!Array.isArray(range) || typeof range[0] !== 'number' || typeof range[1] !== 'number') continue;
    const start = indexAtByte.get(range[0]);
    const end = indexAtByte.get(range[1]);
    if (start !== undefined && end !== undefined && start < end) out.push([start, end]);
  }
  return out;
}

function parseChatMatch(value: unknown, projectId: string, sessionId: string): ChatMatch | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const snippet = typeof row.snippet === 'string' ? row.snippet : '';
  if (snippet.length === 0) return null;
  return {
    projectId,
    sessionId,
    snippet,
    source: text(row, 'source'),
    quality: typeof row.quality === 'number' ? row.quality : 0,
    highlights: byteRangesToIndexRanges(snippet, row.highlights),
  };
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function parseClosedSessionsPage(json: Record<string, unknown> | null): ClosedSessionsPage {
  const results = Array.isArray(json?.results) ? json.results : [];
  const sessions: ClosedSession[] = [];
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const projectId = text(row, 'projectId');
    const sessionId = text(row, 'sessionId');
    if (projectId.length === 0 || sessionId.length === 0) continue;
    sessions.push({
      projectId,
      sessionId,
      projectTitle: text(row, 'projectTitle'),
      displayTitle: text(row, 'displayTitle'),
      primaryTitle: text(row, 'primaryTitle'),
      terminalTitle: text(row, 'terminalTitle'),
      title: text(row, 'title'),
      agentIcon: text(row, 'agentIcon'),
      agentName: text(row, 'agentName'),
      sessionTag: text(row, 'sessionTag'),
      isFavorite: row.isFavorite === true,
      closedAt: text(row, 'closedAt'),
      lastActiveAt: text(row, 'lastActiveAt'),
      isRestorable: row.isRestorable !== false,
      restoreUnavailableReason: text(row, 'restoreUnavailableReason'),
      externalSession: row.externalSession === true,
      forkBranchCount: typeof row.forkBranchCount === 'number' ? row.forkBranchCount : 0,
      chatMatch: parseChatMatch(row.chatMatch, projectId, sessionId),
    });
  }
  const cursor = typeof json?.cursor === 'string' && json.cursor.length > 0 ? json.cursor : null;
  const chatMatches: ChatMatch[] = [];
  for (const entry of Array.isArray(json?.chatMatches) ? json.chatMatches : []) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const found = parseChatMatch(row, text(row, 'projectId'), text(row, 'sessionId'));
    if (found !== null && found.projectId.length > 0 && found.sessionId.length > 0) chatMatches.push(found);
  }
  return { sessions, cursor, chatMatches };
}

function closedFields(session: ClosedSession): SearchFields {
  // The desktop's previous-session item: `alias` is the row's title, `primaryTitle` falls back to it.
  const title =
    [session.displayTitle, session.primaryTitle, session.title].find((value) => value.length > 0) ?? 'Previous Session';
  return {
    alias: title,
    displayTitle: session.displayTitle,
    primaryTitle: session.primaryTitle.length > 0 ? session.primaryTitle : title,
    terminalTitle: session.terminalTitle,
    sessionTag: session.sessionTag,
    isFavorite: session.isFavorite,
  };
}

/** `SESSIONS_VISIBLE_WINDOW_MS`: with no query, closed sessions older than this stay out. */
export const CLOSED_SESSIONS_VISIBLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function closedTimestamp(session: ClosedSession): number {
  return parseTimestamp(session.closedAt);
}

/** `dedupe_previous`: one row per project and title (forked branches kept apart), the newest closed. */
function dedupeClosed(sessions: readonly ClosedSession[]): ClosedSession[] {
  const kept = new Map<string, { index: number; stamp: number }>();
  sessions.forEach((session, index) => {
    const historyId = `${session.projectId}:${session.sessionId}`;
    let key = historyId;
    if (!session.externalSession) {
      const project = normalizeSessionSearchValue(session.projectId || session.projectTitle);
      const scoped = project.length > 0 ? project : `history:${historyId}`;
      const branch = session.forkBranchCount !== 0 ? `\u0000branch:${session.sessionId}` : '';
      key = `${scoped}\u0000${normalizeSessionSearchValue(cardTitle(closedFields(session)))}${branch}`;
    }
    const closed = closedTimestamp(session);
    const stamp = closed !== 0 ? closed : parseTimestamp(session.lastActiveAt);
    const existing = kept.get(key);
    if (existing !== undefined && existing.stamp >= stamp) return;
    kept.set(key, { index, stamp });
  });
  return [...kept.values()]
    .map((entry) => entry.index)
    .sort((left, right) => left - right)
    .map((index) => sessions[index]);
}

// ---------------------------------------------------------------------------
// Rows and day groups (visible_items / session_groups).
// ---------------------------------------------------------------------------

/** One computer's sessions, as the search reads them. */
export type SessionSearchSource = {
  machineId: string;
  /** Appended to each row's project label when the search spans several computers. */
  machineLabel: string;
  customSessionTags: GhostexCustomSessionTags | undefined;
  /** Open sessions with the project label each shows (`Chats` for chat projects). */
  open: readonly { session: GhostexSession; projectLabel: string }[];
  /** Closed sessions the computer reported for this query, newest closed first. */
  closed: readonly ClosedSession[];
  /** The chats whose words matched this query, open sessions' included. */
  chatMatches?: readonly ChatMatch[];
};

/** A row's second line: whose words matched, the words, and where the search words are in them. */
export type SessionSearchChatLine = {
  who: string;
  text: string;
  highlights: [number, number][];
};

type SessionSearchRowBase = {
  key: string;
  machineId: string;
  title: string;
  projectLabel: string;
  timestamp: number;
  customSessionTags: GhostexCustomSessionTags | undefined;
  agentIcon: string;
  agentName: string;
  sessionTag: string;
  isFavorite: boolean;
  /** Where the search words are in `title`; empty without a query. */
  titleHighlights: [number, number][];
  /** The chat words that matched the search, drawn under the title. */
  chatLine: SessionSearchChatLine | null;
  /** How well the row matches the query (`match_score`); 0 without one. */
  score: number;
};

export type SessionSearchRow =
  | (SessionSearchRowBase & { kind: 'open'; session: GhostexSession })
  | (SessionSearchRowBase & { kind: 'closed'; closed: ClosedSession });

export type SessionSearchGroup = {
  heading: string;
  rows: SessionSearchRow[];
};

function parseTimestamp(value: string): number {
  if (value.length === 0) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `day_label`: `Tuesday, September 30, 2026` in the phone's time zone. */
function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** `relative_time(stamp, false, now).0`: `12s`, `5m`, `3h`, `2d`. */
export function sessionSearchRelativeTime(timestamp: number, nowMs: number): string {
  if (timestamp === 0) return '';
  const seconds = Math.floor(Math.max(0, nowMs - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function withMachine(projectLabel: string, machineLabel: string): string {
  return [projectLabel, machineLabel].filter((part) => part.length > 0).join(' · ');
}

/** Where `words` are in `text`, ignoring case, as merged index ranges (gx-core `word_highlights`). */
function wordRanges(text: string, words: readonly string[]): [number, number][] {
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return [];
  const ranges: [number, number][] = [];
  for (const word of words) {
    if (word.length === 0) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      ranges.push([at, at + word.length]);
      from = at + word.length;
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** The query's words, lowercased, the way gxserver splits them. */
function searchWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * `match_score`: a title that holds the words beats any chat match; a chat match ranks by the
 * computer's quality; a title that matched only as a typo ranks between word starts and inside words.
 */
function matchScore(titleMatched: boolean, titleExact: boolean, chat: ChatMatch | null): number {
  const quality = chat?.quality ?? 0;
  if (!titleMatched) return quality;
  return titleExact ? 2 + quality : Math.max(0.5, quality);
}

function chatLine(found: ChatMatch | null, agentName: string, words: readonly string[]): SessionSearchChatLine | null {
  if (found === null) return null;
  return {
    who: found.source === 'user' ? 'You' : agentName.length > 0 ? agentName : 'Agent',
    text: found.snippet,
    highlights: found.highlights.length > 0 ? found.highlights : wordRanges(found.snippet, words),
  };
}

export type SessionSearchOptions = {
  /** Closed sessions only (a project's History, mirroring gx-core `SessionScope::Closed`). */
  closedOnly?: boolean;
  /** Restrict results to one project id and lift the 14-day window (gx-core `has_filters`). */
  projectId?: string;
};

/**
 * The sessions a query keeps, open and closed. Without a query: newest first (open by last use,
 * closed by when they closed) and grouped by day. With one: one list, best match first, chats
 * matched by their words included (`chatMatches`, each closed row's `chatMatch`). Every query token must match;
 * with no query, open sessions named only by a creation default stay out and
 * closed ones older than two weeks do, as on the desktop.
 */
export function searchSessions(
  sources: readonly SessionSearchSource[],
  query: string,
  nowMs: number,
  options?: SessionSearchOptions,
): SessionSearchGroup[] {
  const queryEmpty = query.trim().length === 0;
  const closedOnly = options?.closedOnly === true;
  const projectId = options?.projectId?.trim() ?? '';
  const hasProjectFilter = projectId.length > 0;
  const cutoff = nowMs - CLOSED_SESSIONS_VISIBLE_WINDOW_MS;
  const words = searchWords(query.trim());
  const rows: SessionSearchRow[] = [];
  for (const source of sources) {
    const catalog = source.customSessionTags;
    const chatByKey = new Map<string, ChatMatch>();
    if (!queryEmpty) {
      for (const found of source.chatMatches ?? []) chatByKey.set(`${found.projectId}\u0000${found.sessionId}`, found);
    }
    if (!closedOnly) {
      const openPool = hasProjectFilter
        ? source.open.filter((entry) => entry.session.projectId === projectId)
        : source.open;
      const titleMatched = new Set(filterSearchable(openPool, (entry) => openFields(entry.session), query, catalog));
      for (const entry of openPool) {
        const { session, projectLabel } = entry;
        const chat = chatByKey.get(`${session.projectId}\u0000${session.sessionId}`) ?? null;
        const matched = titleMatched.has(entry);
        if (!matched && chat === null) continue;
        const exact = matched && !queryEmpty && titleHoldsWords(openFields(session), query, catalog);
        const title = sessionSearchTitle(session);
        const agentName = session.agentName.length > 0 ? session.agentName : session.agent;
        rows.push({
          kind: 'open',
          session,
          key: `open:${source.machineId}:${session.sessionId}`,
          machineId: source.machineId,
          title,
          projectLabel: withMachine(projectLabel, source.machineLabel),
          timestamp: parseTimestamp(session.lastInteractionAt),
          customSessionTags: catalog,
          agentIcon: session.agentIcon,
          agentName,
          sessionTag: session.sessionTag,
          isFavorite: session.isFavorite,
          titleHighlights: wordRanges(title, words),
          chatLine: chatLine(chat, sessionAgentName(session), words),
          score: queryEmpty ? 0 : matchScore(matched, exact, chat),
        });
      }
    }
    // `filter_previous`: no web pages, deduped, then the query; an empty query keeps every title.
    const closedPool = source.closed.filter(
      (session) => session.agentIcon !== 'browser' && (!hasProjectFilter || session.projectId === projectId),
    );
    const deduped = dedupeClosed(closedPool);
    const titleMatched = queryEmpty ? deduped : filterSearchable(deduped, closedFields, query, catalog);
    const titleSet = new Set(titleMatched);
    // A closed chat whose words matched stays even when a newer session of the same title stands for it.
    const chatMatched = queryEmpty
      ? []
      : closedPool.filter((closed) => closed.chatMatch !== null && !titleSet.has(closed));
    for (const closed of [...titleMatched, ...chatMatched]) {
      const timestamp = closedTimestamp(closed);
      if (queryEmpty && !hasProjectFilter && timestamp < cutoff) continue;
      const matched = titleSet.has(closed);
      const chat = queryEmpty ? null : closed.chatMatch;
      const exact = matched && !queryEmpty && titleHoldsWords(closedFields(closed), query, catalog);
      const title = cardTitle(closedFields(closed));
      rows.push({
        kind: 'closed',
        closed,
        key: `closed:${source.machineId}:${closed.projectId}:${closed.sessionId}`,
        machineId: source.machineId,
        title,
        projectLabel: withMachine(closed.projectTitle, source.machineLabel),
        timestamp,
        customSessionTags: catalog,
        agentIcon: closed.agentIcon,
        agentName: closed.agentName,
        sessionTag: closed.sessionTag,
        isFavorite: closed.isFavorite,
        titleHighlights: wordRanges(title, words),
        chatLine: chatLine(
          chat,
          sessionAgentName({ agent: closed.agentName, agentName: closed.agentName, agentIcon: closed.agentIcon }),
          words,
        ),
        score: queryEmpty ? 0 : matchScore(matched, exact, chat),
      });
    }
  }
  rows.sort(
    (left, right) =>
      right.score - left.score || right.timestamp - left.timestamp || left.key.localeCompare(right.key),
  );
  // A search is one list, best match first (as the desktop's), so no day headings.
  if (!queryEmpty) return rows.length === 0 ? [] : [{ heading: '', rows }];
  const groups: SessionSearchGroup[] = [];
  for (const row of rows) {
    const heading = row.timestamp === 0 ? SessionSearchCopy.unknownDay : dayLabel(row.timestamp);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.heading === heading) {
      last.rows.push(row);
    } else {
      groups.push({ heading, rows: [row] });
    }
  }
  return groups;
}
