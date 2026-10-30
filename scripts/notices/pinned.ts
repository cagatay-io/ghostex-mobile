/**
 * Components whose licence files are not in any source the generator can read at the shipped version, so a copy
 * of each file, taken from the component's own upstream source at exactly that version, lives in
 * `third-party/<id>/`. That covers the prebuilt native code under `modules/ghostex-native/ios/Vendor` and what it
 * statically contains, the fonts and generated icon data the app bundles, the prebuilt React Native dependencies,
 * the third-party code inside the prebuilt Hermes engine, an SDK the camera module ships prebuilt, npm packages
 * published without a licence file, the Rust standard library's top-level licence files, what the data files the
 * chat core's Rust code compiles in contain, and what the files that linked Go packages embed (`//go:embed`)
 * contain.
 *
 * Each table below ties its copies to the shipped thing by something the generator can check (a file
 * fingerprint, a pod or package version, a source revision). When that thing changes, the run stops and names the
 * table to update, so a copy can never silently describe a different version.
 */

export type PinnedComponent = {
  readonly name: string;
  readonly version: string;
  readonly about: string;
  readonly url: string;
  readonly licence: string;
  /** Folder under `third-party/` holding the copied licence files. */
  readonly dir: string;
  /** The copied files, in the order the notices show them. */
  readonly files: readonly string[];
};

const ghosttyKit = (about: string) => `${about} Built into GhosttyKit, the app's terminal engine.`;
const GHOSTTY_COMMIT = '268a0a9d761fb19673f05d28042488e2002300f2';
const NERD_FONT_GLYPHS = [
  'glyphs-codicons-LICENSE.txt',
  'glyphs-font-awesome-LICENSE.txt',
  'glyphs-materialdesign-LICENSE',
  'glyphs-octicons-LICENSE',
  'glyphs-pomicons-LICENSE',
  'glyphs-powerline-extra-LICENSE',
  'glyphs-powerline-symbols-LICENSE.txt',
  'glyphs-weather-icons-OFL.txt',
];

/**
 * The Tailscale web client page (HTML, script, stylesheet and font) that github.com/tailscale/web-client-prebuilt
 * embeds into the tailcat bridge. Its prebuilt files unpack to exactly what Tailscale's client/web builds at commit
 * 716e4fcc97759308f79875ff1809da945df70574 (the main branch the module's asset update ran on), so its third-party
 * parts are the packages that build bundles, at the versions in that commit's yarn.lock.
 */
const webClient = (about: string) => `${about} Part of the Tailscale web client page compiled into the tailcat bridge.`;
const npmRelease = (name: string, version: string) => `https://www.npmjs.com/package/${name}/v/${version}`;
const WEB_PACKAGE = webClient('JavaScript package.');
const WEB_PACKAGE_REPO_LICENCE = webClient(
  "JavaScript package published without a licence file; the copy is its repository's licence file at the release that published this version.",
);
/**
 * A web client package published without any licence text, whose repository has none at that version either: its
 * entry holds the licence statement in its own files and the standard text of that licence from the SPDX License
 * List 3.29.0 (https://github.com/spdx/license-list-data/tree/v3.29.0/text), with the author its package metadata
 * names.
 */
const webPackageWithoutLicenceText = (author: string) =>
  webClient(
    `JavaScript package published without a licence text, and its repository has none at this version. The first file is the licence statement in its own files; the second is the standard text of that licence from the SPDX License List 3.29.0. Its package metadata names ${author} as the author.`,
  );
const SPDX_LIST = 'spdx-3.29.0';
const inHermes = (about: string) => `${about} Built into Hermes, the JavaScript engine the app runs on.`;
const HERMES_TAG = 'hermes-v260318099.0.4';
const hermesSource = (folder: string) => `https://github.com/facebook/hermes/tree/${HERMES_TAG}/${folder}`;
const SIMPLE_ICONS_LOGOS = 'packages/gx-chat-core/visual/tool-apps';
const radixRelease = (commit: string, folder: string) =>
  `https://github.com/radix-ui/primitives/tree/${commit}/packages/${folder}`;
const RADIX_RELEASE_333EAF7 = '333eaf790a294c3af6092f2dcf870f27092d2a57';
const RADIX_RELEASE_C31C972 = 'c31c97274ff357aea99afe6c01c1c8c58b6356e0';

