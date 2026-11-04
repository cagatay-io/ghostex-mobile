/** Private terminal palettes imported from local Ghostty theme text; no app colours or provenance are imported. */
import { terminalPaletteNames } from './terminalPalettes';

export type ParsedGhosttyTheme = {
  background: string;
  foreground: string;
  'cursor-color'?: string;
  'selection-background'?: string;
  'selection-foreground'?: string;
  palette: { index: number; color: string }[];
};

/** The phone's stored import format; the source file and its other settings are not retained. */
export type ImportedTerminalPalette = {
  schemaVersion: 1;
  id: string;
  name: string;
  origin: 'imported';
  palette: {
    background: string;
    foreground: string;
    cursor?: string;
    selectionBackground?: string;
    selectionForeground?: string;
    palette: string[];
  };
};

export class GhosttyImportError extends Error {}

const COLOUR_KEYS = ['background', 'foreground', 'cursor-color', 'selection-background', 'selection-foreground'] as const;
const HEX = /^#?[0-9a-f]{6}$/i;
const STORED_HEX = /^#[0-9a-f]{6}$/i;

function colour(value: string): string {
  if (!HEX.test(value)) throw new GhosttyImportError('Use six-digit RGB hex colours, with or without #.');
  return `#${value.replace(/^#/, '').toLowerCase()}`;
}

/** Ghostty uses full-line comments, the first = as separator, and optional double quotes around a value. */
export function parseGhosttyTheme(text: string): ParsedGhosttyTheme {
  const colours: Partial<Record<(typeof COLOUR_KEYS)[number], string>> = {};
  const slots = new Map<number, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key === 'palette') {
      const entry = /^(\d+|0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)\s*=\s*(.*)$/.exec(value);
      const index = entry === null ? -1 : Number(entry[1]);
      if (!Number.isInteger(index) || index < 0 || index > 15 || slots.has(index)) {
        throw new GhosttyImportError('Include each palette index from 0 to 15 exactly once.');
      }
      slots.set(index, colour(entry![2]!));
    } else if ((COLOUR_KEYS as readonly string[]).includes(key)) {
      colours[key as (typeof COLOUR_KEYS)[number]] = colour(value);
    }
  }
  if (colours.background === undefined || colours.foreground === undefined || slots.size !== 16) {
    throw new GhosttyImportError('Include background and foreground colours, plus all sixteen palette entries.');
  }
  return {
    ...colours,
    background: colours.background,
    foreground: colours.foreground,
    palette: Array.from({ length: 16 }, (_, index) => ({ index, color: slots.get(index)! })),
  };
}

/** Append only after validation; preserve every existing setting, including the selected palettes. */
export function importGhosttyTheme<Settings extends { importedTerminalPalettes?: ImportedTerminalPalette[] }>(
  settings: Settings,
  text: string,
  fileName: string,
): Settings & { importedTerminalPalettes: ImportedTerminalPalette[] } {
  const parsed = parseGhosttyTheme(text);
  const existing = settings.importedTerminalPalettes ?? [];
  const usedNames = new Set(terminalPaletteNames(undefined, existing));
  const baseName =
    (fileName.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '').trim().slice(0, 48) || 'Imported palette';
  let name = baseName;
  for (let suffix = 2; usedNames.has(name); suffix += 1) {
    const ending = ` (${suffix})`;
    name = `${baseName.slice(0, 48 - ending.length)}${ending}`;
  }
  const ids = new Set(existing.map((palette) => palette.id));
  let number = 1;
  while (ids.has(`imported-${number}`)) number += 1;
  const palette: ImportedTerminalPalette['palette'] = {
    background: parsed.background,
    foreground: parsed.foreground,
    palette: parsed.palette.map((entry) => entry.color),
  };
  if (parsed['cursor-color'] !== undefined) palette.cursor = parsed['cursor-color'];
  if (parsed['selection-background'] !== undefined) palette.selectionBackground = parsed['selection-background'];
  if (parsed['selection-foreground'] !== undefined) palette.selectionForeground = parsed['selection-foreground'];
  return {
    ...settings,
    importedTerminalPalettes: [
      ...existing,
      { schemaVersion: 1, id: `imported-${number}`, name, origin: 'imported', palette },
    ],
  };
}

/** Read the additive settings field without changing the shape of settings saved before imports existed. */
export function sanitizeImportedTerminalPalettes(value: unknown): ImportedTerminalPalette[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const names = new Set(terminalPaletteNames());
  return value.filter((entry): entry is ImportedTerminalPalette => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    if (
      item.schemaVersion !== 1 ||
      item.origin !== 'imported' ||
      typeof item.id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,47}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      item.name.trim() === '' ||
      item.name.length > 48 ||
      names.has(item.name) ||
      Object.keys(item).some((key) => !['schemaVersion', 'id', 'name', 'origin', 'palette'].includes(key))
    ) return false;
    const palette = item.palette;
    if (palette === null || typeof palette !== 'object' || Array.isArray(palette)) return false;
    const colours = palette as Record<string, unknown>;
    if (
      typeof colours.background !== 'string' ||
      !STORED_HEX.test(colours.background) ||
      typeof colours.foreground !== 'string' ||
      !STORED_HEX.test(colours.foreground) ||
      !Array.isArray(colours.palette) ||
      colours.palette.length !== 16 ||
      !colours.palette.every((value) => typeof value === 'string' && STORED_HEX.test(value)) ||
      Object.keys(colours).some((key) =>
        !['background', 'foreground', 'cursor', 'selectionBackground', 'selectionForeground', 'palette'].includes(key),
      ) ||
      ['cursor', 'selectionBackground', 'selectionForeground'].some((key) =>
        colours[key] !== undefined && (typeof colours[key] !== 'string' || !STORED_HEX.test(colours[key] as string)),
      )
    ) return false;
    ids.add(item.id);
    names.add(item.name);
    return true;
  });
}
