/**
 * What the Befehlspad's stored key ids (`settings/commandPad.ts`) mean: the key each position sends, its name
 * (accessibility label) and its face, and the choices Settings > Keyboard > Pad keys offers
 * (every function of the key bar, plus Paste and Upload). The keys come from
 * the same catalogues the key bar used (`extraKeys.ts`, `keyBarPages.ts`, `agentHotkeys.ts`), so a pad key
 * sends the payload the bar sent for it.
 *
 * A stored id resolves three ways:
 * - a key: built-ins, KEYS-page items, Paste, Upload, and the custom action or agent hotkey it refers to, as it is
 *   now (later edits of the action follow);
 * - "not available": a well-formed reference whose custom action or agent hotkey has been deleted since; the
 *   position shows that and sends nothing until it is reassigned;
 * - nothing (`null`, malformed): an id outside the vocabulary (unknown scheme, built-in, page item or agent), and
 *   Paste where it has no native path (Android, iOS-only scope). That position shows its default key, as an
 *   invalid stored list loads the default nine.
 */

import type { KeyModifiers, TerminalKey } from '../../../modules/ghostex-native/src/GhostexNative.types';
import { CommandPadCopy } from '../../copy';
import {
  AGENT_NAMES,
  CONFIGURABLE_AGENT_IDS,
  type AgentHotkeyProfiles,
  type AgentHotkeyStep,
  type ConfigurableAgentId,
} from '../../settings/agentHotkeys';
import {
  COMMAND_PAD_KEY_COUNT,
  COMMAND_PAD_PASTE_ID,
  COMMAND_PAD_UPLOAD_ID,
  DEFAULT_COMMAND_PAD_KEYS,
  agentHotkeyId,
  catalogKeyId,
  customActionId,
  pageKeyId,
} from '../../settings/commandPad';
import {
  extraKeyCatalog,
  resolveStoredItem,
  type ExtraKeyModifier,
  type ExtraKeysLayout,
  type ResolvedExtraKey,
} from '../../settings/extraKeys';
import { EXTRA_KEYS_PAGE } from './keyBarPages';

export type CommandPadAction =
  | { kind: 'key'; key: TerminalKey; mods?: KeyModifiers }
  | { kind: 'text'; text: string; sendEnter: boolean }
  | { kind: 'sequence'; steps: AgentHotkeyStep[] }
  | { kind: 'modifier'; modifier: ExtraKeyModifier }
  | { kind: 'paste' }
  | { kind: 'upload' }
  /** Its custom action or agent hotkey was deleted: shown as "not available", sends nothing. */
  | { kind: 'unavailable' };

/** Keys drawn as an icon instead of text. */
export type CommandPadGlyph = 'up' | 'down' | 'left' | 'right' | 'enter' | 'newLine' | 'tab' | 'upload';

export type CommandPadKey = {
  /** The stored id. */
  id: string;
  /** What VoiceOver says and Settings names it ("Up", "Ctrl+C", "Claude Code: EXIT"). */
  label: string;
  /** The short text on the key when it has no glyph ("Esc", "^C", "PgUp"). */
  face: string;
  glyph?: CommandPadGlyph;
  action: CommandPadAction;
  /** Held, it repeats (arrows, Home, End, PgUp, PgDn). */
  repeats: boolean;
};

/** What the pad's keys are resolved against. */
export type CommandPadSources = {
  agentProfiles: AgentHotkeyProfiles;
  /** The extra-keys layout, whose custom actions pad positions refer to by id. */
  extraKeysLayout: ExtraKeysLayout;
  /** Paste goes through the terminal's edit-menu paste, bridged on iOS only (`GhostexNative.pasteFromClipboard`). */
  pasteSupported: boolean;
};

const REPEATING_KEYS: Readonly<Record<string, true>> = {
  up: true,
  down: true,
  left: true,
  right: true,
  home: true,
  end: true,
  pageUp: true,
  pageDown: true,
};

const KEY_GLYPHS: Readonly<Record<string, CommandPadGlyph>> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  enter: 'enter',
  tab: 'tab',
};

const PAGE_ITEMS = EXTRA_KEYS_PAGE.flat();

