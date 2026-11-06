/**
 * The native libraries the iOS release build links, read from the pods `bunx expo prebuild` installs: which pods
 * exist and where each comes from (`ios/Podfile.lock`), and which of their libraries and frameworks the release
 * configuration links (`Pods-<app>.release.xcconfig`; the dev client's launcher and menu link only in Debug).
 *
 * A pod from an npm package counts as that package (its notice is the package's); React Native's prebuilt
 * dependencies, Hermes and the third-party code inside it, the trunk pods and any Swift package an npm package
 * ships prebuilt get entries of their own. A pod from anywhere else stops the run, so a new kind of source is
 * looked at before it ships unlisted.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { fail, isDirectory, isFile, isRecord, licenceTexts, readJson, stringField, type Collected } from './common';
import { pinnedEntry } from './native';
import { HERMES_COMPONENTS, REACT_NATIVE_DEPENDENCY_PODS, SWIFT_PACKAGES } from './pinned';

type PodfileLock = {
  /** Root pod name → version. */
  readonly pods: ReadonlyMap<string, string>;
  /** Root pod name → `:path` or `:podspec`, relative to `ios/`. */
  readonly external: ReadonlyMap<string, string>;
  readonly trunk: ReadonlySet<string>;
};

/** The parts of `Podfile.lock` used here; the file is YAML that CocoaPods writes in one fixed layout. */
export function parsePodfileLock(text: string): PodfileLock {
  const pods = new Map<string, string>();
  const external = new Map<string, string>();
  const trunk = new Set<string>();
  let section = '';
  let externalPod = '';
  for (const line of text.split('\n')) {
    if (/^\S.*:$/.test(line)) {
      section = line.slice(0, -1);
      continue;
    }
    if (section === 'PODS') {
      const pod = /^ {2}- "?([^ "]+) \(([^)]+)\)"?:?$/.exec(line);
      if (pod !== null) pods.set(pod[1].split('/')[0], pod[2]);
    } else if (section === 'EXTERNAL SOURCES') {
      const name = /^ {2}"?([^":]+)"?:$/.exec(line);
      const source = /^ {4}:(?:path|podspec): "?([^"]+)"?$/.exec(line);
      if (name !== null) externalPod = name[1];
      else if (source !== null) external.set(externalPod, source[1]);
    } else if (section === 'SPEC REPOS') {
      const pod = /^ {4}- "?([^"]+)"?$/.exec(line);
      if (pod !== null) trunk.add(pod[1]);
    }
  }
  return { pods, external, trunk };
}

/** The library and framework names a release xcconfig links (`-l"x"`, `-framework "x"`). */
export function linkedNames(xcconfig: string): Set<string> {
  const names = new Set<string>();
  for (const match of xcconfig.matchAll(/-l"([^"]+)"|-framework "([^"]+)"/g)) names.add(match[1] ?? match[2]);
  return names;
}

/** A pod's products: its own name and the xcframeworks CocoaPods embeds for it. */
function podProducts(supportFiles: string, pod: string): string[] {
  const list = path.join(supportFiles, pod, `${pod}-xcframeworks-input-files.xcfilelist`);
  const frameworks = isFile(list)
    ? [...readFileSync(list, 'utf8').matchAll(/([^/\s]+)\.xcframework\b/g)].map((match) => match[1])
    : [];
  return [pod, ...frameworks];
}

/** `../node_modules/expo-camera/ios/x.podspec` → `node_modules/expo-camera`. */
function npmPackageDir(source: string): string | undefined {
  return /^(?:\.\.\/)?(node_modules\/(?:@[^/]+\/)?[^/]+)/.exec(source)?.[1];
}

/**
 * Pods React Native 0.88 supplies prebuilt from its own package, by podspec path: they are not React Native's
 * code, or (React-Core-prebuilt) ship it under another product name.
 */
const REACT_NATIVE_SUPPLIERS: Readonly<Record<string, 'hermes' | 'dependencies' | 'react-native'>> = {
  'node_modules/react-native/sdks/hermes-engine/hermes-engine.podspec': 'hermes',
  'node_modules/react-native/third-party-podspecs/ReactNativeDependencies.podspec': 'dependencies',
  'node_modules/react-native/React-Core-prebuilt.podspec': 'react-native',
};

export type PodsResult = {
  /** npm packages whose native code the release build links, as folders relative to the repo. */
  readonly npmDirs: ReadonlySet<string>;
  readonly entries: readonly Collected[];
};

