/**
 * The Rust code in the chat core: the app embeds `packages/gx-chat-wasm` of the Ghostex main repo as WebAssembly
 * (`assets/chat-core/chat-core.html`). Its crates come from `cargo metadata` resolved for the wasm target, so
 * crates that only other platforms use are left out. The Rust standard library is compiled in too: its in-tree
 * licence files come from the toolchain the crate pins (`rust-toolchain.toml`) plus `third-party/`, and the
 * crates.io crates it uses from that toolchain's own copy of their sources. The data files the Ghostex main repo's
 * own crates compile in (`include_str!`, `include_bytes!`) ship in the WebAssembly as well; each must be listed in
 * RUST_EMBEDDED_FILES (pinned.ts) with the third-party components inside it.
 */

import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  browsableUrl,
  fail,
  isDirectory,
  isFile,
  isRecord,
  licenceTexts,
  readLicenceText,
  run,
  sha256File,
  stringField,
  type Collected,
} from './common';
import { checkFingerprint, pinnedEntry } from './native';
import { RUST_EMBEDDED_FILES, RUST_TOOLCHAINS, type PinnedId } from './pinned';

export const CHAT_CORE_CRATE = 'packages/gx-chat-wasm';

type Toolchain = { readonly channel: string; readonly target: string };

function pinnedToolchain(crateDir: string): Toolchain {
  const file = path.join(crateDir, 'rust-toolchain.toml');
  if (!isFile(file)) fail(`${file} is missing; the chat core's Rust toolchain cannot be told.`);
  const text = readFileSync(file, 'utf8');
  const channel = /^channel\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const targets = /^targets\s*=\s*\[([^\]]*)\]/m.exec(text)?.[1].match(/"[^"]+"/g) ?? [];
  if (channel === undefined || targets.length !== 1) {
    fail(`${file} must name one channel and exactly one target (the chat core is built for one).`);
  }
  return { channel, target: targets[0].slice(1, -1) };
}

type Metadata = {
  readonly packages: ReadonlyMap<string, Record<string, unknown>>;
  /** Package id → ids of its normal (not build or dev) dependencies. */
  readonly deps: ReadonlyMap<string, readonly string[]>;
  readonly workspaceMembers: readonly string[];
  readonly root: string | undefined;
};

function cargoMetadata(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv, what: string): Metadata {
  const raw: unknown = JSON.parse(
    run('cargo', ['metadata', '--format-version', '1', '--locked', ...args], { cwd, env, what }),
  );
  if (!isRecord(raw) || !Array.isArray(raw.packages) || !isRecord(raw.resolve) || !Array.isArray(raw.resolve.nodes)) {
    fail(`${what}: cargo metadata returned an unexpected shape.`);
  }
  const packages = new Map<string, Record<string, unknown>>();
  for (const item of raw.packages) {
    if (isRecord(item) && typeof item.id === 'string') packages.set(item.id, item);
  }
  const deps = new Map<string, string[]>();
  for (const node of raw.resolve.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !Array.isArray(node.deps)) continue;
    const normal = node.deps.flatMap((dep) =>
      isRecord(dep) &&
      typeof dep.pkg === 'string' &&
      Array.isArray(dep.dep_kinds) &&
      dep.dep_kinds.some((kind) => isRecord(kind) && kind.kind === null)
        ? [dep.pkg]
        : [],
    );
    deps.set(node.id, normal);
  }
  const workspaceMembers = Array.isArray(raw.workspace_members)
    ? raw.workspace_members.filter((id): id is string => typeof id === 'string')
    : [];
  const root = typeof raw.resolve.root === 'string' ? raw.resolve.root : undefined;
  return { packages, deps, workspaceMembers, root };
}

function isProcMacro(crate: Record<string, unknown> | undefined): boolean {
  const targets = crate?.targets;
  return (
    Array.isArray(targets) &&
    targets.some((target) => isRecord(target) && Array.isArray(target.kind) && target.kind.includes('proc-macro'))
  );
}

/**
 * The ids of every package reachable from `root` through normal dependencies, `root` included. Without
 * `throughMacros`, compile-time macro crates (proc-macro) and what only they use are left out: they run while the
 * code is compiled and are not part of the built WebAssembly.
 */
function reachable(metadata: Metadata, root: string, throughMacros: boolean): Set<string> {
  const seen = new Set<string>();
  const stack = [root];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (seen.has(id) || (!throughMacros && isProcMacro(metadata.packages.get(id)))) continue;
    seen.add(id);
    stack.push(...(metadata.deps.get(id) ?? []));
  }
  return seen;
}

