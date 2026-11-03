/// <reference types="node" />
/**
 * Writes src/theme/ghosttyThemes.json: the colours of the Ghostty themes the phone offers as terminal palettes next to
 * the twenty preset palettes in src/theme/presets, read the way the Mac reads them (`gpui_terminal_theme` in
 * apps/desktop/src/terminal_gpui_engine.rs). Usage, from the repo root:
 *
 *   bun run generate:ghostty-themes -- --host <Ghostex main repo checkout> [--kept <file>]
 *
 * Inputs, all pinned:
 *   - the names the Mac's Settings offers: the `terminalGhosttyTheme` options in the checkout's
 *     skills/ghostex-help/references/settings-catalog.json, without the "Use terminal config file" sentinel and the
 *     `Ghostex …` preset palettes (the phone carries those in src/theme/presets);
 *   - the theme files: the `iterm2_themes` package of the checkout's .dependencies/ghostty/build.zig.zon, the
 *     iTerm2-Color-Schemes release named in the `iterm2ColorSchemes` entry of scripts/notices/pinned.ts, as
 *     `zig build --fetch` put it into .dependencies/ghostty/zig-pkg/<hash>/;
 *   - that collection's licenses.yml at the commit after that release, downloaded and checked against its SHA-256.
 *
 * CDXC:Theming DECISION: the phone bundles only the Ghostty themes with a known
 * licence compatible with the app (GPL-3.0), each with its notice, plus the preset palettes. A theme is kept when
 * licenses.yml records one of KEPT_LICENCES under its exact name and EXCLUDED does not name it; `nonfree`, `unknown`,
 * GPL-2.0-only and a name without an entry are dropped, and any other licence stops the run until it is classified
 * here. Every kept theme must be listed by an entry of its licence in scripts/notices/pinned.ts (the collection's entry
 * for the licences without notice conditions), so the notices cover each palette that ships. `--kept` writes the kept
 * and dropped names with their licence and source, for the desktop, which is to offer the same selection.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from './notices/common';
import { PINNED, type PinnedComponent, type PinnedId } from './notices/pinned';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = 'src/theme/ghosttyThemes.json';
const LICENCES_COMMIT = 'f6fc23cea088fe144ab0d8c604199afcc3c5da8e';
const LICENCES_URL = `https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/${LICENCES_COMMIT}/licenses.yml`;
const LICENCES_SHA256 = '056595904a0f42a439feb908dc75c824c60ff233a34b01e39f28a7b9593ef845';
const UNMANAGED = '__ghostex_ghostty_theme_unmanaged__';

/** Licences the app (GPL-3.0) may ship palettes under. */
export const KEPT_LICENCES: ReadonlySet<string> = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Zlib',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
  'WTFPL',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'CC-BY-SA-4.0',
]);

/**
 * Themes dropped although licenses.yml records a kept licence (or has no entry under the offered name), because other
 * evidence leaves their rights unclear. CDXC:Theming DECISION: derived from the licence selection above and
 * the rule that no theme ships with unclear rights.
 */
export const EXCLUDED: Readonly<Record<string, string>> = {
  'Material Darker':
    'licenses.yml records MIT, but its own note says the colours match Material Darker from material.nvim, which is GPL-2.0',
  Molokai: 'licenses.yml records MIT, but the project licence says the Monokai theme is copyright Wimer Hazenberg',
  'Night Owlish Light':
    'licenses.yml records MIT, but the project states no licence of its own; MIT only through its base, Night Owl',
  'Overnight Slumber':
    'licenses.yml records MIT, but the project states no licence of its own; MIT only through its base, Night Owl',
  hazyland: 'licenses.yml has no entry under this name',
};
/** Kept licences whose themes need no notice entry of their own; the collection's entry lists them. */
export const NO_NOTICE_LICENCES: ReadonlySet<string> = new Set(['CC0-1.0', 'Unlicense', '0BSD', 'WTFPL']);
/** Not redistributable (`nonfree`), no licence found (`unknown`), or incompatible with GPL-3.0. */
export const DROPPED_LICENCES: ReadonlySet<string> = new Set(['nonfree', 'unknown', 'GPL-2.0-only']);

export type ThemeLicence = { readonly licence: string; readonly source: string };
export type Verdict =
  { readonly kept: true; readonly licence: string } | { readonly kept: false; readonly reason: string };

/** A single-quoted YAML scalar's lines as one string: line breaks fold to a space, a blank line to a newline. */
function foldQuoted(lines: readonly string[]): string {
  let folded = '';
  for (const [at, line] of lines.map((raw) => raw.trim()).entries()) {
    if (at === 0) folded = line;
    else if (line === '') folded += '\n';
    else folded += folded.endsWith('\n') ? line : ` ${line}`;
  }
  return folded.replaceAll("''", "'");
}

/**
 * The entries of licenses.yml: `<name>:` lines, each followed by indented `license`, `source` and `note` scalars,
 * plain or single-quoted. Anything else stops the run, so a format change is never read wrong.
 */
