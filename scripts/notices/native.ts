/**
 * The notices for what the repo ships as files rather than as packages: the prebuilt native code under
 * `modules/ghostex-native/ios/Vendor`, the bundled fonts and generated source files carrying third-party data.
 * Their licence copies live in `third-party/` (see `pinned.ts`); every shipped file is fingerprinted, so a changed
 * or new file stops the run until its components and licence copies are updated.
 */

import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  fail,
  isDirectory,
  isFile,
  readLicenceText,
  sha256File,
  sha256Tree,
  type Collected,
  type Group,
} from './common';
import {
  FONT_FILES,
  GENERATED_DATA_FILES,
  HOST_BUILT_VENDOR_FOLDERS,
  PINNED,
  VENDOR_FOLDERS,
  type PinnedId,
} from './pinned';

const VENDOR = 'modules/ghostex-native/ios/Vendor';
/** Where the app's font files sit: the shared assets, and the iOS module's copy (a symlink to the same file). */
const FONT_DIRS = ['assets/fonts', 'modules/ghostex-native/ios/Fonts'];
export const FONT_FILE = /\.(ttf|otf|ttc|woff2?)$/i;
const PINNED_TABLES = 'scripts/notices/pinned.ts';

export function pinnedEntry(repo: string, id: PinnedId, group: Group): Collected {
  const component = PINNED[id];
  const texts = component.files.map((file) => {
    const copy = path.join(repo, 'third-party', component.dir, file);
    if (!isFile(copy)) fail(`The licence copy third-party/${component.dir}/${file} of ${component.name} is missing.`);
    return { file, text: readLicenceText(copy) };
  });
  const { name, version, about, url, licence } = component;
  return { group, name, version, about, url, licence, texts };
}

export function checkFingerprint(what: string, actual: string, expected: string, table: string): void {
  if (actual !== expected) {
    fail(
      `${what} has changed (fingerprint ${actual}, ${table} in ${PINNED_TABLES} expects ${expected}). Check which ` +
        'components and versions it now contains, refresh their licence copies under third-party/, then update the table.',
    );
  }
}

export function collectVendored(repo: string): Collected[] {
  const vendor = path.join(repo, VENDOR);
  if (!isDirectory(vendor)) fail(`${VENDOR} is missing.`);
  const present = readdirSync(vendor).filter((name) => !name.startsWith('.'));
  for (const name of Object.keys(VENDOR_FOLDERS)) {
    if (!present.includes(name)) fail(`${VENDOR}/${name} is gone: remove it from VENDOR_FOLDERS in ${PINNED_TABLES}.`);
  }
  const entries: Collected[] = [];
  for (const name of present.sort()) {
    if (HOST_BUILT_VENDOR_FOLDERS[name] === true) continue;
    const folder = VENDOR_FOLDERS[name];
    if (folder === undefined) {
      fail(
        `${VENDOR}/${name} is not known to the notices generator: add its components to VENDOR_FOLDERS in ` +
          `${PINNED_TABLES}, with their licence copies under third-party/.`,
      );
    }
    checkFingerprint(`${VENDOR}/${name}`, sha256Tree(path.join(vendor, name)), folder.sha256, 'VENDOR_FOLDERS');
    for (const id of folder.components) entries.push(pinnedEntry(repo, id, 'native'));
  }
  return entries;
}

export function collectFonts(repo: string): Collected[] {
  const seen = new Set<string>();
  const entries: Collected[] = [];
  for (const dir of FONT_DIRS) {
    const absolute = path.join(repo, dir);
    if (!isDirectory(absolute)) continue;
    for (const name of readdirSync(absolute).sort()) {
      if (!FONT_FILE.test(name)) continue;
      const file = realpathSync(path.join(absolute, name));
      if (seen.has(file)) continue;
      seen.add(file);
      const font = FONT_FILES[name];
      if (font === undefined) {
        fail(`${dir}/${name} is not known to the notices generator: add it to FONT_FILES in ${PINNED_TABLES}.`);
      }
      checkFingerprint(`${dir}/${name}`, sha256File(file), font.sha256, 'FONT_FILES');
      for (const id of font.components) entries.push(pinnedEntry(repo, id, 'font'));
    }
  }
  return entries;
}

export function collectGeneratedData(repo: string): Collected[] {
  const entries: Collected[] = [];
  for (const [file, data] of Object.entries(GENERATED_DATA_FILES)) {
    const absolute = path.join(repo, file);
    if (!isFile(absolute)) fail(`${file} is gone: remove it from GENERATED_DATA_FILES in ${PINNED_TABLES}.`);
    checkFingerprint(file, sha256File(absolute), data.sha256, 'GENERATED_DATA_FILES');
    for (const id of data.components) entries.push(pinnedEntry(repo, id, 'asset'));
  }
  return entries;
}