/** The registry (or git) crates among `ids`; crates without a source are the Ghostex main repo's own. */
function thirdPartyCrates(metadata: Metadata, ids: ReadonlySet<string>): Record<string, unknown>[] {
  return [...ids].flatMap((id) => {
    const crate = metadata.packages.get(id);
    return crate === undefined || crate.source === null || crate.source === undefined ? [] : [crate];
  });
}

export function crateEntry(crate: Record<string, unknown>, dir: string, about: string): Collected {
  const name = stringField(crate, 'name');
  const version = stringField(crate, 'version');
  if (name === undefined || version === undefined) fail(`A crate in ${dir} has no name or version.`);
  const licence = stringField(crate, 'license');
  return {
    group: 'rust',
    name,
    version,
    about,
    url: browsableUrl(stringField(crate, 'repository')) ?? `https://crates.io/crates/${name}/${version}`,
    ...(licence === undefined ? {} : { licence }),
    texts: licenceTexts(dir, `crate ${name}@${version}`),
  };
}

function manifestDir(crate: Record<string, unknown>): string {
  const manifest = stringField(crate, 'manifest_path');
  if (manifest === undefined) fail(`Crate ${String(crate.name)} has no manifest path.`);
  return path.dirname(manifest);
}

/** The licence files of the standard library's in-tree parts that the wasm build compiles in, under the toolchain. */
const STD_IN_TREE_LICENCES = [
  // core::arch and core::simd come from these two crates.
  'lib/rustlib/src/rust/library/stdarch/crates/core_arch/LICENSE-APACHE',
  'lib/rustlib/src/rust/library/stdarch/crates/core_arch/LICENSE-MIT',
  'lib/rustlib/src/rust/library/portable-simd/crates/core_simd/LICENSE-APACHE',
  'lib/rustlib/src/rust/library/portable-simd/crates/core_simd/LICENSE-MIT',
  // compiler_builtins, with libm.
  'lib/rustlib/src/rust/library/compiler-builtins/LICENSE.txt',
  // The Unicode tables in core.
  'share/doc/rust/licenses/Unicode-3.0.txt',
];

function standardLibrary(repo: string, crateDir: string, toolchain: Toolchain): Collected[] {
  const id = RUST_TOOLCHAINS[toolchain.channel];
  if (id === undefined) {
    fail(
      `The chat core now uses Rust ${toolchain.channel}: add the Rust repository's COPYRIGHT and LICENSE files at that ` +
        'tag under third-party/ and to RUST_TOOLCHAINS in scripts/notices/pinned.ts.',
    );
  }
  // rustup picks the pinned toolchain from the crate's rust-toolchain.toml.
  const sysroot = run('rustc', ['--print', 'sysroot'], { cwd: crateDir, what: 'Finding the Rust toolchain' }).trim();
  const library = path.join(sysroot, 'lib/rustlib/src/rust/library');
  if (!isDirectory(library)) {
    fail(
      `The Rust standard library sources are missing: run \`rustup component add rust-src --toolchain ${toolchain.channel}\`.`,
    );
  }
  const base = pinnedEntry(repo, id, 'rust');
  const inTree = STD_IN_TREE_LICENCES.map((relative) => {
    const file = path.join(sysroot, relative);
    if (!isFile(file)) fail(`The Rust ${toolchain.channel} toolchain has no ${relative}.`);
    return { file: relative.replace(/^.*\/(library|licenses)\//, '$1/'), text: readLicenceText(file) };
  });
  // The standard library's manifest uses unstable Cargo features; reading it (not building) needs them unlocked.
  const metadata = cargoMetadata(
    crateDir,
    ['--manifest-path', path.join(library, 'Cargo.toml'), '--filter-platform', toolchain.target],
    { ...process.env, RUSTC_BOOTSTRAP: '1' },
    'Resolving the Rust standard library',
  );
  const std = metadata.workspaceMembers.find((member) => member.includes('/library/std#'));
  if (std === undefined) fail('The Rust standard library workspace has no std crate.');
  const crates = thirdPartyCrates(metadata, reachable(metadata, std, false)).map((crate) => {
    const vendored = path.join(library, 'vendor', `${String(crate.name)}-${String(crate.version)}`);
    return crateEntry(
      crate,
      isDirectory(vendored) ? vendored : manifestDir(crate),
      'Rust crate the standard library uses, compiled into the chat core (WebAssembly).',
    );
  });
  return [{ ...base, texts: [...base.texts, ...inTree] }, ...crates];
}

/** The files a dep-info file (`<crate>.d`, Makefile rules) names as inputs; a space in a path is written `\ `. */
function depInfoInputs(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    if (line.startsWith('#')) return [];
    const rule = /^(?:\\.|[^\\:])+:(.*)$/.exec(line);
    if (rule === null) return [];
    return rule[1]
      .trim()
      .split(/(?<!\\) /)
      .filter((input) => input !== '')
      .map((input) => input.replace(/\\(.)/g, '$1'));
  });
}

