/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { GhosttyImportError, importGhosttyTheme, parseGhosttyTheme, sanitizeImportedTerminalPalettes } from './importGhostty';
import { terminalColours, type TerminalColourSettings } from './terminalColours';
import { terminalPalette, terminalPaletteNames } from './terminalPalettes';

const ANSI = [
  '#000000', '#aa0000', '#00aa00', '#aaaa00', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
  '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];
const lines = ANSI.map((color, index) => `palette = ${index}=${color}`);
const themeText = [
  '# Private theme',
  'background = 282A36',
  'foreground = "#F8F8F2"',
  'cursor-color = #ff5555',
  'selection-background = #44475a',
  'selection-foreground = #ffffff',
  ...lines,
  // These are ignored, never executed, loaded, or retained.
  'command = echo ignored',
  'config-file = https://example.invalid/theme',
  'font-size = 80',
].join('\r\n');
const settings = (): TerminalColourSettings & { fontSize: number; sessionChatTheme: string } => ({
  sidebarTheme: 'system', darkThemePreset: 'gray', lightThemePreset: 'gray',
  customSidebarTitlebarBackgroundTintColor: '#808080', customSidebarTitlebarLightBackgroundTintColor: '#808080',
  customSidebarTitlebarBackgroundDarknessPercent: 96, customSidebarTitlebarLightBackgroundLightnessPercent: 96,
  themeSidebarContrast: 0, themeWorkAreaContrast: 0,
  terminalGhosttyTheme: 'GitHub Dark', terminalGhosttyLightTheme: 'GitHub Light Default',
  terminalBackgroundMode: 'pure', workspaceBackgroundColor: '', terminalColorScheme: 'app',
  fontSize: 14, sessionChatTheme: 'dark',
});

function rejected(text: string): void {
  const before = settings();
  const snapshot = structuredClone(before);
  const names = terminalPaletteNames(undefined, before.importedTerminalPalettes);
  assert.throws(() => importGhosttyTheme(before, text, 'Private.ghostty'), GhosttyImportError);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(terminalPaletteNames(undefined, before.importedTerminalPalettes), names);
}

describe('Ghostty terminal palette import', () => {
  test('a valid file becomes a private palette next to bundled palettes without changing any other setting', () => {
    const before = settings();
    const snapshot = structuredClone(before);
    const after = importGhosttyTheme(before, themeText, 'Private.ghostty');
    const { importedTerminalPalettes, ...unchanged } = after;
    assert.deepEqual(before, snapshot);
    assert.deepEqual(unchanged, before);
    assert.deepEqual(importedTerminalPalettes, [{
      schemaVersion: 1, id: 'imported-1', name: 'Private', origin: 'imported',
      palette: {
        background: '#282a36', foreground: '#f8f8f2', cursor: '#ff5555',
        selectionBackground: '#44475a', selectionForeground: '#ffffff', palette: ANSI,
      },
    }]);
    assert.ok(!Object.hasOwn(importedTerminalPalettes[0]!, 'license'));
    const names = terminalPaletteNames(undefined, importedTerminalPalettes);
    assert.ok(names.includes('Private'));
    assert.ok(names.includes('GitHub Dark'));
    assert.ok(names.includes('GitHub Light Default'));
    assert.deepEqual(terminalPalette('Private', importedTerminalPalettes)?.ansi, ANSI);
  });

  test('missing background shows a validation error and leaves the palette list and settings unchanged', () => {
    rejected(themeText.replace('background = 282A36', ''));
  });

  test('fifteen palette slots show a validation error and leave the list unchanged', () => {
    rejected(['background = #000000', 'foreground = #ffffff', ...lines.slice(0, 15)].join('\n'));
  });

  test('sixteen copies of index zero show a validation error and leave the list unchanged', () => {
    rejected(['background = #000000', 'foreground = #ffffff', ...Array(16).fill('palette = 0=#000000')].join('\n'));
  });

  test('missing foreground, invalid optional colours, out-of-range indices and inline comments are rejected', () => {
    rejected(themeText.replace('foreground = "#F8F8F2"', ''));
    rejected(themeText.replace('cursor-color = #ff5555', 'cursor-color = red'));
    rejected(`${themeText}\npalette = 16=#000000`);
    rejected(themeText.replace('background = 282A36', 'background = #282a36 # not a full-line comment'));
  });

  test('palette indices are ordered and support Ghostty numeric prefixes; optional colours may be absent', () => {
    const text = ['background=#000000', 'foreground=ffffff', ...lines.toReversed()]
      .join('\n').replace('palette = 15=', 'palette = 0xf=');
    const parsed = parseGhosttyTheme(text);
    assert.deepEqual(parsed, {
      background: '#000000', foreground: '#ffffff',
      palette: ANSI.map((color, index) => ({ index, color })),
    });
  });

  test('choosing the import in either mode uses its colours and preserves existing background and selection rules', () => {
    const imported = importGhosttyTheme(settings(), themeText, 'Private');
    const dark = terminalColours({ ...imported, terminalGhosttyTheme: 'Private', terminalColorScheme: 'dark' }, true);
    const light = terminalColours({ ...imported, terminalGhosttyLightTheme: 'Private', terminalColorScheme: 'light' }, false);
    assert.deepEqual(dark, {
      light: false, background: '#000000', foreground: '#f8f8f2', cursor: '#ff5555',
      selectionBackground: '#44475a', palette: ANSI,
    });
    assert.deepEqual(light, {
      light: true, background: '#ffffff', foreground: '#f8f8f2', cursor: '#ff5555', palette: ANSI,
    });
  });

  test('repeat filenames and bundled names append uniquely without replacing any palette', () => {
    const first = importGhosttyTheme(settings(), themeText, 'GitHub Dark.ghostty');
    const second = importGhosttyTheme(first, themeText, 'GitHub Dark.ghostty');
    assert.deepEqual(second.importedTerminalPalettes.map(({ id, name }) => ({ id, name })), [
      { id: 'imported-1', name: 'GitHub Dark (2)' }, { id: 'imported-2', name: 'GitHub Dark (3)' },
    ]);
    assert.deepEqual(first.importedTerminalPalettes[0], second.importedTerminalPalettes[0]);
    assert.equal(terminalPalette('GitHub Dark', second.importedTerminalPalettes)?.foreground, '#8b949e');
  });

  test('stored imports round-trip; unsupported versions, licences and malformed palettes are not loaded', () => {
    const stored = importGhosttyTheme(settings(), themeText, 'Private').importedTerminalPalettes;
    assert.deepEqual(sanitizeImportedTerminalPalettes(JSON.parse(JSON.stringify(stored))), stored);
    assert.equal(sanitizeImportedTerminalPalettes(undefined), undefined);
    for (const invalid of [
      { ...stored[0], schemaVersion: 2 }, { ...stored[0], origin: 'bundled' },
      { ...stored[0], license: {} }, { ...stored[0], palette: { ...stored[0]!.palette, palette: ANSI.slice(1) } },
    ]) assert.deepEqual(sanitizeImportedTerminalPalettes([invalid]), []);
    assert.deepEqual(sanitizeImportedTerminalPalettes([...stored, ...stored]), stored);
  });
});
