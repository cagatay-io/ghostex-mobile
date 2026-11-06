/**
 * The Go code in the app: the tailcat bridge of the Ghostex main repo (`apps/mobile/tailcat-bridge`), which
 * gomobile builds into Tailcatbridge.xcframework. The packages are listed the way gomobile compiles the bridge for
 * iOS (GOOS=ios, cgo on) together with the binding runtime gomobile adds (`golang.org/x/mobile/bind/seq`), so
 * packages only other platforms use are left out. The Go standard library and runtime are compiled in as well.
 *
 * A module's entry holds the licence files at its root and those in the folders of its linked packages and in
 * every folder between those and the root: a module can carry code with a notice of its own beside the package
 * that uses it (klauspost/compress keeps xxhash's licence in zstd/internal/xxhash). The files those packages embed
 * (`//go:embed`) ship in the binary too; each must be listed in GO_EMBEDDED_FILES (pinned.ts) with the
 * third-party components inside it, so a new or changed embedded file stops the run until its content is known.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { entryHeading, type NoticeText } from '../../src/licences/notices';
import {
  fail,
  isFile,
  isRecord,
  LICENCE_FILE,
  licenceTexts,
  readLicenceText,
  run,
  sha256File,
  stringField,
  type Collected,
} from './common';
import { checkFingerprint, FONT_FILE, pinnedEntry } from './native';
import { GO_EMBEDDED_FILES } from './pinned';

export const TAILCAT_BRIDGE = 'apps/mobile/tailcat-bridge';

/** What `gomobile bind -target=ios` compiles: iOS with cgo, plus the binding runtime its generated code imports. */
const IOS_BUILD_ENV = { GOOS: 'ios', GOARCH: 'arm64', CGO_ENABLED: '1' };
const BIND_RUNTIME = 'golang.org/x/mobile/bind/seq';
const PACKAGE_FIELDS = 'ImportPath,Dir,Standard,Module,EmbedFiles';

/** Where a linked package comes from: the standard library, the bridge itself, or a module (its replacement, if replaced). */
type PackageSource = 'std' | 'main' | { readonly path: string; readonly version: string; readonly dir: string };

type GoPackage = {
  readonly importPath: string;
  readonly dir: string;
  readonly source: PackageSource;
  /** The files the package embeds, relative to its folder. */
  readonly embedFiles: readonly string[];
};

/** A module (or the standard library) as the bridge links it: its entry without texts, its folder, its packages' folders. */
type LinkedModule = {
  readonly entry: Omit<Collected, 'texts'>;
  readonly root: string;
  readonly rootTexts: readonly NoticeText[];
  readonly packageDirs: Set<string>;
};

function packageSource(item: Record<string, unknown>, importPath: string): PackageSource {
  if (item.Standard === true) return 'std';
  const module = item.Module;
  if (!isRecord(module)) fail(`Go package ${importPath} belongs to no module.`);
  if (module.Main === true) return 'main';
  const source = isRecord(module.Replace) ? module.Replace : module;
  const modulePath = stringField(source, 'Path');
  const version = stringField(source, 'Version');
  const dir = stringField(source, 'Dir');
  if (modulePath === undefined || version === undefined || dir === undefined) {
    fail(`Go module ${modulePath ?? importPath} has no version or is not downloaded (\`go mod download\`).`);
  }
  return { path: modulePath, version, dir };
}

function listPackages(bridge: string): GoPackage[] {
  const listed = run('go', ['list', '-deps', `-json=${PACKAGE_FIELDS}`, '.', BIND_RUNTIME], {
    cwd: bridge,
    env: { ...process.env, ...IOS_BUILD_ENV },
    what: 'Listing the tailcat bridge packages',
  });
  // `go list -json` prints one object after the other; only a top-level object closes with `}` at a line start.
  let items: unknown;
  try {
    items = JSON.parse(`[${listed.trim().replace(/\n}\n{/g, '\n},\n{')}]`);
  } catch (error) {
    fail(`The tailcat bridge package list could not be read (${String(error)}).`);
  }
  if (!Array.isArray(items)) fail('The tailcat bridge package list is not a list of packages.');
  return items.map((item) => {
    const importPath = isRecord(item) ? stringField(item, 'ImportPath') : undefined;
    const dir = isRecord(item) ? stringField(item, 'Dir') : undefined;
    if (!isRecord(item) || importPath === undefined || dir === undefined) {
      fail('`go list` named a package without an import path or folder.');
    }
    const embedFiles = Array.isArray(item.EmbedFiles)
      ? item.EmbedFiles.filter((file): file is string => typeof file === 'string')
      : [];
    return { importPath, dir, source: packageSource(item, importPath), embedFiles };
  });
}

