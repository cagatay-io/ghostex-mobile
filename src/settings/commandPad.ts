/**
 * The Befehlspad's stored settings: its nine keys and where the user moved it.
 *
 * `commandPadKeys` in `settings.v1`, one string per position, row by row from the top left (schema
 * `settings-additions.schema.json`; absent or invalid = the default nine). What a string means is resolved by the
 * pad (`components/terminal/commandPadKeys.ts`); this file only owns the id vocabulary, the default and the shape
 * check, so the settings store needs nothing from the pad.
 *
 * Ids:
 * - `key:<id>`: a built-in key or modifier of the extra-keys catalogue (`extraKeys.ts`), e.g. `key:esc`, `key:ctrl`.
 * - `page:<id>`: an item of the former KEYS page (`keyBarPages.ts`), e.g. `page:page-ctrl-c`.
 * - `agent:<agent>:<hotkey id>`: an agent hotkey by reference (`agentHotkeys.ts`), so its edits follow.
 * - `custom:<action id>`: a custom action of the extra-keys layout by reference (insert text, text and Enter,
 *   shortcut), so its edits follow (owner D-062). A deleted action or hotkey leaves the position "not available".
 * - `paste`, `upload`.
 */

export const COMMAND_PAD_KEY_COUNT = 9;

/** The positions in storage order. */
export const COMMAND_PAD_POSITIONS = [
  'topLeft',
  'top',
  'topRight',
  'left',
  'centre',
  'right',
  'bottomLeft',
  'bottom',
  'bottomRight',
] as const;
export type CommandPadPosition = (typeof COMMAND_PAD_POSITIONS)[number];

export const COMMAND_PAD_PASTE_ID = 'paste';
export const COMMAND_PAD_UPLOAD_ID = 'upload';

export function catalogKeyId(catalogId: string): string {
  return `key:${catalogId}`;
}

export function pageKeyId(pageItemId: string): string {
  return `page:${pageItemId}`;
}

export function agentHotkeyId(agentId: string, hotkeyId: string): string {
  return `agent:${agentId}:${hotkeyId}`;
}

export function customActionId(actionId: string): string {
  return `custom:${actionId}`;
}

/**
 * The default set (D-026: arrows, Enter, Esc, Upload, Tab, Ctrl+C) in the approved layout (D-034,
 * `mockups/befehlspad`): arrows around Enter in the centre, Esc top left, Ctrl+C top right, Tab bottom left,
 * Upload bottom right.
 */
export const DEFAULT_COMMAND_PAD_KEYS: readonly string[] = [
  catalogKeyId('esc'),
  catalogKeyId('up'),
  pageKeyId('page-ctrl-c'),
  catalogKeyId('left'),
  catalogKeyId('enter'),
  catalogKeyId('right'),
  catalogKeyId('tab'),
  catalogKeyId('down'),
  COMMAND_PAD_UPLOAD_ID,
];

/** A stored value that is nine non-empty strings, or null (the store then keeps the default). */
export function sanitizeCommandPadKeys(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== COMMAND_PAD_KEY_COUNT) return null;
  if (!value.every((entry): entry is string => typeof entry === 'string' && entry.length > 0)) return null;
  return [...value];
}

/** The layouts with a position of their own: `flat` (every pose but laptop) and `laptop` (half folded). */
export type CommandPadLayoutKind = 'flat' | 'laptop';

/**
 * Where the user moved the pad in one layout: the side edge it snapped to, and its height as a
 * fraction of the room it has in that layout (0 = top, 1 = bottom), so it survives window and keyboard changes.
 */
export type CommandPadPlacement = { side: 'left' | 'right'; height: number };

/** `commandPadPosition` in `settings.v1`: one placement per layout; an absent layout uses the default position. */
export type CommandPadPositions = Partial<Record<CommandPadLayoutKind, CommandPadPlacement>>;

const COMMAND_PAD_LAYOUTS: readonly CommandPadLayoutKind[] = ['flat', 'laptop'];

function sanitizePlacement(value: unknown): CommandPadPlacement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { side, height, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (side !== 'left' && side !== 'right') return null;
  if (typeof height !== 'number' || !Number.isFinite(height) || height < 0 || height > 1) return null;
  return { side, height };
}

/**
 * The stored positions as the schema allows them: a layout with an invalid value, and any unknown key, is dropped,
 * so that layout uses the default position; nothing is thrown.
 */
export function sanitizeCommandPadPosition(value: unknown): CommandPadPositions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const positions: CommandPadPositions = {};
  for (const layout of COMMAND_PAD_LAYOUTS) {
    const placement = sanitizePlacement(record[layout]);
    if (placement !== null) positions[layout] = placement;
  }
  return positions;
}
