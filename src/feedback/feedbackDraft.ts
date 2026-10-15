/**
 * The issue a feedback message becomes on the phone: the same rules gxserver's draft
 * applies for the computer's Send Bug / Feedback pop-up, so an issue reads the same from
 * every app. The phone drafts on its own because it posts with no computer connected.
 *
 * CDXC:Feedback 2026-10-16 SEE-ALSO: server/src/feedback/draft.rs (`draft_title`,
 * `github_username`, `reporter_line`, `with_reporter`) and
 * apps/desktop/src/app/window/feedback_modal/state.rs (`github_username`) must keep these
 * rules and limits identical.
 */

/** The relay's limits on the issue text, counted in UTF-16 code units like its `length`. */
export const FEEDBACK_TITLE_MAX_UNITS = 120;
export const FEEDBACK_BODY_MAX_UNITS = 20_000;

/**
 * The username in `raw` without its `@`: `null` when it is empty, `undefined` when it is
 * not a GitHub username (letters, digits and single hyphens, no hyphen at either end, up
 * to 39 characters).
 */
export function githubUsername(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  const name = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (name.length === 0) return null;
  const valid =
    name.length <= 39 &&
    /^[A-Za-z0-9-]+$/.test(name) &&
    !name.startsWith('-') &&
    !name.endsWith('-') &&
    !name.includes('--');
  return valid ? name : undefined;
}

/** The issue's first line, which mentions the reporter. */
export function reporterLine(name: string): string {
  return `Reported by @${name}`;
}

/** The issue title a message starts as: its first non-empty line, whitespace collapsed,
 * cut at a word boundary with an ellipsis when it does not fit the relay's title limit. */
export function draftTitle(message: string): string {
  const firstLine =
    message
      .split(/\r?\n/)
      .map((line) => line.split(/\s+/).filter(Boolean).join(' '))
      .find((line) => line.length > 0) ?? '';
  if (firstLine.length <= FEEDBACK_TITLE_MAX_UNITS) return firstLine;
  let cut = '';
  for (const word of firstLine.split(' ')) {
    const candidate = cut.length === 0 ? word : `${cut} ${word}`;
    if (candidate.length + 1 > FEEDBACK_TITLE_MAX_UNITS) break;
    cut = candidate;
  }
  if (cut.length === 0) {
    // One word longer than the limit: cut it by characters.
    let units = 0;
    for (const character of firstLine) {
      units += character.length;
      if (units >= FEEDBACK_TITLE_MAX_UNITS) break;
      cut += character;
    }
  }
  return `${cut}…`;
}

/** The issue body: the reporter line on top, then the message. */
export function draftBody(message: string, name: string): string {
  return `${reporterLine(name)}\n\n${message.trim()}`;
}