export function parseLicences(yaml: string): ReadonlyMap<string, ThemeLicence> {
  const entries = new Map<string, Record<string, string>>();
  const lines = yaml.split('\n');
  let current: Record<string, string> | null = null;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]!;
    if (line.trim() === '' || line.startsWith('#')) continue;
    const key = /^(?:'((?:[^']|'')*)'|([^\s'#][^:]*)):$/.exec(line);
    if (key !== null) {
      const name = key[1] === undefined ? key[2]! : key[1].replaceAll("''", "'");
      if (entries.has(name)) throw new Error(`licenses.yml lists ${name} twice`);
      current = {};
      entries.set(name, current);
      continue;
    }
    const field = /^ {2}(license|source|note): (.*)$/.exec(line);
    if (field === null || current === null) throw new Error(`licenses.yml line ${at + 1} is not understood: ${line}`);
    let value = field[2]!;
    if (value.startsWith("'")) {
      const quoted = [value.slice(1)];
      while (!/(^|[^'])('')*'$/.test(quoted.at(-1)!) || quoted.at(-1) === '') {
        at += 1;
        if (at === lines.length) throw new Error(`licenses.yml ends inside a quoted ${field[1]}`);
        quoted.push(lines[at]!);
      }
      quoted[quoted.length - 1] = quoted.at(-1)!.slice(0, -1);
      value = foldQuoted(quoted);
    }
    current[field[1]!] = value;
  }
  const licences = new Map<string, ThemeLicence>();
  for (const [name, entry] of entries) {
    if (entry.license === undefined || entry.source === undefined) {
      throw new Error(`licenses.yml entry ${name} has no license or source`);
    }
    licences.set(name, { licence: entry.license, source: entry.source });
  }
  return licences;
}

/** Whether theme `name` ships: only an exact licenses.yml entry with a kept licence, not EXCLUDED, keeps it. */
export function themeVerdict(name: string, licences: ReadonlyMap<string, ThemeLicence>): Verdict {
  if (Object.hasOwn(EXCLUDED, name)) return { kept: false, reason: 'excluded' };
  const entry = licences.get(name);
  if (entry === undefined) return { kept: false, reason: 'no licenses.yml entry' };
  if (KEPT_LICENCES.has(entry.licence)) return { kept: true, licence: entry.licence };
  if (DROPPED_LICENCES.has(entry.licence)) return { kept: false, reason: entry.licence };
  throw new Error(`${name}: licence ${entry.licence} is not classified; add it to KEPT_LICENCES or DROPPED_LICENCES`);
}

/**
 * What the notices lack for the kept themes: a theme no entry in pinned.ts lists, or one whose licence needs a notice
 * but no entry of that licence lists it.
 */
export function missingNotices(kept: ReadonlyMap<string, string>): string[] {
  const listing = new Map<string, PinnedComponent[]>();
  for (const id of Object.keys(PINNED) as PinnedId[]) {
    const component: PinnedComponent = PINNED[id];
    for (const theme of component.themes ?? []) listing.set(theme, [...(listing.get(theme) ?? []), component]);
  }
  const missing: string[] = [];
  for (const [name, licence] of kept) {
    const components = listing.get(name) ?? [];
    if (components.length === 0) missing.push(`${name} (${licence}): no entry lists it`);
    else if (!NO_NOTICE_LICENCES.has(licence) && !components.some((component) => component.licence === licence)) {
      missing.push(`${name} (${licence}): no ${licence} entry lists it`);
    }
  }
  return missing;
}

/** Six hex digits with or without `#`, as the Mac's `parse_theme_rgb`; null for anything else. */
function rgb(value: string): string | null {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null;
}

const ROLES: Readonly<Record<string, string>> = {
  background: 'background',
  foreground: 'foreground',
  'cursor-color': 'cursor',
  'cursor-text': 'cursorText',
  'selection-background': 'selectionBackground',
};

