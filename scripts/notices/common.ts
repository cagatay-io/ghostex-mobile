/// <reference types="node" />
/**
 * Helpers shared by the notices collectors: running tools, reading licence files and fingerprinting the files the
 * app ships. Everything here fails loudly (`NoticesError`) instead of guessing, so a component whose licence or
 * version cannot be read stops the run with its name in the message.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import path from 'node:path';

import type { NoticeEntry, NoticeText } from '../../src/licences/notices';

export class NoticesError extends Error {}

export function fail(message: string): never {
  throw new NoticesError(message);
}

/** Where a component sits in the app; also the order of the notices file. */
export const GROUPS = ['native', 'font', 'asset', 'npm', 'ios', 'rust', 'go'] as const;
export type Group = (typeof GROUPS)[number];

export type Collected = NoticeEntry & { readonly group: Group };

export function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Runs a tool with its arguments as an array (never through a shell) and returns its stdout. */
export function run(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; what: string },
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  });
  if (result.error !== undefined) fail(`${options.what}: could not run ${command} (${result.error.message}).`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim().split('\n').slice(-12).join('\n');
    fail(`${options.what}: \`${command} ${args.join(' ')}\` failed in ${options.cwd}:\n${detail}`);
  }
  return result.stdout;
}

/**
 * A licence file's text for the notices: the file's own words, with only the line endings and a byte-order mark
 * normalised and the trailing blank lines dropped (the notices block ends the text itself).
 */
export function readLicenceText(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '');
}

/** The names a package source uses for its licence and notice files (`LICENSE`, `LICENCE.md`, `COPYING`, `NOTICE.txt`, …). */
export const LICENCE_FILE = /^(licen[cs]e|copying|notice)([._-].*)?$/i;

/** Every licence and notice file at the top of a package's source folder; fails naming the component when there is none. */
export function licenceTexts(dir: string, component: string): NoticeText[] {
  const files = readdirSync(dir)
    .filter((name) => LICENCE_FILE.test(name) && isFile(path.join(dir, name)))
    .sort();
  if (files.length === 0) fail(`No licence file (LICENSE*, COPYING*, NOTICE*) found for ${component} in ${dir}.`);
  return files.map((file) => ({ file, text: readLicenceText(path.join(dir, file)) }));
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256File(file: string): string {
  return sha256(readFileSync(file));
}

/**
 * One fingerprint for a folder: every file's path and content hash (a symlink's target), in sorted order. Dot files
 * (Finder's `.DS_Store`) are not part of what ships and are left out.
 */
export function sha256Tree(dir: string): string {
  const lines: string[] = [];
  const walk = (relative: string) => {
    for (const name of readdirSync(path.join(dir, relative)).sort()) {
      if (name.startsWith('.')) continue;
      const child = relative === '' ? name : `${relative}/${name}`;
      const absolute = path.join(dir, child);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) lines.push(`${child} -> ${readlinkSync(absolute)}`);
      else if (stat.isDirectory()) walk(child);
      else lines.push(`${child} ${sha256File(absolute)}`);
    }
  };
  walk('');
  return sha256(lines.join('\n'));
}

/** A JSON file read for a field the generator relies on; fails naming the file when it is missing or broken. */
export function readJson(file: string, what: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    fail(`${what}: ${file} is missing.`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${what}: ${file} is not valid JSON (${String(error)}).`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A repository URL from package metadata as a browsable https URL (`git+https://…/x.git` → `https://…/x`). */
export function browsableUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const github = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (github !== null) return `https://github.com/${github[1]}`;
  const url = raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git(#.*)?$/, '')
    .replace(/#.*$/, '');
  return /^https?:\/\/[^\s>]+$/.test(url) ? url : undefined;
}
