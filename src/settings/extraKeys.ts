/**
 * Extra-keys layout (Settings › Keyboard › Extra keys layout): the two key rows of the key bar (Android) and of the
 * Befehlspad's Keys layer (iOS), and the built-in keys and custom actions the pad's nine positions can take.
 * User-editable: built-in keys/modifiers
 * from a fixed catalog plus custom actions (insert text, insert text + Enter, shortcut with modifiers).
 * Persisted to AsyncStorage under extraKeys.v1; invalid persisted layouts fall
 * back to the spec default (terminal-screen.md §2).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { KeyModifiers, TerminalKey } from '../../modules/ghostex-native/src';

const EXTRA_KEYS_STORAGE_KEY = 'extraKeys.v1';

export const EXTRA_KEYS_ROW_COUNT = 2;
export const EXTRA_KEYS_MAX_PER_ROW = 8;
export const EXTRA_KEYS_MIN_PER_ROW = 1;
export const EXTRA_KEY_TEXT_MAX_LENGTH = 200;
export const EXTRA_KEY_LABEL_MAX_LENGTH = 8;

export type ExtraKeyModifier = 'ctrl' | 'alt' | 'shift';
export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

/**
 * One saved slot of the layout (what goes to AsyncStorage). A custom action carries a stable `id`, so a Befehlspad
 * position can refer to it and follow its later edits; layouts saved before it had one get theirs on
 * load (`sanitizeLayout`).
 */
export type ExtraKeyStored =
  | { type: 'builtin'; id: string }
  | { type: 'text'; id: string; label: string; text: string; sendEnter: boolean }
  | { type: 'shortcut'; id: string; label: string; key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };

/** A new custom action's id: unique on this phone, never reused. */
export function makeCustomActionId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ExtraKeysLayout = ExtraKeyStored[][];

/** Resolved item the key bar, the Befehlspad's Keys layer and pad keys render. */
export type ResolvedExtraKey =
  | { id: string; kind: 'modifier'; label: string; modifier: ExtraKeyModifier }
  | {
      id: string;
      kind: 'key';
      label?: string;
      arrow?: ArrowDirection;
      returnGlyph?: boolean;
      key: TerminalKey;
      mods?: KeyModifiers;
      repeatable?: boolean;
    }
  | { id: string; kind: 'text'; label: string; text: string; sendEnter: boolean };

type CatalogKeyEntry = {
  id: string;
  label: string;
  key: TerminalKey;
  mods?: KeyModifiers;
  repeatable?: boolean;
  arrow?: ArrowDirection;
  returnGlyph?: boolean;
};

const CATALOG_MODIFIERS: { id: ExtraKeyModifier; label: string }[] = [
  { id: 'ctrl', label: 'CTRL' },
  { id: 'alt', label: 'ALT' },
  { id: 'shift', label: 'SHIFT' },
];

const CATALOG_KEYS: CatalogKeyEntry[] = [
  { id: 'esc', label: 'ESC', key: 'escape' },
  { id: 'tab', label: 'TAB', key: 'tab' },
  { id: 'enter', label: 'ENTER', key: 'enter' },
  // NEWLN = Ctrl-J: newline without submitting in most agent composers.
  { id: 'newln', label: 'NEWLN', key: 'j', mods: { ctrl: true }, returnGlyph: true },
  { id: 'backspace', label: 'BKSP', key: 'backspace' },
  { id: 'delete', label: 'DEL', key: 'delete' },
  { id: 'insert', label: 'INS', key: 'insert' },
  { id: 'home', label: 'HOME', key: 'home', repeatable: true },
  { id: 'end', label: 'END', key: 'end', repeatable: true },
  { id: 'pgup', label: 'PGUP', key: 'pageUp', repeatable: true },
  { id: 'pgdn', label: 'PGDN', key: 'pageDown', repeatable: true },
  { id: 'up', label: 'UP', key: 'up', repeatable: true, arrow: 'up' },
  { id: 'down', label: 'DOWN', key: 'down', repeatable: true, arrow: 'down' },
  { id: 'left', label: 'LEFT', key: 'left', repeatable: true, arrow: 'left' },
  { id: 'right', label: 'RIGHT', key: 'right', repeatable: true, arrow: 'right' },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `f${index + 1}`,
    label: `F${index + 1}`,
    key: `f${index + 1}` as TerminalKey,
  })),
];

const CATALOG_KEYS_BY_ID = new Map(CATALOG_KEYS.map((entry) => [entry.id, entry]));
const CATALOG_MODIFIERS_BY_ID = new Map(CATALOG_MODIFIERS.map((entry) => [entry.id, entry]));