/** "Ctrl+", "Ctrl+Shift+" and so on; '' without modifiers. */
function modifierPrefix(mods: KeyModifiers | undefined): string {
  const names = CommandPadCopy.modifierNames;
  let prefix = '';
  if (mods?.ctrl === true) prefix += `${names.ctrl}+`;
  if (mods?.alt === true) prefix += `${names.alt}+`;
  if (mods?.shift === true) prefix += `${names.shift}+`;
  return prefix;
}

function keyName(key: TerminalKey): string {
  const named = CommandPadCopy.keyNames[key];
  if (named !== undefined) return named;
  return key.length === 1 || /^f\d+$/.test(key) ? key.toUpperCase() : key;
}

function keyFace(key: TerminalKey, mods: KeyModifiers | undefined): string {
  const prefix = modifierPrefix(mods);
  if (prefix === `${CommandPadCopy.modifierNames.ctrl}+` && key.length === 1) return `^${key.toUpperCase()}`;
  if (prefix !== '') return `${prefix}${keyName(key)}`;
  return CommandPadCopy.keyFaces[key] ?? keyName(key);
}

/** A key of the key bar's model as a pad key; `label` overrides the derived name (custom actions). */
function fromResolved(id: string, item: ResolvedExtraKey, label?: string): CommandPadKey {
  switch (item.kind) {
    case 'modifier': {
      const name = CommandPadCopy.modifierNames[item.modifier];
      return { id, label: name, face: name, action: { kind: 'modifier', modifier: item.modifier }, repeats: false };
    }
    case 'text':
      return {
        id,
        label: item.label,
        face: item.label,
        action: { kind: 'text', text: item.text, sendEnter: item.sendEnter },
        repeats: false,
      };
    case 'key': {
      const action: CommandPadAction = { kind: 'key', key: item.key, mods: item.mods };
      const repeats = REPEATING_KEYS[item.key] === true;
      if (item.returnGlyph === true) {
        return { id, label: CommandPadCopy.newLine, face: CommandPadCopy.newLine, glyph: 'newLine', action, repeats };
      }
      const prefix = modifierPrefix(item.mods);
      return {
        id,
        label: label ?? `${prefix}${keyName(item.key)}`,
        face: label ?? keyFace(item.key, item.mods),
        glyph: prefix === '' ? KEY_GLYPHS[item.key] : undefined,
        action,
        repeats,
      };
    }
  }
}

function unavailableKey(id: string): CommandPadKey {
  return {
    id,
    label: CommandPadCopy.unavailable,
    face: CommandPadCopy.unavailable,
    action: { kind: 'unavailable' },
    repeats: false,
  };
}

function isAgentId(value: string): value is ConfigurableAgentId {
  return (CONFIGURABLE_AGENT_IDS as readonly string[]).includes(value);
}

/** The pad key a stored id names, "not available" for a deleted reference, null for a malformed id. */
export function resolveCommandPadKey(id: string, sources: CommandPadSources): CommandPadKey | null {
  if (id === COMMAND_PAD_UPLOAD_ID) {
    return {
      id,
      label: CommandPadCopy.upload,
      face: CommandPadCopy.upload,
      glyph: 'upload',
      action: { kind: 'upload' },
      repeats: false,
    };
  }
  if (id === COMMAND_PAD_PASTE_ID) {
    if (!sources.pasteSupported) return null;
    return { id, label: CommandPadCopy.paste, face: CommandPadCopy.paste, action: { kind: 'paste' }, repeats: false };
  }
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const scheme = id.slice(0, colon);
  const rest = id.slice(colon + 1);
  switch (scheme) {
    case 'key': {
      const item = resolveStoredItem({ type: 'builtin', id: rest }, id);
      return item === null ? null : fromResolved(id, item);
    }
    case 'page': {
      const item = PAGE_ITEMS.find((entry) => entry.id === rest);
      return item === undefined || item.kind === 'sequence' ? null : fromResolved(id, item);
    }
    case 'agent': {
      const split = rest.indexOf(':');
      const agentId = rest.slice(0, split);
      const hotkeyId = rest.slice(split + 1);
      // An empty hotkey id is outside the vocabulary (hotkeys never have one): malformed, not deleted.
      if (split < 0 || !isAgentId(agentId) || hotkeyId.length === 0) return null;
      const hotkey = sources.agentProfiles[agentId].find((entry) => entry.id === hotkeyId);
      if (hotkey === undefined) return unavailableKey(id);
      return {
        id,
        label: CommandPadCopy.agentKey(AGENT_NAMES[agentId], hotkey.label),
        face: hotkey.label,
        action: { kind: 'sequence', steps: hotkey.steps },
        repeats: false,
      };
    }
    case 'custom': {
      if (rest.length === 0) return null;
      const stored = sources.extraKeysLayout.flat().find((entry) => entry.type !== 'builtin' && entry.id === rest);
      if (stored === undefined || stored.type === 'builtin') return unavailableKey(id);
      const item = resolveStoredItem(stored, id);
      return item === null ? unavailableKey(id) : fromResolved(id, item, stored.label);
    }
    default:
      return null;
  }
}