/**
 * The entries of the third-party components inside the data files the Ghostex main repo's own crates compile into
 * the chat core. The compiler records every file a crate reads in its dep-info, so a `cargo check` with the target
 * and profile of the WebAssembly build (`cargo xtask build-mobile-chat-wasm`) lists them; the Rust sources are the
 * crates' own code, and files outside the checkout belong to crates.io crates, which have entries of their own.
 */
function embeddedDataEntries(
  repo: string,
  host: string,
  crateDir: string,
  target: string,
  scratch: string,
): Collected[] {
  const targetDir = path.join(scratch, 'cargo-target');
  run('cargo', ['check', '--locked', '--release', '--target', target], {
    cwd: crateDir,
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    what: 'Checking the chat core for the files it compiles in',
  });
  const depInfo = path.join(targetDir, target, 'release', 'deps');
  if (!isDirectory(depInfo))
    fail(`cargo check wrote no dep-info for ${target}; the chat core's data files cannot be told.`);
  const root = realpathSync(host);
  const files = new Set<string>();
  for (const name of readdirSync(depInfo).filter((file) => file.endsWith('.d'))) {
    for (const input of depInfoInputs(readFileSync(path.join(depInfo, name), 'utf8'))) {
      if (input.endsWith('.rs') || !isFile(input)) continue;
      const file = realpathSync(input);
      if (file.startsWith(root + path.sep)) files.add(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  const ids = new Set<PinnedId>();
  for (const file of [...files].sort()) {
    const known = RUST_EMBEDDED_FILES[file];
    if (known === undefined) {
      fail(
        `The chat core compiles in ${file} of the Ghostex main repo, which the notices generator does not know: find ` +
          'the third-party components inside it, put their licence copies under third-party/ and add the file to ' +
          'RUST_EMBEDDED_FILES in scripts/notices/pinned.ts.',
      );
    }
    checkFingerprint(
      `${file} of the Ghostex main repo`,
      sha256File(path.join(root, file)),
      known.sha256,
      'RUST_EMBEDDED_FILES',
    );
    for (const id of known.components) ids.add(id);
  }
  for (const file of Object.keys(RUST_EMBEDDED_FILES)) {
    if (!files.has(file)) {
      fail(
        `${file} is no longer compiled into the chat core: remove it from RUST_EMBEDDED_FILES in scripts/notices/pinned.ts.`,
      );
    }
  }
  return [...ids].map((id) => pinnedEntry(repo, id, 'asset'));
}

export function collectRust(repo: string, host: string, scratch: string): Collected[] {
  const crateDir = path.join(host, CHAT_CORE_CRATE);
  if (!isFile(path.join(crateDir, 'Cargo.toml')))
    fail(`${CHAT_CORE_CRATE}/Cargo.toml is missing in the host checkout ${host}.`);
  const toolchain = pinnedToolchain(crateDir);
  const metadata = cargoMetadata(
    crateDir,
    ['--filter-platform', toolchain.target],
    process.env,
    'Resolving the chat core crates',
  );
  if (metadata.root === undefined) fail(`cargo metadata in ${crateDir} reports no root crate.`);
  // Compile-time macro crates are listed too, though only their output reaches the WebAssembly.
  const built = reachable(metadata, metadata.root, false);
  const crates = thirdPartyCrates(metadata, reachable(metadata, metadata.root, true)).map((crate) =>
    crateEntry(
      crate,
      manifestDir(crate),
      built.has(String(crate.id))
        ? 'Rust crate compiled into the chat core (WebAssembly).'
        : 'Rust crate the chat core is compiled with (a compile-time macro or a crate one uses).',
    ),
  );
  return [
    ...crates,
    ...standardLibrary(repo, crateDir, toolchain),
    ...embeddedDataEntries(repo, host, crateDir, toolchain.target, scratch),
  ];
}