/** Every built-in the editor can offer, modifiers first. */
export function extraKeyCatalog(): { id: string; label: string; isModifier: boolean }[] {
  return [
    ...CATALOG_MODIFIERS.map((entry) => ({ id: entry.id, label: entry.label, isModifier: true })),
    ...CATALOG_KEYS.map((entry) => ({ id: entry.id, label: entry.label, isModifier: false })),
  ];
}

/** Shortcut target keys the custom-action editor accepts (plus any single character). */
export const SHORTCUT_KEY_NAMES: string[] = [
  'escape',
  'tab',
  'enter',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'pageUp',
  'pageDown',
  'up',
  'down',
  'left',
  'right',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
];

/** Default layout, verbatim from the spec (§2). */
export function defaultExtraKeysLayout(): ExtraKeysLayout {
  return [
    [
      { type: 'builtin', id: 'esc' },
      { type: 'builtin', id: 'shift' },
      { type: 'builtin', id: 'newln' },
      { type: 'builtin', id: 'home' },
      { type: 'builtin', id: 'up' },
      { type: 'builtin', id: 'end' },
      { type: 'builtin', id: 'pgup' },
    ],
    [
      { type: 'builtin', id: 'tab' },
      { type: 'builtin', id: 'ctrl' },
      { type: 'builtin', id: 'alt' },
      { type: 'builtin', id: 'left' },
      { type: 'builtin', id: 'down' },
      { type: 'builtin', id: 'right' },
      { type: 'builtin', id: 'pgdn' },
    ],
  ];
}

/** Human-readable validation failure, or null when the layout is savable. */
export function validateExtraKeysLayout(layout: ExtraKeysLayout): string | null {
  if (layout.length !== EXTRA_KEYS_ROW_COUNT) return 'The layout must have exactly two rows.';
  for (const [rowIndex, row] of layout.entries()) {
    if (row.length < EXTRA_KEYS_MIN_PER_ROW) {
      return `Row ${rowIndex + 1} needs at least ${EXTRA_KEYS_MIN_PER_ROW} key.`;
    }
    if (row.length > EXTRA_KEYS_MAX_PER_ROW) {
      return `Row ${rowIndex + 1} can hold at most ${EXTRA_KEYS_MAX_PER_ROW} keys.`;
    }
    for (const item of row) {
      const error = validateStoredItem(item);
      if (error !== null) return error;
    }
  }
  return null;
}

/** Human-readable validation failure of one saved slot, or null when it is valid (also the pad's custom keys). */
export function validateStoredItem(item: ExtraKeyStored): string | null {
  switch (item.type) {
    case 'builtin':
      if (!CATALOG_KEYS_BY_ID.has(item.id) && !CATALOG_MODIFIERS_BY_ID.has(item.id as ExtraKeyModifier)) {
        return `Unknown key "${item.id}".`;
      }
      return null;
    case 'text': {
      if (item.label.trim().length === 0) return 'Custom text actions need a label.';
      if (item.label.length > EXTRA_KEY_LABEL_MAX_LENGTH) {
        return `Labels can be at most ${EXTRA_KEY_LABEL_MAX_LENGTH} characters.`;
      }
      if (item.text.length === 0) return `"${item.label}" has no text to insert.`;
      if (item.text.length > EXTRA_KEY_TEXT_MAX_LENGTH) {
        return `"${item.label}" text is longer than ${EXTRA_KEY_TEXT_MAX_LENGTH} characters.`;
      }
      return null;
    }
    case 'shortcut': {
      if (item.label.trim().length === 0) return 'Shortcut actions need a label.';
      if (item.label.length > EXTRA_KEY_LABEL_MAX_LENGTH) {
        return `Labels can be at most ${EXTRA_KEY_LABEL_MAX_LENGTH} characters.`;
      }
      if (!SHORTCUT_KEY_NAMES.includes(item.key) && item.key.length !== 1) {
        return `"${item.label}" has an unsupported shortcut key "${item.key}".`;
      }
      return null;
    }
  }
}

/** Resolve one stored slot for rendering (the pad's Keys layer and pad keys); null drops unknown persisted items. */
export function resolveStoredItem(item: ExtraKeyStored, slotId: string): ResolvedExtraKey | null {
  switch (item.type) {
    case 'builtin': {
      const modifier = CATALOG_MODIFIERS_BY_ID.get(item.id as ExtraKeyModifier);
      if (modifier !== undefined) {
        return { id: slotId, kind: 'modifier', label: modifier.label, modifier: modifier.id };
      }
      const key = CATALOG_KEYS_BY_ID.get(item.id);
      if (key === undefined) return null;
      return {
        id: slotId,
        kind: 'key',
        label: key.label,
        arrow: key.arrow,
        returnGlyph: key.returnGlyph,
        key: key.key,
        mods: key.mods,
        repeatable: key.repeatable,
      };
    }
    case 'text':
      return { id: slotId, kind: 'text', label: item.label, text: item.text, sendEnter: item.sendEnter };
    case 'shortcut':
      return {
        id: slotId,
        kind: 'key',
        label: item.label,
        key: item.key as TerminalKey,
        mods: { ctrl: item.ctrl === true, alt: item.alt === true, shift: item.shift === true },
      };
  }
}

