/**
 * The format of `THIRD_PARTY_NOTICES.md`, shared by its generator (`scripts/notices/generate.ts`, which renders
 * it) and Settings › Licences (which parses the copy bundled into the app). Keeping both directions in one module
 * means the page reads exactly what the generator writes; the round trip is tested.
 *
 * The layout follows the notices file of the Ghostex main repo: a title, one intro sentence, then one `## ` entry
 * per component with a line that says what it is, its source and its licence, and its licence files verbatim in
 * fenced blocks. Entry headings are `name@version`, so a heading names the exact version its texts belong to.
 * Kept free of React Native so it runs under `bun test` and in the generator.
 */

export const NOTICES_TITLE = 'Third-party notices';

export const NOTICES_INTRO =
  'Ghostex includes the third-party software below. Each part keeps its own licence; this file reproduces the notices those licences require for binary distribution.';

/** One licence file of a component, as it reads in the component's source. */
export type NoticeText = { readonly file: string; readonly text: string };

export type NoticeEntry = {
  readonly name: string;
  readonly version: string;
  /** What the component is and what the app uses it for, one sentence. */
  readonly about: string;
  readonly url: string;
  /** The licence as the component declares it (an SPDX expression where it gives one); absent when it declares none. */
  readonly licence?: string;
  readonly texts: readonly NoticeText[];
};

export type ParsedNotices = { readonly intro: string; readonly entries: readonly NoticeEntry[] };

export function entryHeading(entry: Pick<NoticeEntry, 'name' | 'version'>): string {
  return `${entry.name}@${entry.version}`;
}

/** A fence longer than any backtick run inside the text, so a licence text can never close its own block. */
function fenceFor(text: string): string {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

export function renderNotices(entries: readonly NoticeEntry[], generatorNote: string): string {
  const out = [`# ${NOTICES_TITLE}`, '', NOTICES_INTRO, '', `<!-- ${generatorNote} -->`];
  for (const entry of entries) {
    const licence = entry.licence === undefined ? '' : `, ${entry.licence}`;
    out.push('', `## ${entryHeading(entry)}`, '', `${entry.about} <${entry.url}>${licence}:`);
    for (const { file, text } of entry.texts) {
      const fence = fenceFor(text);
      out.push('', `\`${file}\`:`, '', fence, text, fence);
    }
  }
  out.push('');
  return out.join('\n');
}

const SOURCE_LINE = /^(.*) <(https?:\/\/[^>\s]+)>(?:, (.+))?:$/;
const FILE_LINE = /^`([^`]+)`:$/;
const FENCE = /^(`{3,})$/;

/** Splits `name@version` at the last `@`, so scoped npm names (`@scope/name@1.0.0`) keep their own `@`. */
function splitHeading(heading: string): { name: string; version: string } | null {
  const at = heading.lastIndexOf('@');
  if (at <= 0 || at === heading.length - 1) return null;
  return { name: heading.slice(0, at), version: heading.slice(at + 1) };
}

/**
 * Reads a notices file written by {@link renderNotices}. Throws on a shape it did not write, so a damaged or
 * hand-edited file shows as an error on the page instead of silently missing entries.
 */
export function parseNotices(markdown: string): ParsedNotices {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== `# ${NOTICES_TITLE}`) throw new Error(`The notices file does not start with "# ${NOTICES_TITLE}".`);
  const introLines: string[] = [];
  let at = 1;
  for (; at < lines.length && !lines[at].startsWith('## '); at += 1) {
    const line = lines[at].trim();
    if (line !== '' && !line.startsWith('<!--')) introLines.push(line);
  }
  const entries: NoticeEntry[] = [];
  while (at < lines.length) {
    const heading = splitHeading(lines[at].slice(3));
    if (heading === null) throw new Error(`Notices heading "${lines[at]}" is not name@version.`);
    at += 1;
    let source: RegExpExecArray | null = null;
    const texts: NoticeText[] = [];
    let file: string | null = null;
    while (at < lines.length && !lines[at].startsWith('## ')) {
      const line = lines[at];
      at += 1;
      if (line === '') continue;
      const fence = FENCE.exec(line);
      const fileLine = FILE_LINE.exec(line);
      if (source === null) {
        source = SOURCE_LINE.exec(line);
        if (source === null) throw new Error(`Notices entry ${heading.name} has no source line.`);
      } else if (fence !== null && file !== null) {
        const body: string[] = [];
        for (; at < lines.length && lines[at] !== fence[1]; at += 1) body.push(lines[at]);
        if (at === lines.length) throw new Error(`A licence text of ${heading.name} is not closed.`);
        at += 1;
        texts.push({ file, text: body.join('\n') });
        file = null;
      } else if (fileLine !== null && file === null) {
        file = fileLine[1];
      } else {
        throw new Error(`Notices entry ${heading.name} has an unexpected line: ${line}`);
      }
    }
    if (source === null || file !== null || texts.length === 0) {
      throw new Error(`Notices entry ${heading.name} is incomplete.`);
    }
    entries.push({
      ...heading,
      about: source[1],
      url: source[2],
      ...(source[3] === undefined ? {} : { licence: source[3] }),
      texts,
    });
  }
  return { intro: introLines.join(' '), entries };
}

/**
 * A licence text as paragraphs for a narrow screen: the words stay exactly as in the file, only the hard line
 * breaks inside a paragraph become spaces (licence files wrap at about 80 columns, which would break every line
 * twice on a phone). Paragraphs are separated by blank lines in the file.
 */
export function licenceParagraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join(' '),
    )
    .filter((paragraph) => paragraph !== '');
}

/** The entries whose name contains `query`, ignoring case; all of them for an empty query. */
export function filterEntries(entries: readonly NoticeEntry[], query: string): readonly NoticeEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
}
