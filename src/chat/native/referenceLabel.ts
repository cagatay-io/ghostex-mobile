/**
 * A reference's words, as the core writes them: `reference_label` in
 * packages/gx-chat-core/src/transcript/item_references.rs (and its `clean_line`, `cut`, and
 * `link_labels` in transcript/message_numbers.rs). The phone builds the links it copies and inserts
 * for questions and Live pages itself, so their words must match what the core writes for messages
 * and work items.
 */

/** The most characters a reference's words keep, the ellipsis included (`LABEL_MAX_CHARS`). */
const LABEL_MAX_CHARS = 25;
/** A line shorter than this ("ok", "-", "1.") is passed over for the next one (`SHORT_LINE_CHARS`). */
const SHORT_LINE_CHARS = 4;

const MARKS = ['- ', '* ', '+ ', '> ', '• '];

/** `[words](target)` as `words` (core `link_labels`). */
function linkLabels(line: string): string {
  let out = '';
  let rest = line;
  for (;;) {
    const open = rest.indexOf('[');
    if (open < 0) break;
    const after = rest.slice(open + 1);
    const close = after.indexOf('](');
    if (close < 0) break;
    const end = after.slice(close + 2).indexOf(')');
    if (end < 0) break;
    out += rest.slice(0, open) + after.slice(0, close);
    rest = after.slice(close + 2 + end + 1);
  }
  return out + rest;
}

/** `line` as words a pill can hold (core `clean_line`). */
function cleanLine(line: string): string {
  let rest = line.trim();
  for (;;) {
    const before = rest;
    for (const mark of MARKS) {
      if (rest.startsWith(mark)) rest = rest.slice(mark.length);
      rest = rest.trimStart();
    }
    const hashes = /^#+/u.exec(rest)?.[0].length ?? 0;
    if (hashes > 0 && rest.slice(hashes).startsWith(' ')) rest = rest.slice(hashes).trimStart();
    const digits = /^[0-9]+/u.exec(rest)?.[0].length ?? 0;
    if (digits > 0 && (rest.slice(digits).startsWith('. ') || rest.slice(digits).startsWith(') ')))
      rest = rest.slice(digits + 2).trimStart();
    if (rest === before) break;
  }
  if (rest === '-' || rest === '*' || rest === '+' || rest === '>' || rest === '•') rest = '';
  return linkLabels(rest)
    .replace(/[[\]]/gu, '')
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .join(' ');
}

/** `text` cut to `max` characters, the last one "…" when it was longer (core `cut`). */
function cut(text: string, max: number): string {
  const characters = Array.from(text);
  if (characters.length <= max) return text;
  return `${characters
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * The first line of `text` that is not empty and not super short, without list, quote and heading
 * marks or link markup, cut to 25 characters with "…"; the first line that is not empty when every
 * line is short; `fallback` (the tag) when there is none.
 */
export function referenceLabel(text: string, fallback: string): string {
  const lines = text
    .split('\n')
    .map((line) => cleanLine(line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
  const line = lines.find((each) => Array.from(each).length >= SHORT_LINE_CHARS) ?? lines[0] ?? fallback.trim();
  return cut(line, LABEL_MAX_CHARS);
}

/**
 * A question's link, `[<label of its title>](question:<session>.<tag>)`, the session left out when
 * it is empty or not a session ID like `G9jt7` (core `question_link`, `is_session_id`).
 */
export function questionLink(title: string, tag: string, sessionId = ''): string {
  const session = /^G[0-9][a-z0-9]*$/u.test(sessionId) ? `${sessionId}.` : '';
  return `[${referenceLabel(title, tag)}](question:${session}${tag})`;
}

/** A Live page's link, `[<label of its title>](page:<id>)` (core `page_link`). */
export function pageLink(title: string, id: string): string {
  return `[${referenceLabel(title, 'Live page')}](page:${id.toLowerCase()})`;
}

/** The 32-hex id in a Live page's address (`/visual/<id>`), or '' when it has none. */
export function pageIdOfUrl(url: string): string {
  return /\/visual\/([0-9a-f]{32})(?![0-9a-z])/iu.exec(url)?.[1]?.toLowerCase() ?? '';
}