/** A path inside `root` with forward slashes, as the notices and pinned.ts name it on every machine. */
function inside(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * The licence files in the given package folders and in every folder between them and `root` (the root's own are
 * read separately), named by their path inside `root`, in code-unit order.
 */
function nestedLicenceTexts(root: string, packageDirs: ReadonlySet<string>): NoticeText[] {
  const folders = new Set<string>();
  for (const dir of packageDirs) {
    for (let at = dir; at.startsWith(root + path.sep); at = path.dirname(at)) folders.add(at);
  }
  const files: string[] = [];
  for (const folder of folders) {
    for (const name of readdirSync(folder)) {
      const file = path.join(folder, name);
      if (LICENCE_FILE.test(name) && isFile(file)) files.push(inside(root, file));
    }
  }
  return files.sort().map((file) => ({ file, text: readLicenceText(path.join(root, file)) }));
}

/** The entries of the third-party components inside one embedded file, after checking its fingerprint. */
function embeddedEntries(repo: string, module: LinkedModule, pkg: GoPackage, file: string): Collected[] {
  const heading = entryHeading(module.entry);
  const absolute = path.join(pkg.dir, file);
  const name = inside(module.root, absolute);
  const known = GO_EMBEDDED_FILES[heading]?.[name];
  if (known === undefined) {
    fail(
      `${heading} embeds ${name} (package ${pkg.importPath}), which the notices generator does not know: find the ` +
        'third-party components inside it, put their licence copies under third-party/ and add the file to ' +
        'GO_EMBEDDED_FILES in scripts/notices/pinned.ts.',
    );
  }
  checkFingerprint(`${name} of ${heading}`, sha256File(absolute), known.sha256, 'GO_EMBEDDED_FILES');
  return known.components.map((id) => pinnedEntry(repo, id, FONT_FILE.test(name) ? 'font' : 'go'));
}

export function collectGo(repo: string, host: string): Collected[] {
  const bridge = path.join(host, TAILCAT_BRIDGE);
  if (!isFile(path.join(bridge, 'go.mod'))) fail(`${TAILCAT_BRIDGE}/go.mod is missing in the host checkout ${host}.`);
  const [goroot, goversion] = run('go', ['env', 'GOROOT', 'GOVERSION'], {
    cwd: bridge,
    env: { ...process.env, ...IOS_BUILD_ENV },
    what: 'Finding the Go toolchain',
  })
    .trim()
    .split('\n');
  const stdlibLicence = path.join(goroot, 'LICENSE');
  if (!isFile(stdlibLicence)) fail(`The Go toolchain at ${goroot} has no LICENSE file.`);
  const stdlib: LinkedModule = {
    entry: {
      group: 'go',
      name: 'Go standard library and runtime',
      version: goversion.replace(/^go/, ''),
      about: 'Compiled into the tailcat bridge by the Go toolchain that builds it.',
      url: `https://github.com/golang/go/tree/${goversion}`,
    },
    root: goroot,
    rootTexts: [{ file: 'LICENSE', text: readLicenceText(stdlibLicence) }],
    packageDirs: new Set(),
  };

  const modules = new Map<string, LinkedModule>();
  const embedded: Collected[] = [];
  const embeddedSeen = new Set<string>();
  for (const pkg of listPackages(bridge)) {
    // The bridge's own packages are the Ghostex main repo's code, not third-party.
    if (pkg.source === 'main') continue;
    let module = stdlib;
    if (pkg.source !== 'std') {
      const { path: modulePath, version, dir } = pkg.source;
      const heading = `${modulePath}@${version}`;
      module = modules.get(heading) ?? {
        entry: {
          group: 'go',
          name: modulePath,
          version,
          about: 'Go module compiled into the tailcat bridge (the Tailscale connection).',
          url: `https://pkg.go.dev/${heading}`,
        },
        root: dir,
        rootTexts: licenceTexts(dir, `Go module ${heading}`),
        packageDirs: new Set(),
      };
      modules.set(heading, module);
    }
    module.packageDirs.add(pkg.dir);
    for (const file of pkg.embedFiles) {
      embedded.push(...embeddedEntries(repo, module, pkg, file));
      embeddedSeen.add(`${entryHeading(module.entry)} ${inside(module.root, path.join(pkg.dir, file))}`);
    }
  }
  for (const [heading, files] of Object.entries(GO_EMBEDDED_FILES)) {
    for (const name of Object.keys(files)) {
      if (!embeddedSeen.has(`${heading} ${name}`)) {
        fail(
          `${name} of ${heading} is no longer embedded in the tailcat bridge: remove it from GO_EMBEDDED_FILES in ` +
            'scripts/notices/pinned.ts.',
        );
      }
    }
  }

  const linked = [...modules.values(), stdlib].map(({ entry, root, rootTexts, packageDirs }) => ({
    ...entry,
    texts: [...rootTexts, ...nestedLicenceTexts(root, packageDirs)],
  }));
  return [...linked, ...embedded];
}