export function resolveExtraKeysLayout(layout: ExtraKeysLayout): ResolvedExtraKey[][] {
  return layout.map((row, rowIndex) =>
    row
      .map((item, itemIndex) => resolveStoredItem(item, `r${rowIndex}-${itemIndex}`))
      .filter((item): item is ResolvedExtraKey => item !== null),
  );
}

/** Display label for one stored slot (editor chips). */
export function storedItemLabel(item: ExtraKeyStored): string {
  if (item.type === 'builtin') {
    return (
      CATALOG_MODIFIERS_BY_ID.get(item.id as ExtraKeyModifier)?.label ??
      CATALOG_KEYS_BY_ID.get(item.id)?.label ??
      item.id
    );
  }
  return item.label;
}

/**
 * The id a custom action saved without one gets on load: derived from its row, its place and its content, so
 * every load gives the same id until the layout is saved with it. A reference a pad position stores to it
 * therefore stays valid even when saving the migrated layout fails (it is written again on the next load).
 */
function migratedCustomActionId(item: ExtraKeyStored, row: number, index: number): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(item)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return `custom-legacy-${row}-${index}-${hash.toString(36)}`;
}

/** The persisted layout, or null when it is not one; custom actions without an id get one (`assigned`). */
function sanitizeLayout(value: unknown): { layout: ExtraKeysLayout; assigned: boolean } | null {
  if (!Array.isArray(value) || value.length !== EXTRA_KEYS_ROW_COUNT) return null;
  const layout: ExtraKeysLayout = [];
  let assigned = false;
  for (const [rowIndex, row] of value.entries()) {
    if (!Array.isArray(row)) return null;
    const items: ExtraKeyStored[] = [];
    for (const [index, raw] of row.entries()) {
      if (typeof raw !== 'object' || raw === null) return null;
      let item = raw as ExtraKeyStored;
      if (validateStoredItem(item) !== null) return null;
      if (item.type !== 'builtin' && (typeof item.id !== 'string' || item.id.length === 0)) {
        item = { ...item, id: migratedCustomActionId(item, rowIndex, index) };
        assigned = true;
      }
      items.push(item);
    }
    layout.push(items);
  }
  return validateExtraKeysLayout(layout) === null ? { layout, assigned } : null;
}

type ExtraKeysState = {
  hydrated: boolean;
  layout: ExtraKeysLayout;
  hydrate: () => Promise<void>;
  /** Validate + persist. Returns the validation error, or null on success. */
  saveLayout: (layout: ExtraKeysLayout) => string | null;
  resetToDefault: () => void;
};

export const useExtraKeysStore = create<ExtraKeysState>()((set, get) => ({
  hydrated: false,
  layout: defaultExtraKeysLayout(),

  hydrate: async () => {
    if (get().hydrated) return;
    let layout = defaultExtraKeysLayout();
    let migrated = false;
    try {
      const raw = await AsyncStorage.getItem(EXTRA_KEYS_STORAGE_KEY);
      if (raw !== null) {
        const sanitized = sanitizeLayout(JSON.parse(raw));
        if (sanitized !== null) {
          layout = sanitized.layout;
          migrated = sanitized.assigned;
        }
      }
    } catch {
      // Corrupt persisted layout falls back to the default.
    }
    if (migrated) {
      // The ids given on load are stable (`migratedCustomActionId`), so a failed write loses nothing: the next
      // load gives the same ids and writes again. The failure is reported, not left unhandled.
      try {
        await AsyncStorage.setItem(EXTRA_KEYS_STORAGE_KEY, JSON.stringify(layout));
      } catch (error) {
        console.warn('Extra keys: saving the custom action ids failed; they are given again on the next load.', error);
      }
    }
    set({ hydrated: true, layout });
  },

  saveLayout: (layout) => {
    const error = validateExtraKeysLayout(layout);
    if (error !== null) return error;
    set({ layout });
    void AsyncStorage.setItem(EXTRA_KEYS_STORAGE_KEY, JSON.stringify(layout));
    return null;
  },

  resetToDefault: () => {
    const layout = defaultExtraKeysLayout();
    set({ layout });
    void AsyncStorage.setItem(EXTRA_KEYS_STORAGE_KEY, JSON.stringify(layout));
  },
}));