export const PINNED = {
  ghostty: {
    name: 'Ghostty',
    version: `1.3.0-custom-io+${GHOSTTY_COMMIT.slice(0, 7)}`,
    about: 'The terminal engine (libghostty) the iOS terminal draws with, vendored as GhosttyKit.',
    url: `https://github.com/ghostty-org/ghostty/tree/${GHOSTTY_COMMIT}`,
    licence: 'MIT',
    dir: 'ghostty-1.3.0-custom-io+268a0a9',
    files: ['LICENSE'],
  },
  zlib: {
    name: 'zlib',
    version: '1.3.1',
    about: ghosttyKit('Compression library.'),
    url: 'https://zlib.net',
    licence: 'Zlib',
    dir: 'zlib-1.3.1',
    files: ['LICENSE'],
  },
  freetype: {
    name: 'FreeType',
    version: '2.13.2',
    about: ghosttyKit('Font rasteriser; the app uses it under the FreeType License.'),
    url: 'https://freetype.org',
    licence: 'FTL OR GPL-2.0-or-later',
    dir: 'freetype-2.13.2',
    files: ['LICENSE.TXT', 'FTL.TXT'],
  },
  libpng: {
    name: 'libpng',
    version: '1.6.43',
    about: ghosttyKit('PNG image library.'),
    url: 'http://www.libpng.org/pub/png/libpng.html',
    licence: 'libpng-2.0',
    dir: 'libpng-1.6.43',
    files: ['LICENSE'],
  },
  oniguruma: {
    name: 'Oniguruma',
    version: '6.9.9',
    about: ghosttyKit('Regular expression library (link detection).'),
    url: 'https://github.com/kkos/oniguruma',
    licence: 'BSD-2-Clause',
    dir: 'oniguruma-6.9.9',
    files: ['COPYING'],
  },
  libintl: {
    name: 'GNU libintl (gettext)',
    version: '0.24',
    about: ghosttyKit('Message translation library from GNU gettext.'),
    url: 'https://www.gnu.org/software/gettext/',
    licence: 'LGPL-2.1-or-later',
    dir: 'libintl-0.24',
    files: ['COPYING.LIB'],
  },
  sentryNative: {
    name: 'Sentry Native SDK',
    version: '0.7.8',
    about: ghosttyKit('Crash reporting library (sentry-native).'),
    url: 'https://github.com/getsentry/sentry-native',
    licence: 'MIT',
    dir: 'sentry-native-0.7.8',
    files: ['LICENSE'],
  },
  mpack: {
    name: 'MPack',
    version: '1.0',
    about: ghosttyKit('MessagePack library vendored in the Sentry Native SDK; its licence is the header of mpack.h.'),
    url: 'https://github.com/ludocode/mpack',
    licence: 'MIT',
    dir: 'mpack-1.0',
    files: ['mpack.h-lines-1-23'],
  },
  breakpad: {
    name: 'Breakpad',
    version: 'b99f444',
    about: ghosttyKit('Crash dump library used by the Sentry Native SDK.'),
    url: 'https://chromium.googlesource.com/breakpad/breakpad/+/b99f444ba5f6b98cac261cbb391d8766b34a5918',
    licence: 'BSD-3-Clause',
    dir: 'breakpad-b99f444',
    files: ['LICENSE'],
  },
  glslang: {
    name: 'glslang',
    version: '14.2.0',
    about: ghosttyKit('Shader compiler front end (custom shaders).'),
    url: 'https://github.com/KhronosGroup/glslang',
    licence: 'BSD-3-Clause AND BSD-2-Clause AND MIT AND Apache-2.0 AND GPL-3.0-or-later WITH Bison-exception-2.2',
    dir: 'glslang-14.2.0',
    files: ['LICENSE.txt'],
  },
  spirvCross: {
    name: 'SPIRV-Cross',
    version: '13.1.1',
    about: ghosttyKit('Shader translator to Metal (custom shaders).'),
    url: 'https://github.com/KhronosGroup/SPIRV-Cross/tree/476f384eb7d9e48613c45179e502a15ab95b6b49',
    licence: 'Apache-2.0',
    dir: 'spirv-cross-13.1.1',
    files: [
      'LICENSE',
      'LICENSES-Apache-2.0.txt',
      'LICENSES-CC-BY-4.0.txt',
      'LICENSES-LicenseRef-KhronosFreeUse.txt',
      'LICENSES-MIT.txt',
    ],
  },
  dearImgui: {
    name: 'Dear ImGui',
    version: '1.92.5-docking',
    about: ghosttyKit('Immediate-mode UI library (terminal inspector).'),
    url: 'https://github.com/ocornut/imgui',
    licence: 'MIT',
    dir: 'dear-imgui-1.92.5-docking',
    files: ['LICENSE.txt'],
  },
  dearBindings: {
    name: 'Dear Bindings',
    version: '0.17',
    about: ghosttyKit('C bindings generated for Dear ImGui.'),
    url: 'https://github.com/dearimgui/dear_bindings',
    licence: 'MIT',
    dir: 'dear-bindings-0.17',
    files: ['LICENSE.txt'],
  },
  simdutf: {
    name: 'simdutf',
    version: '5.2.8',
    about: ghosttyKit('Fast Unicode validation and transcoding.'),
    url: 'https://github.com/simdutf/simdutf',
    licence: 'Apache-2.0 OR MIT',
    dir: 'simdutf-5.2.8',
    files: ['LICENSE-APACHE', 'LICENSE-MIT'],
  },
  highway: {
    name: 'Highway',
    version: '1.2.0',
    about: ghosttyKit('Portable SIMD library.'),
    url: 'https://github.com/google/highway/tree/66486a10623fa0d72fe91260f96c892e41aceb06',
    licence: 'Apache-2.0 OR BSD-3-Clause',
    dir: 'highway-1.2.0',
    files: ['LICENSE', 'LICENSE-BSD3'],
  },
  utfcpp: {
    name: 'UTF8-CPP',
    version: '4.0.5',
    about: ghosttyKit('UTF-8 helper headers.'),
    url: 'https://github.com/nemtrif/utfcpp',
    licence: 'BSL-1.0',
    dir: 'utfcpp-4.0.5',
    files: ['LICENSE'],
  },
  wuffs: {
    name: 'Wuffs',
    version: '0.4.0-alpha.9',
    about: ghosttyKit('Image decoders.'),
    url: 'https://github.com/google/wuffs',
    licence: 'Apache-2.0 OR MIT',
    dir: 'wuffs-0.4.0-alpha.9',
    files: ['LICENSE', 'LICENSE-APACHE', 'LICENSE-MIT'],
  },
  stbImage: {
    name: 'stb_image',
    version: '2.28',
    about: ghosttyKit(
      "PNG decoder (images in the terminal), as Ghostty's source carries it; its licence is the end of stb_image.h.",
    ),
    url: `https://github.com/ghostty-org/ghostty/tree/${GHOSTTY_COMMIT}/src/stb`,
    licence: 'MIT OR Unlicense',
    dir: 'stb_image-2.28',
    files: ['stb_image.h-lines-7948-7986'],
  },
  stbImageResize: {
    name: 'stb_image_resize',
    version: '0.97',
    about: ghosttyKit("Image resizing, as Ghostty's source carries it; its licence is the end of stb_image_resize.h."),
    url: `https://github.com/ghostty-org/ghostty/tree/${GHOSTTY_COMMIT}/src/stb`,
    licence: 'MIT OR Unlicense',
    dir: 'stb_image_resize-0.97',
    files: ['stb_image_resize.h-lines-2595-2633'],
  },
  libxev: {
    name: 'libxev',
    version: '7e7d2f2',
    about: ghosttyKit('Event loop library (Zig).'),
    url: 'https://github.com/mitchellh/libxev/tree/7e7d2f2ab4700544657f8ec268715c8ef320d839',
    licence: 'MIT',
    dir: 'libxev-7e7d2f2',
    files: ['LICENSE'],
  },
  z2d: {
    name: 'z2d',
    version: '0.10.0',
    about: ghosttyKit('2D graphics library (Zig) that draws box and powerline glyphs.'),
    url: 'https://github.com/vancluever/z2d',
    licence: 'MPL-2.0',
    dir: 'z2d-0.10.0',
    files: ['LICENSE', 'COPYING'],
  },
  zigObjc: {
    name: 'zig-objc',
    version: 'f356ed0',
    about: ghosttyKit('Objective-C runtime bindings for Zig.'),
    url: 'https://github.com/mitchellh/zig-objc/tree/f356ed02833f0f1b8e84d50bed9e807bf7cdc0ae',
    licence: 'MIT',
    dir: 'zig-objc-f356ed0',
    files: ['LICENSE'],
  },
  uucode: {
    name: 'uucode',
    version: '0.2.0',
    about: ghosttyKit('Unicode data and algorithms (Zig), with Unicode data files.'),
    url: 'https://github.com/jacobsandlund/uucode',
    licence: 'MIT AND Unicode-3.0',
    dir: 'uucode-0.2.0',
    files: ['LICENSE.md', 'licenses-LICENSE_unicode', 'licenses-LICENSE_Bjoern_Hoehrmann'],
  },
  zig: {
    name: 'Zig standard library and compiler-rt',
    version: '0.15.2',
    about: ghosttyKit('Runtime parts of the Zig toolchain that Ghostty is built with.'),
    url: 'https://github.com/ziglang/zig/tree/0.15.2',
    licence: 'MIT',
    dir: 'zig-0.15.2',
    files: ['LICENSE'],
  },
  jetbrainsMono: {
    name: 'JetBrains Mono',
    version: '2.304',
    about: ghosttyKit('Font embedded in Ghostty as its default face (regular, italic and the variable faces).'),
    url: 'https://github.com/JetBrains/JetBrainsMono',
    licence: 'OFL-1.1',
    dir: 'jetbrains-mono-2.304',
    files: ['OFL.txt'],
  },
  nerdFontsSymbols: {
    name: 'Symbols Nerd Font',
    version: '3.4.0',
    about: ghosttyKit(
      'Icon font embedded in Ghostty. Its glyphs come from the icon sets whose licence files Nerd Fonts keeps in src/glyphs (the files named glyphs-…).',
    ),
    url: 'https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0',
    licence: 'MIT',
    dir: 'nerd-fonts-symbols-3.4.0',
    files: ['LICENSE', ...NERD_FONT_GLYPHS],
  },
  libssh2: {
    name: 'libssh2',
    version: '1.11.0',
    about: 'SSH client library the app connects to your computer with.',
    url: 'https://libssh2.org',
    licence: 'BSD-3-Clause',
    dir: 'libssh2-1.11.0',
    files: ['COPYING'],
  },
  openssl: {
    name: 'OpenSSL',
    version: '3.2.0',
    about: 'Cryptography library (libcrypto, libssl) built into libssh2.',
    url: 'https://www.openssl.org',
    licence: 'Apache-2.0',
    dir: 'openssl-3.2.0',
    files: ['LICENSE.txt'],
  },
  jetbrainsMonoNerdFont: {
    name: 'JetBrains Mono Nerd Font',
    version: '3.2.1',
    about:
      'The terminal font: JetBrains Mono 2.304 patched by Nerd Fonts 3.2.1. Its glyphs come from the icon sets whose licence files Nerd Fonts keeps in src/glyphs (the files named glyphs-…).',
    url: 'https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.2.1',
    licence: 'OFL-1.1',
    dir: 'jetbrains-mono-nerd-font-3.2.1',
    files: ['OFL.txt', 'nerd-fonts-LICENSE', ...NERD_FONT_GLYPHS],
  },
  tablerIcons: {
    name: 'Tabler Icons',
    version: '3.38.0-3.45.0',
    about:
      'Icon outlines converted into the session tag and project icons; the converted data is identical for every release from 3.38.0 to 3.45.0, and so is the licence file.',
    url: 'https://github.com/tabler/tabler-icons',
    licence: 'MIT',
    dir: 'tabler-icons-3.45.0',
    files: ['LICENSE'],
  },
  boost: {
    name: 'Boost',
    version: '1.84.0',
    about: "C++ libraries, part of React Native's prebuilt dependencies.",
    url: 'https://www.boost.org',
    licence: 'BSL-1.0',
    dir: 'boost-1.84.0',
    files: ['LICENSE_1_0.txt'],
  },
  doubleConversion: {
    name: 'double-conversion',
    version: '1.1.6',
    about: "Number formatting and parsing, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/google/double-conversion',
    licence: 'BSD-3-Clause',
    dir: 'double-conversion-1.1.6',
    files: ['LICENSE'],
  },
  fastFloat: {
    name: 'fast_float',
    version: '8.0.0',
    about: "Number parsing, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/fastfloat/fast_float',
    licence: 'Apache-2.0 OR BSL-1.0 OR MIT',
    dir: 'fast_float-8.0.0',
    files: ['LICENSE-APACHE', 'LICENSE-BOOST', 'LICENSE-MIT'],
  },
  fmt: {
    name: 'fmt',
    version: '12.1.0',
    about: "Text formatting, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/fmtlib/fmt',
    licence: 'MIT',
    dir: 'fmt-12.1.0',
    files: ['LICENSE'],
  },
  glog: {
    name: 'glog',
    version: '0.3.5',
    about: "Logging, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/google/glog',
    licence: 'BSD-3-Clause',
    dir: 'glog-0.3.5',
    files: ['COPYING'],
  },
  folly: {
    name: 'Folly',
    version: '2024.11.18.00',
    about: "C++ library from Meta, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/facebook/folly',
    licence: 'Apache-2.0',
    dir: 'folly-2024.11.18.00',
    files: ['LICENSE'],
  },
  socketRocket: {
    name: 'SocketRocket',
    version: '0.7.1',
    about: "WebSocket client, part of React Native's prebuilt dependencies.",
    url: 'https://github.com/facebookincubator/SocketRocket',
    licence: 'BSD-3-Clause',
    dir: 'SocketRocket-0.7.1',
    files: ['LICENSE', 'PATENTS'],
  },
  zxingObjc: {
    name: 'ZXingObjC',
    version: '510db5f',
    about: "Barcode decoding, shipped prebuilt inside expo-camera's barcode scanner.",
    url: 'https://github.com/zxingify/zxingify-objc/tree/510db5f6ed293bf2f9e1905d3b8268c502f3fb55',
    licence: 'Apache-2.0',
    dir: 'ZXingObjC-510db5f',
    files: ['COPYING'],
  },
  simpleIcons: {
    name: 'Simple Icons',
    version: '16.36.0',
    about: `Brand logos of 22 apps that the chat core (WebAssembly) draws on tool-call cards (${SIMPLE_ICONS_LOGOS} in the Ghostex main repo); each logo equals this release's icon apart from its title and role.`,
    url: 'https://github.com/simple-icons/simple-icons/tree/16.36.0',
    licence: 'CC0-1.0',
    dir: 'simple-icons-16.36.0',
    files: ['LICENSE.md'],
  },
  simpleIconsSlack: {
    name: 'Simple Icons',
    version: '15.22.0',
    about: `The Slack logo the chat core (WebAssembly) draws on tool-call cards (${SIMPLE_ICONS_LOGOS}/slack.svg in the Ghostex main repo). The chat core's source names Simple Icons 16.36.0 for its logos, which does not hold for this one: 16.36.0 has no Slack icon. The file equals the Slack icon, apart from its title and role, of every release from 1.9.25 to 15.22.0, the last release that has it.`,
    url: 'https://github.com/simple-icons/simple-icons/tree/15.22.0',
    licence: 'CC0-1.0',
    dir: 'simple-icons-15.22.0',
    files: ['LICENSE.md'],
  },
  hermesBoost: {
    name: 'Boost',
    version: '1.86.0',
    about: inHermes("C++ libraries (Boost.Context), from Hermes' partial copy of Boost 1.86.0 under external/boost."),
    url: hermesSource('external/boost'),
    licence: 'BSL-1.0',
    dir: 'boost-1.86.0',
    files: ['LICENSE_1_0.txt'],
  },
  hermesFastFloat: {
    name: 'fast_float',
    version: '8.1.0',
    about: inHermes("Number parsing; Hermes' copy of fast_float.h equals the header of this release."),
    url: 'https://github.com/fastfloat/fast_float/tree/v8.1.0',
    licence: 'Apache-2.0 OR BSL-1.0 OR MIT',
    dir: 'fast_float-8.1.0',
    files: ['LICENSE-APACHE', 'LICENSE-BOOST', 'LICENSE-MIT'],
  },
  dragonbox: {
    name: 'Dragonbox',
    version: 'beeeef9',
    about: inHermes(
      "Number formatting; Hermes' copy of dragonbox.h is this commit's header with one compiler workaround. The first file is the notice at the top of that header.",
    ),
    url: 'https://github.com/jk-jeon/dragonbox/tree/beeeef91cf6fef89a4d4ba5e95d47ca64ccb3a44',
    licence: 'Apache-2.0 WITH LLVM-exception OR BSL-1.0',
    dir: 'dragonbox-beeeef9',
    files: ['dragonbox.h-lines-1-16', 'LICENSE-Apache2-LLVM', 'LICENSE-Boost'],
  },
  dtoa: {
    name: 'dtoa',
    version: HERMES_TAG,
    about: inHermes(
      "David M. Gay's number conversion code (netlib), as Hermes carries it under external/dtoa; its licence is the notice at the top of dtoa.c.",
    ),
    url: hermesSource('external/dtoa'),
    licence: 'dtoa',
    dir: 'dtoa-hermes-v260318099.0.4',
    files: ['dtoa.c-lines-1-18'],
  },
  llvh: {
    name: 'LLVH',
    version: HERMES_TAG,
    about: inHermes(
      "Hermes' copy of LLVM support libraries (external/llvh, from LLVM commit c179d7b). Besides the LLVM licence files, two compiled files carry notices of their own: ConvertUTF.cpp (Unicode, Inc.) and SHA1.cpp (public-domain origin).",
    ),
    url: hermesSource('external/llvh'),
    licence: 'NCSA AND Apache-2.0 WITH LLVM-exception',
    dir: 'llvh-hermes-v260318099.0.4',
    files: [
      'LICENSE.txt',
      'include-llvh-Support-LICENSE.TXT',
      'lib-Support-ConvertUTF.cpp-lines-1-29',
      'lib-Support-SHA1.cpp-lines-1-16',
    ],
  },
  hermesRegex: {
    name: 'Hermes regular expression engine (from libc++)',
    version: HERMES_TAG,
    about: inHermes("The RegExp engine, derived from libc++'s <regex>; its licence file is in include/hermes/Regex."),
    url: hermesSource('include/hermes/Regex'),
    licence: 'NCSA OR MIT',
    dir: 'hermes-regex-v260318099.0.4',
    files: ['LICENSE.TXT'],
  },
  iteratorHelpers: {
    name: 'Iterator helpers (ECMAScript Shims)',
    version: HERMES_TAG,
    about: inHermes(
      "JavaScript polyfill of the iterator helpers compiled into Hermes' internal bytecode (lib/InternalJavaScript, files 05 to 19, which carry the same notice); the text is that notice from the first of them.",
    ),
    url: hermesSource('lib/InternalJavaScript'),
    licence: 'MIT',
    dir: 'iterator-helpers-hermes-v260318099.0.4',
    files: ['05-IteratorHelperDependencies.js-lines-2-24'],
  },
  mathSumPrecise: {
    name: 'Math.sumPrecise polyfill',
    version: HERMES_TAG,
    about: inHermes(
      "JavaScript polyfill compiled into Hermes' internal bytecode (lib/InternalJavaScript/20-MathPrototypeSumPrecise.js). The first file is its notice, which says portions derive from Python and links CPython commit 48dfd74; the second is CPython's licence file at that commit.",
    ),
    url: hermesSource('lib/InternalJavaScript'),
    licence: 'BSD-3-Clause AND PSF-2.0',
    dir: 'math-sum-precise-hermes-v260318099.0.4',
    files: ['20-MathPrototypeSumPrecise.js-lines-2-41', 'cpython-48dfd74-LICENSE'],
  },
  unicodeData: {
    name: 'Unicode Character Database',
    version: '17.0.0',
    about: inHermes(
      'Character property tables that Hermes generates from the Unicode 17.0.0 data files its lib/Platform/Unicode/UnicodeData.inc names (the first file is the header listing them). Those data files point to the Unicode License v3 for their terms; the second file is its standard text from the SPDX License List 3.29.0.',
    ),
    url: 'https://www.unicode.org/Public/17.0.0/ucd/',
    licence: 'Unicode-3.0',
    dir: 'unicode-ucd-17.0.0',
    files: ['UnicodeData.inc-lines-1-18', `${SPDX_LIST}-Unicode-3.0.txt`],
  },
  rust: {
    name: 'Rust standard library',
    version: '1.99.1',
    about:
      "The parts of Rust's standard library compiled into the chat core (core, alloc, std and their in-tree crates); the crates it pulls from crates.io have entries of their own.",
    url: 'https://github.com/rust-lang/rust/tree/1.99.1',
    licence: 'MIT OR Apache-2.0',
    dir: 'rust-1.99.1',
    files: ['COPYRIGHT', 'LICENSE-APACHE', 'LICENSE-MIT'],
  },
  inter: {
    name: 'Inter',
    version: '3.019',
    about:
      "Font (variable, Latin subset) of the Tailscale web client page compiled into the tailcat bridge: the Google Fonts build of Inter 3.019 (git-0a5106e0b). The licence files are the Google Fonts one and the one in Inter's source at that commit.",
    url: 'https://github.com/google/fonts/tree/b0928647ba26c8d55548aa19feb2f7aeba622d4a/ofl/inter',
    licence: 'OFL-1.1',
    dir: 'inter-3.019',
    files: ['OFL.txt', 'LICENSE.txt'],
  },
  tailwindcss: {
    name: 'tailwindcss',
    version: '3.3.3',
    about: webClient("CSS framework; the page's stylesheet holds its base styles (Preflight)."),
    url: npmRelease('tailwindcss', '3.3.3'),
    licence: 'MIT',
    dir: 'tailwindcss-3.3.3',
    files: ['LICENSE'],
  },
  vite: {
    name: 'vite',
    version: '5.1.7',
    about: webClient("Build tool; the page's script holds its module preload polyfill."),
    url: 'https://github.com/vitejs/vite/tree/v5.1.7',
    licence: 'MIT',
    dir: 'vite-5.1.7',
    files: ['LICENSE'],
  },
  rollup: {
    name: 'rollup',
    version: '4.12.0',
    about: webClient("Bundler; the page's script holds the helper code it writes."),
    url: npmRelease('rollup', '4.12.0'),
    licence: 'MIT',
    dir: 'rollup-4.12.0',
    files: ['LICENSE.md'],
  },
  webBabelRuntime: {
    name: '@babel/runtime',
    version: '7.23.4',
    about: WEB_PACKAGE,
    url: npmRelease('@babel/runtime', '7.23.4'),
    licence: 'MIT',
    dir: 'babel-runtime-7.23.4',
    files: ['LICENSE'],
  },
  webFloatingUiCore: {
    name: '@floating-ui/core',
    version: '1.5.0',
    about: WEB_PACKAGE,
    url: npmRelease('@floating-ui/core', '1.5.0'),
    licence: 'MIT',
    dir: 'floating-ui-core-1.5.0',
    files: ['LICENSE'],
  },
  webFloatingUiDom: {
    name: '@floating-ui/dom',
    version: '1.5.3',
    about: WEB_PACKAGE,
    url: npmRelease('@floating-ui/dom', '1.5.3'),
    licence: 'MIT',
    dir: 'floating-ui-dom-1.5.3',
    files: ['LICENSE'],
  },
  webFloatingUiReactDom: {
    name: '@floating-ui/react-dom',
    version: '2.0.4',
    about: WEB_PACKAGE,
    url: npmRelease('@floating-ui/react-dom', '2.0.4'),
    licence: 'MIT',
    dir: 'floating-ui-react-dom-2.0.4',
    files: ['LICENSE'],
  },
  webFloatingUiUtils: {
    name: '@floating-ui/utils',
    version: '0.1.6',
    about: WEB_PACKAGE,
    url: npmRelease('@floating-ui/utils', '0.1.6'),
    licence: 'MIT',
    dir: 'floating-ui-utils-0.1.6',
    files: ['LICENSE'],
  },
  webRadixPrimitive: {
    name: '@radix-ui/primitive',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'core/primitive'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixComposeRefs: {
    name: '@radix-ui/react-compose-refs',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/compose-refs'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixContext: {
    name: '@radix-ui/react-context',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/context'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixDialog: {
    name: '@radix-ui/react-dialog',
    version: '1.0.5',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/dialog'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixDismissableLayer: {
    name: '@radix-ui/react-dismissable-layer',
    version: '1.0.5',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/dismissable-layer'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixFocusGuards: {
    name: '@radix-ui/react-focus-guards',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/focus-guards'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixFocusScope: {
    name: '@radix-ui/react-focus-scope',
    version: '1.0.4',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/focus-scope'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixId: {
    name: '@radix-ui/react-id',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/id'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixPopover: {
    name: '@radix-ui/react-popover',
    version: '1.0.7',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/popover'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixPopper: {
    name: '@radix-ui/react-popper',
    version: '1.1.3',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/popper'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixPortal: {
    name: '@radix-ui/react-portal',
    version: '1.0.4',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_C31C972, 'react/portal'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-c31c972',
    files: ['LICENSE'],
  },
  webRadixPresence: {
    name: '@radix-ui/react-presence',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/presence'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixPrimitiveReact: {
    name: '@radix-ui/react-primitive',
    version: '1.0.3',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/primitive'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixSlot: {
    name: '@radix-ui/react-slot',
    version: '1.0.2',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/slot'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixUseCallbackRef: {
    name: '@radix-ui/react-use-callback-ref',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/use-callback-ref'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixUseControllableState: {
    name: '@radix-ui/react-use-controllable-state',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/use-controllable-state'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixUseEscapeKeydown: {
    name: '@radix-ui/react-use-escape-keydown',
    version: '1.0.3',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/use-escape-keydown'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixUseLayoutEffect: {
    name: '@radix-ui/react-use-layout-effect',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/use-layout-effect'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webRadixUseSize: {
    name: '@radix-ui/react-use-size',
    version: '1.0.1',
    about: WEB_PACKAGE_REPO_LICENCE,
    url: radixRelease(RADIX_RELEASE_333EAF7, 'react/use-size'),
    licence: 'MIT',
    dir: 'radix-ui-primitives-333eaf7',
    files: ['LICENSE'],
  },
  webAriaHidden: {
    name: 'aria-hidden',
    version: '1.2.3',
    about: WEB_PACKAGE,
    url: npmRelease('aria-hidden', '1.2.3'),
    licence: 'MIT',
    dir: 'aria-hidden-1.2.3',
    files: ['LICENSE'],
  },
  webClassnames: {
    name: 'classnames',
    version: '2.3.2',
    about: WEB_PACKAGE,
    url: npmRelease('classnames', '2.3.2'),
    licence: 'MIT',
    dir: 'classnames-2.3.2',
    files: ['LICENSE'],
  },
  webGetNonce: {
    name: 'get-nonce',
    version: '1.0.1',
    about: WEB_PACKAGE,
    url: npmRelease('get-nonce', '1.0.1'),
    licence: 'MIT',
    dir: 'get-nonce-1.0.1',
    files: ['LICENSE'],
  },
  webReact: {
    name: 'react',
    version: '18.2.0',
    about: WEB_PACKAGE,
    url: npmRelease('react', '18.2.0'),
    licence: 'MIT',
    dir: 'react-18.2.0',
    files: ['LICENSE'],
  },
  webReactDom: {
    name: 'react-dom',
    version: '18.2.0',
    about: WEB_PACKAGE,
    url: npmRelease('react-dom', '18.2.0'),
    licence: 'MIT',
    dir: 'react-dom-18.2.0',
    files: ['LICENSE'],
  },
  webReactRemoveScroll: {
    name: 'react-remove-scroll',
    version: '2.5.5',
    about: WEB_PACKAGE,
    url: npmRelease('react-remove-scroll', '2.5.5'),
    licence: 'MIT',
    dir: 'react-remove-scroll-2.5.5',
    files: ['LICENSE'],
  },
  webReactRemoveScrollBar: {
    name: 'react-remove-scroll-bar',
    version: '2.3.4',
    about: webPackageWithoutLicenceText('Anton Korzunov'),
    url: 'https://github.com/theKashey/react-remove-scroll-bar/tree/v2.3.4',
    licence: 'MIT',
    dir: 'react-remove-scroll-bar-2.3.4',
    files: ['README.md-lines-51-52', `${SPDX_LIST}-MIT.txt`],
  },
  webReactStyleSingleton: {
    name: 'react-style-singleton',
    version: '2.2.1',
    about: webPackageWithoutLicenceText('Anton Korzunov'),
    url: 'https://github.com/theKashey/react-style-singleton/tree/v2.2.1',
    licence: 'MIT',
    dir: 'react-style-singleton-2.2.1',
    files: ['package.json-line-34', `${SPDX_LIST}-MIT.txt`],
  },
  webScheduler: {
    name: 'scheduler',
    version: '0.23.0',
    about: WEB_PACKAGE,
    url: npmRelease('scheduler', '0.23.0'),
    licence: 'MIT',
    dir: 'scheduler-0.23.0',
    files: ['LICENSE'],
  },
  webSwr: {
    name: 'swr',
    version: '2.2.4',
    about: WEB_PACKAGE,
    url: npmRelease('swr', '2.2.4'),
    licence: 'MIT',
    dir: 'swr-2.2.4',
    files: ['LICENSE'],
  },
  webTslib: {
    name: 'tslib',
    version: '2.6.2',
    about: WEB_PACKAGE,
    url: npmRelease('tslib', '2.6.2'),
    licence: '0BSD',
    dir: 'tslib-2.6.2',
    files: ['LICENSE.txt'],
  },
  webUseCallbackRef: {
    name: 'use-callback-ref',
    version: '1.3.0',
    about: WEB_PACKAGE,
    url: npmRelease('use-callback-ref', '1.3.0'),
    licence: 'MIT',
    dir: 'use-callback-ref-1.3.0',
    files: ['LICENSE'],
  },
  webUseSidecar: {
    name: 'use-sidecar',
    version: '1.1.2',
    about: WEB_PACKAGE,
    url: npmRelease('use-sidecar', '1.1.2'),
    licence: 'MIT',
    dir: 'use-sidecar-1.1.2',
    files: ['LICENSE'],
  },
  webUseSyncExternalStore: {
    name: 'use-sync-external-store',
    version: '1.2.0',
    about: WEB_PACKAGE,
    url: npmRelease('use-sync-external-store', '1.2.0'),
    licence: 'MIT',
    dir: 'use-sync-external-store-1.2.0',
    files: ['LICENSE'],
  },
  webWouter: {
    name: 'wouter',
    version: '2.12.1',
    about: webPackageWithoutLicenceText('Alexey Taktarov'),
    url: 'https://github.com/molefrog/wouter/tree/v2.12.1',
    licence: 'ISC',
    dir: 'wouter-2.12.1',
    files: ['package.json-line-91', `${SPDX_LIST}-ISC.txt`],
  },
  webZustand: {
    name: 'zustand',
    version: '4.4.7',
    about: WEB_PACKAGE,
    url: npmRelease('zustand', '4.4.7'),
    licence: 'MIT',
    dir: 'zustand-4.4.7',
    files: ['LICENSE'],
  },
} as const satisfies Record<string, PinnedComponent>;

export type PinnedId = keyof typeof PINNED;

type Fingerprinted = { readonly sha256: string; readonly components: readonly PinnedId[] };

/**
 * The folders under `modules/ghostex-native/ios/Vendor`, each fingerprinted (`sha256Tree`) and mapped to what it
 * contains. GhosttyKit is one static library holding Ghostty and every library its iOS build links in; the list
 * follows Ghostty's build (src/build/SharedDeps.zig and the pkg folder) at the commit in its version string. Zig
 * packages that only the command-line TUI imports (vaxis, zf) are absent: that code is compiled out on iOS
 * (src/cli/tui.zig), and their strings are not in the library.
 */
export const VENDOR_FOLDERS: Readonly<Record<string, Fingerprinted>> = {
  'GhosttyKit.xcframework': {
    sha256: '634f3a04a564ebb70e8df8cf2512e4453b478ed16bbe99450ca7094650c9f827',
    components: [
      'ghostty',
      'zlib',
      'freetype',
      'libpng',
      'oniguruma',
      'libintl',
      'sentryNative',
      'mpack',
      'breakpad',
      'glslang',
      'spirvCross',
      'dearImgui',
      'dearBindings',
      'simdutf',
      'highway',
      'utfcpp',
      'wuffs',
      'stbImage',
      'stbImageResize',
      'libxev',
      'z2d',
      'zigObjc',
      'uucode',
      'zig',
      'jetbrainsMono',
      'nerdFontsSymbols',
    ],
  },
  libssh2: {
    sha256: '31f91310f94a2981b55719f8744b07ada4912c7a535253e55378c4528675f924',
    components: ['libssh2', 'openssl'],
  },
};

/**
 * Vendor folders that the app build writes from the Ghostex main repo (gitignored); their third-party code is
 * listed from its sources (the Go modules of the tailcat bridge).
 */
export const HOST_BUILT_VENDOR_FOLDERS: Readonly<Record<string, true>> = { 'Tailcatbridge.xcframework': true };

/** The fonts the app bundles, by file name, fingerprinted (`sha256File`). */
export const FONT_FILES: Readonly<Record<string, Fingerprinted>> = {
  'JetBrainsMonoNerdFont-Regular.ttf': {
    sha256: 'a2f4268a1719b95d1f1448376173a42317919cb598423f18ea327eaca13dd916',
    components: ['jetbrainsMonoNerdFont'],
  },
};

/** Generated source files that carry third-party data, by repo path, fingerprinted (`sha256File`). */
export const GENERATED_DATA_FILES: Readonly<Record<string, Fingerprinted>> = {
  'src/assets/tablerIcons.generated.tsx': {
    sha256: '3a21d46cabdcbfc57b0729c215a93cf4e6c025e94d8fd446b1efd02c5b944652',
    components: ['tablerIcons'],
  },
};

/**
 * The data files the chat core's Rust code compiles in (`include_str!`, `include_bytes!`), by path in the Ghostex
 * main repo, each fingerprinted (`sha256File`) and mapped to the third-party components inside it. A file without
 * components holds only the Ghostex main repo's own work (layout numbers, the agent model catalog).
 */
export const RUST_EMBEDDED_FILES: Readonly<Record<string, Fingerprinted>> = {
  'agent-model-catalog.json': {
    sha256: 'd33af6524faa16db81b151dc6cdd8a295e174d2791ec55c4b6f969c65577f643',
    components: [],
  },
  'packages/gx-chat-core/visual/minimap.json': {
    sha256: 'e6d235b79fff9095fbfe6eac13591b4c0a496acf9a11de1a4cd83bcf5daa6d9a',
    components: [],
  },
  'packages/gx-chat-core/visual/page-card.json': {
    sha256: '63002b83fa4ab898582843d207059807b26cd49ab30297913ac156a34043f9b3',
    components: [],
  },
  'packages/gx-chat-core/visual/tool-apps/airtable.svg': {
    sha256: '9b84898ed383fca20a6eeb710e0dcf660b97759acc552f235c5fee45f1b789a4',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/asana.svg': {
    sha256: '80d351471afe6f74f35ec479205b70843e4c2e5efb7c1ef44e0807f215baa310',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/atlassian.svg': {
    sha256: '562f478861698d5cfa25116e83cbc629907f515ae81a01b4b609a304e3237fe2',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/cloudflare.svg': {
    sha256: 'ce0d79974a2e5c9a7877611d50b2951140f3bd8ebec2239aeaa3286596fa92b7',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/confluence.svg': {
    sha256: 'f2e3008784d4d3ef1225d2f227c4f73b3e7130bd34596ea2899fd64eaafd9e8c',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/discord.svg': {
    sha256: '43d952eeb458763dcedf7cf9a1b2de22c7eb2849210c1fbf9eb301e209471131',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/figma.svg': {
    sha256: '9ed5bff1089551e8cb898eade279828637f470152a84f65e82a26b78ae14c460',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/github.svg': {
    sha256: '547f752a88c084c712f92fcd06639b3424e62f2beef74992548beadf8a559eec',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/gitlab.svg': {
    sha256: '9738ff2c00ee99f868c6d875830c099d69201d413c29d5ddabf845068ac1eae6',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/gmail.svg': {
    sha256: '1c4e4c5b5ce2c59af3a752e545aa13f0b670fa5d1a32f3e9a612f293d9aef978',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/googlecalendar.svg': {
    sha256: '4e6a34645e9de2e05b07648118712b77d9174d6751d32bd0dc78463ee1ecd8c2',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/googledrive.svg': {
    sha256: 'fe82ad7204cb6e02fdf9450598d78acd4a31602281ddd174058f8a96e70c4407',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/hubspot.svg': {
    sha256: 'be91a126eca57026402125fa140734abdb7997b9d015e37e87c5fc0f93c9b91c',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/jira.svg': {
    sha256: '2c5b7115bbc16b9cecbf4408622343a24c2fd5eefb14a8a10f9d75e4428b7f6f',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/linear.svg': {
    sha256: '16d9a858407e95f4058b9e0271b7affc7a92f2c44ab3780fce7cb3563e8f0a10',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/netlify.svg': {
    sha256: 'd73b3fb7eba04398e58269f7ac8c2994968501de19d49491b4954ffbc02f709d',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/notion.svg': {
    sha256: '42127414498dddb3e87a1de5cb383a74e052f3dfd1cfc411812c4d177a5165a9',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/postgresql.svg': {
    sha256: '7b3eea236ac87a74eaf5175a14365a6a309b84143eb5db5ffb66bb0699fd6a3b',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/sentry.svg': {
    sha256: 'e8b819b3aa23fa922e0b9e974f8a86df4a321dd129bc80dde3b0c1eb51dd287c',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/slack.svg': {
    sha256: 'dac5ae7212411cfa9f389f88705fd6fee910623eee89c61094164a88f43151d3',
    components: ['simpleIconsSlack'],
  },
  'packages/gx-chat-core/visual/tool-apps/stripe.svg': {
    sha256: 'd5fd1833bcb72a9da0172f41d133fea22ece5d1d433988007e0c4221eab6a756',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/supabase.svg': {
    sha256: 'a467df02c172f7749a9ca927adcf1bf874d8902af1e57b1ebe980e09e31f0c49',
    components: ['simpleIcons'],
  },
  'packages/gx-chat-core/visual/tool-apps/vercel.svg': {
    sha256: 'ce38f7027a13618790afdd2f3763f0a94d666a8ae3739a6e464513d53a5335bd',
    components: ['simpleIcons'],
  },
};

/**
 * The files that Go packages linked into the tailcat bridge embed (`//go:embed`), by the `path@version` of their
 * module and then by path in the module, each fingerprinted (`sha256File`) and mapped to the third-party
 * components inside it. A file without components holds only its module's own work, which the module's entry
 * covers (Tailscale's version and DNS fallback data, tailcat's README, the web client page's HTML).
 */
export const GO_EMBEDDED_FILES: Readonly<Record<string, Readonly<Record<string, Fingerprinted>>>> = {
  'github.com/tailscale/tailcat@v0.6.0': {
    'README.md': { sha256: '53439e71dcb60a535de0d82f072deb417a990a3b2eff4b82f35d77b78bb2ee1c', components: [] },
  },
  'github.com/tailscale/web-client-prebuilt@v0.0.0-20250124233751-d4cd19a26976': {
    'build/index.html': { sha256: '329206698f2882cec38a917f7adac14615f7178ebf5936283f2e939fe214b358', components: [] },
    'build/assets/Inter.var.latin-Dxq58mVK.woff2': {
      sha256: '39e72c0794c12f2dbb14a0f61ca946b535f795b1478fcf795bd26e5cb52ded34',
      components: ['inter'],
    },
    'build/assets/index-DVk8gqX9.css.gz': {
      sha256: '74b1f29b0be3226675d0d342eb1e447f29053f21bc64fb9831c7f897231fae70',
      components: ['tailwindcss'],
    },
    'build/assets/index-BbZBz4S-.js.gz': {
      sha256: 'afcaf7d02cdc01ef53033a0d3eeb890215280b1a66ba2f4f5ac937cd04645cbb',
      components: [
        'webBabelRuntime',
        'webFloatingUiCore',
        'webFloatingUiDom',
        'webFloatingUiReactDom',
        'webFloatingUiUtils',
        'webRadixPrimitive',
        'webRadixComposeRefs',
        'webRadixContext',
        'webRadixDialog',
        'webRadixDismissableLayer',
        'webRadixFocusGuards',
        'webRadixFocusScope',
        'webRadixId',
        'webRadixPopover',
        'webRadixPopper',
        'webRadixPortal',
        'webRadixPresence',
        'webRadixPrimitiveReact',
        'webRadixSlot',
        'webRadixUseCallbackRef',
        'webRadixUseControllableState',
        'webRadixUseEscapeKeydown',
        'webRadixUseLayoutEffect',
        'webRadixUseSize',
        'webAriaHidden',
        'webClassnames',
        'webGetNonce',
        'webReact',
        'webReactDom',
        'webReactRemoveScroll',
        'webReactRemoveScrollBar',
        'webReactStyleSingleton',
        'webScheduler',
        'webSwr',
        'webTslib',
        'webUseCallbackRef',
        'webUseSidecar',
        'webUseSyncExternalStore',
        'webWouter',
        'webZustand',
        'vite',
        'rollup',
      ],
    },
  },
  'tailscale.com@v1.103.0-pre.0.20260904030409-31d8badb3bfb': {
    'ALPINE.txt': { sha256: '70159003c3341c3776f60c4b5a50ba2e3b26295aa0f27a26ba248cb6fc7ef60d', components: [] },
    'VERSION.txt': { sha256: 'e1aa83e832fbd3099bad45d0fe11cd8a7e98e797c2be106f006a021dac72d192', components: [] },
    'go.toolchain.next.rev': {
      sha256: 'f4d72594f37a77b9fb7abd146957d19c6bdd6be714aec361f0cf89916fed7901',
      components: [],
    },
    'go.toolchain.rev': { sha256: 'f4d72594f37a77b9fb7abd146957d19c6bdd6be714aec361f0cf89916fed7901', components: [] },
    'net/dnsfallback/dns-fallback-servers.json': {
      sha256: 'b9f2319a2182aad958222bbac3c2e4f8332920af702df9099a5cfd909d080b11',
      components: [],
    },
  },
};

/**
 * React Native's prebuilt dependencies (the ReactNativeDependencies framework), by the `name@version` of the pod
 * that stands in for each in `ios/Podfile.lock`.
 */
export const REACT_NATIVE_DEPENDENCY_PODS: Readonly<Record<string, PinnedId>> = {
  'boost@1.84.0': 'boost',
  'DoubleConversion@1.1.6': 'doubleConversion',
  'fast_float@8.0.0': 'fastFloat',
  'fmt@12.1.0': 'fmt',
  'glog@0.3.5': 'glog',
  'RCT-Folly@2024.11.18.00': 'folly',
  'SocketRocket@0.7.1': 'socketRocket',
};

/**
 * The third-party code inside the prebuilt Hermes engine, by Hermes version (the `hermes-engine` pod's version in
 * `ios/Podfile.lock`): what its runtime compiles and links in at that release's tag, besides Meta's own code
 * (whose licence is the pod's own file).
 */
export const HERMES_COMPONENTS: Readonly<Record<string, readonly PinnedId[]>> = {
  '260318099.0.4': [
    'hermesBoost',
    'hermesFastFloat',
    'dragonbox',
    'dtoa',
    'llvh',
    'hermesRegex',
    'iteratorHelpers',
    'mathSumPrecise',
    'unicodeData',
  ],
};

/** Swift packages an npm package ships prebuilt (its `spm.config.json`), by `product@revision`. */
export const SWIFT_PACKAGES: Readonly<Record<string, PinnedId>> = {
  'ZXingObjC@510db5f6ed293bf2f9e1905d3b8268c502f3fb55': 'zxingObjc',
};

/** The Rust standard library's top-level licence files, by toolchain version (`rust-toolchain.toml`). */
export const RUST_TOOLCHAINS: Readonly<Record<string, PinnedId>> = { '1.99.1': 'rust' };

/**
 * npm packages published without a licence file, by `name@version`: the copy comes from the monorepo they are
 * published from, at the release (tag or version commit) that published that version.
 */
export const NPM_LICENCE_COPIES: Readonly<Record<string, { readonly dir: string; readonly files: readonly string[] }>> =
  {
    '@react-native/asset-utils@0.88.0': { dir: 'react-native-0.88.0', files: ['LICENSE'] },
    '@react-native/js-polyfills@0.88.0': { dir: 'react-native-0.88.0', files: ['LICENSE'] },
    '@react-native/js-polyfills@0.88.1': { dir: 'react-native-0.88.1', files: ['LICENSE'] },
    '@react-native/normalize-colors@0.88.0': { dir: 'react-native-0.88.0', files: ['LICENSE'] },
    '@react-native/virtualized-lists@0.88.0': { dir: 'react-native-0.88.0', files: ['LICENSE'] },
    'expo-structured-headers@58.0.1': { dir: 'expo-f5f64f9', files: ['LICENSE'] },
    'expo-updates@58.0.17': { dir: 'expo-4c90d63', files: ['LICENSE'] },
    'metro-runtime@0.87.1': { dir: 'metro-0.87.1', files: ['LICENSE'] },
  };