/** The nine keys of the pad. A position whose stored id is malformed shows that position's default key. */
export function resolveCommandPadKeys(ids: readonly string[], sources: CommandPadSources): CommandPadKey[] {
  return Array.from({ length: COMMAND_PAD_KEY_COUNT }, (_, index) => {
    const stored = ids[index];
    const key = stored === undefined ? null : resolveCommandPadKey(stored, sources);
    if (key !== null) return key;
    const fallback = resolveCommandPadKey(DEFAULT_COMMAND_PAD_KEYS[index], sources);
    if (fallback === null) throw new Error(`The default pad key ${DEFAULT_COMMAND_PAD_KEYS[index]} does not resolve.`);
    return fallback;
  });
}

export type CommandPadChoice = { id: string; chip: string; label: string };
export type CommandPadChoiceSection = { title: string; choices: CommandPadChoice[] };

/** The custom actions of the extra-keys layout (insert text, text and Enter, shortcut), by id. */
function customActionIds(layout: ExtraKeysLayout): string[] {
  return layout.flat().flatMap((item) => (item.type === 'builtin' ? [] : [customActionId(item.id)]));
}

function choice(id: string, sources: CommandPadSources, chip?: string): CommandPadChoice[] {
  const key = resolveCommandPadKey(id, sources);
  return key === null ? [] : [{ id, chip: chip ?? key.face, label: key.label }];
}

/**
 * What a pad position can be set to, in the sections of the Pad keys picker:
 * keys, modifiers, the KEYS page shortcuts, each agent's hotkeys, Paste and Upload, and the layout's custom
 * actions (an empty section when there are none).
 */
export function commandPadChoices(sources: CommandPadSources): CommandPadChoiceSection[] {
  const catalog = extraKeyCatalog();
  const sections: CommandPadChoiceSection[] = [
    {
      title: CommandPadCopy.sectionKeys,
      choices: catalog
        .filter((entry) => !entry.isModifier)
        .flatMap((entry) => choice(catalogKeyId(entry.id), sources, entry.label)),
    },
    {
      title: CommandPadCopy.sectionModifiers,
      choices: catalog
        .filter((entry) => entry.isModifier)
        .flatMap((entry) => choice(catalogKeyId(entry.id), sources, entry.label)),
    },
    {
      title: CommandPadCopy.sectionShortcuts,
      choices: PAGE_ITEMS.filter((item) => item.kind === 'key' && item.mods?.ctrl === true).flatMap((item) =>
        choice(pageKeyId(item.id), sources),
      ),
    },
  ];
  for (const agentId of CONFIGURABLE_AGENT_IDS) {
    const hotkeys = sources.agentProfiles[agentId];
    if (hotkeys.length === 0) continue;
    sections.push({
      title: CommandPadCopy.sectionAgent(AGENT_NAMES[agentId]),
      choices: hotkeys.flatMap((hotkey) => choice(agentHotkeyId(agentId, hotkey.id), sources)),
    });
  }
  sections.push(
    {
      title: CommandPadCopy.sectionOther,
      choices: [COMMAND_PAD_PASTE_ID, COMMAND_PAD_UPLOAD_ID].flatMap((id) => choice(id, sources)),
    },
    {
      title: CommandPadCopy.sectionCustom,
      choices: customActionIds(sources.extraKeysLayout).flatMap((id) => choice(id, sources)),
    },
  );
  return sections;
}
