#!/usr/bin/env node
/**
 * The runtime version of an over-the-air update: a hash of every input that ends up as native code
 * in the app binary. An update is only offered to a binary with the same runtime version, so this
 * must change whenever the JavaScript could meet native code it was not built against.
 *
 * app.config.js calls it for release builds and for update exports; both run from the same
 * checkout, so they agree. `node scripts/ota-runtime-version.js <android|ios> [--explain]` prints
 * it (and, with --explain, how many files each input contributed).
 *
 * CDXC:Release 2026-10-23 WHY: an explicit list of git-tracked sources, hashed from disk, instead
 * of Expo's automatic fingerprint. The Go tailcat bridge is built from the Ghostex main repo around
 * this submodule and lands in gitignored folders (jniLibs, xcframeworks), so the fingerprint would
 * hash whatever build output happens to be on the machine, or nothing. Hashing its sources gives
 * the same answer on the Linux runner that exports the update and the macOS runner that archives
 * the iOS app.
 *
 * CDXC:Release 2026-10-28 WHY: the Rust chat core is not a runtime input. The phone runs it as
 * WebAssembly in a hidden WebView, from a page Metro bundles like any other asset
 * (`assets/chat-core/chat-core.html`, built from packages/gx-chat-wasm), so a core change travels
 * in the over-the-air update. The user chose to remove the native UniFFI core on 2026-10-28
 * (src/chat/rust/wasm-core/bridge.ts); until then every core change needed a new app.
 * SEE-ALSO: tooling/release-mobile/ota-export.sh, tooling/release-gpui/product-inputs.mjs (the
 * Android product's input list, which keeps the core as an input of the bundled page).
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Bump to change every runtime version at once (for example when the hashing itself changes). */
const FORMAT = 1;

const APP_ROOT = path.resolve(__dirname, '..');
const MAIN_ROOT = path.resolve(APP_ROOT, '../../..');

/** Pathspecs inside this app (the apps/mobile/app submodule). */
const APP_SHARED = [
  'package.json',
  'bun.lock',
  'app.json',
  'app.config.js',
  'scripts/ota-runtime-version.js',
  'plugins',
  'certs',
  ':(glob)modules/*/expo-module.config.json',
];
const APP_PLATFORM = {
  android: [':(glob)modules/*/android/**'],
  ios: [':(glob)modules/*/ios/**'],
};

/** Pathspecs in the Ghostex main repo: the Go tailcat bridge. */
const MAIN_SHARED = ['apps/mobile/tailcat-bridge'];

function trackedFiles(root, pathspecs) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...pathspecs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean);
}

function fileDigest(file) {
  const stat = fs.lstatSync(file);
  const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertMainRepo() {
  if (!fs.existsSync(path.join(MAIN_ROOT, 'apps/mobile/tailcat-bridge/go.mod'))) {
    throw new Error(
      `The OTA runtime version hashes the tailcat bridge, but ${MAIN_ROOT} is not the Ghostex main repo. ` +
        'Release builds and update exports run from the main repo with this app checked out at apps/mobile/app.',
    );
  }
}

/**
 * @param {'android' | 'ios'} platform
 * @param {{ androidSelfUpdate: boolean }} flags native choices app.config.js makes from the environment
 */
function otaRuntimeInputs(platform, flags) {
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(`OTA runtime version: unknown platform ${platform}`);
  }
  assertMainRepo();
  const groups = [
    { label: 'app', root: APP_ROOT, files: trackedFiles(APP_ROOT, [...APP_SHARED, ...APP_PLATFORM[platform]]) },
    { label: 'main', root: MAIN_ROOT, files: trackedFiles(MAIN_ROOT, MAIN_SHARED) },
  ];
  // The GitHub APK and the Google Play bundle differ natively (the installer permission), so they
  // never share updates.
  const settings = platform === 'android' ? { androidSelfUpdate: flags.androidSelfUpdate } : {};
  return { groups, settings };
}

function otaRuntimeVersion(platform, flags) {
  const { groups, settings } = otaRuntimeInputs(platform, flags);
  const hash = crypto.createHash('sha256');
  hash.update(`ghostex-ota-runtime ${FORMAT} ${platform} ${JSON.stringify(settings)}\n`);
  for (const group of groups) {
    for (const file of [...group.files].sort()) {
      hash.update(`${group.label}:${file}\0${fileDigest(path.join(group.root, file))}\n`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

module.exports = { otaRuntimeVersion, otaRuntimeInputs };

if (require.main === module) {
  const [platform, ...rest] = process.argv.slice(2);
  const raw = process.env.GHOSTEX_ANDROID_SELF_UPDATE;
  const flags = { androidSelfUpdate: raw === undefined || raw === '' || raw === '1' };
  if (rest.includes('--explain')) {
    const { groups, settings } = otaRuntimeInputs(platform, flags);
    for (const group of groups) console.error(`${group.label}: ${group.files.length} files under ${group.root}`);
    console.error(`settings: ${JSON.stringify(settings)}`);
  }
  console.log(otaRuntimeVersion(platform, flags));
}