function spmEntry(repo: string, packageDir: string, product: string): Collected {
  const config = readJson(path.join(repo, packageDir, 'spm.config.json'), `The Swift packages of ${packageDir}`);
  const products = isRecord(config) && Array.isArray(config.products) ? config.products : [];
  for (const item of products) {
    const spmPackages = isRecord(item) && Array.isArray(item.spmPackages) ? item.spmPackages : [];
    for (const spm of spmPackages) {
      if (!isRecord(spm) || spm.productName !== product) continue;
      const revision = isRecord(spm.version) ? stringField(spm.version, 'revision') : undefined;
      const id = revision === undefined ? undefined : SWIFT_PACKAGES[`${product}@${revision}`];
      if (id === undefined) {
        fail(
          `${packageDir} ships ${product} at ${revision ?? 'an unpinned version'}, which SWIFT_PACKAGES in ` +
            'scripts/notices/pinned.ts does not list: add its licence copy under third-party/.',
        );
      }
      return pinnedEntry(repo, id, 'ios');
    }
  }
  fail(`${packageDir} links ${product}, which its spm.config.json does not name; the notices cannot tell its source.`);
}

export function collectPods(repo: string): PodsResult {
  const ios = path.join(repo, 'ios');
  const lockFile = path.join(ios, 'Podfile.lock');
  const supportFiles = path.join(ios, 'Pods', 'Target Support Files');
  if (!isFile(lockFile) || !isDirectory(supportFiles)) {
    fail(
      'ios/Podfile.lock or ios/Pods is missing: run `bunx expo prebuild --platform ios` (it installs the pods) first.',
    );
  }
  const appTargets = readdirSync(supportFiles).filter((name) => name.startsWith('Pods-'));
  if (appTargets.length !== 1) fail(`Expected one app target in ios/Pods, found ${appTargets.length}.`);
  const target = appTargets[0];
  const releaseConfig = path.join(supportFiles, target, `${target}.release.xcconfig`);
  if (!isFile(releaseConfig)) fail(`${releaseConfig} is missing.`);
  const linked = linkedNames(readFileSync(releaseConfig, 'utf8'));
  const lock = parsePodfileLock(readFileSync(lockFile, 'utf8'));

  const npmDirs = new Set<string>();
  const entries: Collected[] = [];
  const facades: string[] = [];
  let dependenciesLinked = false;
  for (const [pod, version] of lock.pods) {
    const products = podProducts(supportFiles, pod);
    const isLinked = products.some((product) => linked.has(product));
    const source = lock.external.get(pod);
    if (source === undefined) {
      if (!lock.trunk.has(pod)) fail(`Pod ${pod} has no source in ios/Podfile.lock.`);
      if (!isLinked) continue;
      entries.push({
        group: 'ios',
        name: pod,
        version,
        about: 'iOS library (CocoaPods) the app links.',
        url: `https://cocoapods.org/pods/${pod}`,
        texts: licenceTexts(path.join(ios, 'Pods', pod), `pod ${pod}@${version}`),
      });
      continue;
    }
    if (source.startsWith('build/rndeps-facades/')) {
      facades.push(`${pod}@${version}`);
      continue;
    }
    // React Native's own code (React.framework, codegen output) and local modules of this repo need no entry here:
    // react-native has its npm entry, and the local module's vendored code is listed from its Vendor folder.
    if (source.startsWith('build/rncore-facades/') || source.startsWith('build/generated/')) continue;
    if (source.startsWith('../modules/')) continue;
    const packageDir = npmPackageDir(source);
    if (packageDir === undefined)
      fail(`Pod ${pod} comes from ${source}, a source the notices generator does not know.`);
    if (!isLinked) continue;
    const supplier = REACT_NATIVE_SUPPLIERS[source.replace(/^\.\.\//, '')];
    if (supplier === 'hermes') {
      const parts = HERMES_COMPONENTS[version];
      if (parts === undefined) {
        fail(
          `Hermes ${version} is not in HERMES_COMPONENTS in scripts/notices/pinned.ts: list the third-party code its ` +
            'runtime contains at that release, with the licence copies under third-party/.',
        );
      }
      entries.push({
        group: 'ios',
        name: 'Hermes',
        version,
        about: 'The JavaScript engine the app runs on, prebuilt for React Native.',
        url: 'https://github.com/facebook/hermes',
        licence: 'MIT',
        texts: licenceTexts(path.join(ios, 'Pods', pod), `Hermes ${version}`),
      });
      for (const id of parts) entries.push(pinnedEntry(repo, id, 'ios'));
      continue;
    }
    if (supplier === 'dependencies') {
      dependenciesLinked = true;
      continue;
    }
    npmDirs.add(packageDir);
    if (supplier === 'react-native') continue;
    for (const product of products.slice(1)) {
      if (product !== pod && linked.has(product)) entries.push(spmEntry(repo, packageDir, product));
    }
  }
  if (dependenciesLinked) {
    for (const facade of facades) {
      const id = REACT_NATIVE_DEPENDENCY_PODS[facade];
      if (id === undefined) {
        fail(
          `React Native's prebuilt dependency ${facade} is not in REACT_NATIVE_DEPENDENCY_PODS in ` +
            'scripts/notices/pinned.ts: add its licence copy under third-party/.',
        );
      }
      entries.push(pinnedEntry(repo, id, 'ios'));
    }
  }
  return { npmDirs, entries };
}
