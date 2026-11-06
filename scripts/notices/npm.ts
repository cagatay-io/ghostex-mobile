/**
 * npm packages: the ones whose code is in the app's JavaScript bundle, found by bundling the app for iOS the way
 * the release build embeds it (`expo export:embed`) and reading the source map, plus the ones whose native code
 * the app links (from the pods, `pods.ts`). A package's licence comes from the licence files in its folder, or,
 * for a version published without one, from its copy under `third-party/`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  browsableUrl,
  fail,
  isFile,
  isRecord,
  LICENCE_FILE,
  licenceTexts,
  readJson,
  readLicenceText,
  run,
  stringField,
  type Collected,
} from './common';
import { NPM_LICENCE_COPIES } from './pinned';

const CHAT_CORE_PAGE = 'assets/chat-core/chat-core.html';
const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';

/** `node_modules/<name>` or `node_modules/@scope/<name>`, each nesting level of a path matched once. */
const PACKAGE_SEGMENT = /node_modules\/(?:@[^/]+\/)?[^/]+/g;

/**
 * The folders (relative to the repo) of the packages that own a file in the source map. A file belongs to the
 * innermost package around it: a package nested in another's `node_modules` is its own package, so the outer one
 * counts only for files of its own.
 */
function packageDirsInSourceMap(map: unknown): Set<string> {
  const sections = isRecord(map) && Array.isArray(map.sections) ? map.sections : [map];
  const dirs = new Set<string>();
  for (const section of sections) {
    const inner = isRecord(section) && isRecord(section.map) ? section.map : section;
    const sources = isRecord(inner) && Array.isArray(inner.sources) ? inner.sources : [];
    for (const source of sources) {
      if (typeof source !== 'string') continue;
      const owner = [...source.matchAll(PACKAGE_SEGMENT)].at(-1);
      if (owner === undefined) continue;
      dirs.add(source.slice(0, (owner.index ?? 0) + owner[0].length).replace(/^\/+/, ''));
    }
  }
  return dirs;
}

/** The packages in the iOS release bundle, as folders relative to the repo. */
export function bundledPackageDirs(repo: string, scratch: string): string[] {
  if (!isFile(path.join(repo, CHAT_CORE_PAGE))) {
    fail(
      `${CHAT_CORE_PAGE} is missing; Metro cannot bundle the app without it. Build it with ` +
        '`cargo xtask build-mobile-chat-wasm` in the Ghostex main repo.',
    );
  }
  if (!isFile(path.join(repo, NOTICES_FILE))) {
    fail(`${NOTICES_FILE} is missing; the app bundles it, so Metro needs it. Restore it from git and run again.`);
  }
  const manifest = readJson(path.join(repo, 'package.json'), 'The app manifest');
  const entry = isRecord(manifest) ? stringField(manifest, 'main') : undefined;
  if (entry === undefined) fail('package.json has no "main" entry file to bundle.');
  const sourceMap = path.join(scratch, 'main.jsbundle.map');
  run(
    'bunx',
    [
      'expo',
      'export:embed',
      '--platform',
      'ios',
      '--dev',
      'false',
      '--entry-file',
      entry,
      '--bundle-output',
      path.join(scratch, 'main.jsbundle'),
      '--sourcemap-output',
      sourceMap,
      '--assets-dest',
      path.join(scratch, 'assets'),
    ],
    {
      cwd: repo,
      env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' },
      what: 'Bundling the app',
    },
  );
  let map: unknown;
  try {
    map = JSON.parse(readFileSync(sourceMap, 'utf8'));
  } catch (error) {
    fail(`The bundle's source map could not be read (${String(error)}).`);
  }
  const dirs = [...packageDirsInSourceMap(map)].sort();
  if (dirs.length === 0) fail('The bundle source map names no npm package; the bundle step did not work as expected.');
  return dirs;
}

/** A package's declared licence as an SPDX-style expression (`license`, or the old `licenses` list). */
function declaredLicence(manifest: Record<string, unknown>): string | undefined {
  const { license, licenses } = manifest;
  if (typeof license === 'string' && license !== '') return license;
  if (isRecord(license) && typeof license.type === 'string') return license.type;
  if (Array.isArray(licenses)) {
    const types = licenses.flatMap((item) => (isRecord(item) && typeof item.type === 'string' ? [item.type] : []));
    if (types.length > 0) return types.join(' OR ');
  }
  return undefined;
}

export function npmEntry(repo: string, dir: string, about: string): Collected {
  const manifest = readJson(path.join(repo, dir, 'package.json'), `The npm package in ${dir}`);
  const name = isRecord(manifest) ? stringField(manifest, 'name') : undefined;
  const version = isRecord(manifest) ? stringField(manifest, 'version') : undefined;
  if (!isRecord(manifest) || name === undefined || version === undefined) {
    fail(`${dir}/package.json has no name or version.`);
  }
  const { repository } = manifest;
  const repositoryUrl =
    typeof repository === 'string' ? repository : isRecord(repository) ? stringField(repository, 'url') : undefined;
  const url =
    browsableUrl(repositoryUrl) ??
    browsableUrl(stringField(manifest, 'homepage')) ??
    `https://www.npmjs.com/package/${name}/v/${version}`;
  const heading = `${name}@${version}`;
  const absolute = path.join(repo, dir);
  const ownFiles = readdirSync(absolute).some((file) => LICENCE_FILE.test(file));
  const copy = NPM_LICENCE_COPIES[heading];
  if (ownFiles && copy !== undefined) {
    fail(`${heading} now has its own licence file: remove it from NPM_LICENCE_COPIES in scripts/notices/pinned.ts.`);
  }
  if (!ownFiles && copy === undefined) {
    fail(
      `No licence file found for ${heading} in ${dir}. Take the licence file from the source that published this ` +
        'version, put it under third-party/ and add it to NPM_LICENCE_COPIES in scripts/notices/pinned.ts.',
    );
  }
  const texts = ownFiles
    ? licenceTexts(absolute, heading)
    : copy.files.map((file) => ({ file, text: readLicenceText(path.join(repo, 'third-party', copy.dir, file)) }));
  const licence = declaredLicence(manifest);
  return { group: 'npm', name, version, about, url, ...(licence === undefined ? {} : { licence }), texts };
}