/** The Mac's `gpui_terminal_theme`: background and foreground required, ANSI 0-15 from `palette = N=color`. */
function readTheme(themesDir: string, name: string): Record<string, string | string[]> {
  const theme: Record<string, string> = {};
  const ansi: string[] = [];
  for (const raw of readFileSync(path.join(themesDir, name), 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    const role = ROLES[key];
    if (role !== undefined) {
      const color = rgb(value);
      if (color === null) delete theme[role];
      else theme[role] = color;
    } else if (key === 'palette') {
      const split = value.indexOf('=');
      const index = Number(value.slice(0, split).trim());
      const color = rgb(value.slice(split + 1).trim());
      // The Mac drops the whole theme on a malformed palette line; fail instead of shipping it.
      if (split < 0 || !Number.isInteger(index) || color === null) throw new Error(`${name}: bad line "${line}"`);
      if (index < 16) ansi[index] = color;
    }
  }
  if (theme.background === undefined || theme.foreground === undefined) {
    throw new Error(`${name}: no background or foreground`);
  }
  for (let index = 0; index < 16; index += 1) {
    if (ansi[index] === undefined) throw new Error(`${name}: palette ${index} is not set`);
  }
  const ordered: Record<string, string | string[]> = { background: theme.background, foreground: theme.foreground };
  for (const role of ['cursor', 'selectionBackground', 'cursorText']) {
    if (theme[role] !== undefined) ordered[role] = theme[role];
  }
  ordered.ansi = ansi;
  return ordered;
}

function parseArgs(argv: readonly string[]): { host: string; kept: string | null } {
  let host: string | undefined;
  let kept: string | null = null;
  for (let at = 0; at < argv.length; at += 1) {
    const value = argv[at + 1];
    if (argv[at] === '--host' && value !== undefined) host = path.resolve(argv[++at]!);
    else if (argv[at] === '--kept' && value !== undefined) kept = path.resolve(argv[++at]!);
    else throw new Error(`Unknown argument ${argv[at]}. Usage: --host <Ghostex main repo> [--kept <file>]`);
  }
  if (host === undefined) throw new Error('The Ghostex main repo checkout is missing: pass it with --host <path>.');
  return { host, kept };
}

async function main(): Promise<void> {
  const { host, kept: keptFile } = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(
    readFileSync(path.join(host, 'skills/ghostex-help/references/settings-catalog.json'), 'utf8'),
  );
  const row = catalog.settings.find((setting: { key: string }) => setting.key === 'terminalGhosttyTheme');
  if (row === undefined) throw new Error('settings-catalog.json has no terminalGhosttyTheme row');
  const offered: string[] = row.options
    .map((option: { value: string }) => option.value)
    .filter((value: string) => value !== UNMANAGED && !value.startsWith('Ghostex '));

  const release = PINNED.iterm2ColorSchemes.version;
  const zon = readFileSync(path.join(host, '.dependencies/ghostty/build.zig.zon'), 'utf8');
  const pin = /\.iterm2_themes\s*=\s*\.\{\s*\.url\s*=\s*"([^"]+)",\s*\.hash\s*=\s*"([^"]+)"/.exec(zon);
  if (pin === null) throw new Error('build.zig.zon has no iterm2_themes url/hash');
  if (pin[1] !== `https://deps.files.ghostty.org/ghostty-themes-${release}.tgz`) {
    throw new Error(
      `Ghostty now fetches ${pin[1]}, not ${release}: pin the licenses.yml of that release here and update the ` +
        'iterm2ColorSchemes entry in scripts/notices/pinned.ts first.',
    );
  }
  const themesDir = path.join(host, '.dependencies/ghostty/zig-pkg', pin[2]!);
  if (!statSync(themesDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${themesDir} is missing: fetch the Ghostty dependencies (zig build --fetch) first`);
  }

  const response = await fetch(LICENCES_URL);
  if (!response.ok) throw new Error(`${LICENCES_URL}: HTTP ${response.status}`);
  const yaml = Buffer.from(await response.arrayBuffer());
  if (sha256(yaml) !== LICENCES_SHA256)
    throw new Error(`${LICENCES_URL} does not match its SHA-256 ${LICENCES_SHA256}`);
  const licences = parseLicences(yaml.toString('utf8'));

  const kept = new Map<string, string>();
  const dropped: { name: string; reason: string }[] = [];
  for (const name of [...offered].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const verdict = themeVerdict(name, licences);
    if (verdict.kept) kept.set(name, verdict.licence);
    else dropped.push({ name, reason: verdict.reason });
  }
  const missing = missingNotices(kept);
  if (missing.length > 0) {
    throw new Error(
      `The notices do not cover these kept themes (scripts/notices/pinned.ts):\n  ${missing.join('\n  ')}`,
    );
  }

  const themes = Object.fromEntries([...kept.keys()].map((name) => [name, readTheme(themesDir, name)]));
  const output = `${JSON.stringify(themes, null, 2)}\n`;
  writeFileSync(path.join(REPO, OUTPUT), output);
  if (keptFile !== null) {
    const listed = (name: string) => ({ name, ...licences.get(name) });
    const report = {
      release,
      licencesYml: LICENCES_URL,
      kept: [...kept.keys()].map(listed),
      dropped: dropped.map(({ name, reason }) => ({
        ...listed(name),
        reason: reason === 'excluded' ? `excluded: ${EXCLUDED[name]}` : reason,
      })),
    };
    writeFileSync(keptFile, `${JSON.stringify(report, null, 2)}\n`);
  }
  const reasons = new Map<string, number>();
  for (const { reason } of dropped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  process.stdout.write(
    `${OUTPUT}: ${kept.size} of ${offered.length} themes from ${release} (dropped: ${[...reasons]
      .map(([reason, count]) => `${reason} ${count}`)
      .join(', ')}); sha256 ${sha256(output)} for GENERATED_DATA_FILES.\n`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`generate-ghostty-themes: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
