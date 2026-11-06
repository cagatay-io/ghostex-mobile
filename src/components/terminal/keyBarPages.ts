/**
 * The key pages of the key bar's KEYS/AGENT pills (Android) and of the Befehlspad's layers (iOS): the KEYS page
 * (the Keys layer's "More keys") holds terminal control hotkeys and nav keys, PgUp/PgDn in the rightmost column;
 * the agent page (the Agent layer) the hotkeys of the session's active agent. Every item carries a description the
 * bar or the layer shows while the pill is held. Agent bindings are persisted by the agent-hotkeys settings store.
 */

import type { KeyModifiers, TerminalKey } from '../../../modules/ghostex-native/src';
import {
  formatAgentHotkeySteps,
  type AgentHotkey,
  type AgentHotkeyProfiles,
  type ConfigurableAgentId,
} from '../../settings/agentHotkeys';
import type { ResolvedExtraKey } from '../../settings/extraKeys';

/** Page item: a renderable key-bar item plus its hold-to-see description. */
export type KeyPageItem =
  | (ResolvedExtraKey & { description: string })
  | {
      id: string;
      kind: 'sequence';
      label: string;
      steps: AgentHotkey['steps'];
      description: string;
    };

function pressKey(id: string, label: string, key: TerminalKey, description: string, mods?: KeyModifiers): KeyPageItem {
  return { id, kind: 'key', label, key, mods, description };
}

/** Ctrl+<letter> pill labelled with caret notation ("^C"). */
function ctrlKey(letter: string, description: string): KeyPageItem {
  return pressKey(`page-ctrl-${letter}`, `^${letter.toUpperCase()}`, letter, description, {
    ctrl: true,
  });
}

/** KEYS page: terminal control hotkeys + nav keys, PgUp/PgDn rightmost. */
export const EXTRA_KEYS_PAGE: KeyPageItem[][] = [
  [
    pressKey('page-ins', 'INS', 'insert', 'Insert key'),
    pressKey('page-del', 'DEL', 'delete', 'Delete key'),
    ctrlKey('c', 'Ctrl+C · Interrupt the running program'),
    ctrlKey('d', 'Ctrl+D · End of input / exit the shell'),
    ctrlKey('z', 'Ctrl+Z · Suspend the foreground program'),
    ctrlKey('l', 'Ctrl+L · Clear / redraw the screen'),
    pressKey('page-pgup', 'PGUP', 'pageUp', 'Page Up key'),
  ],
  [
    ctrlKey('r', 'Ctrl+R · Search shell history'),
    ctrlKey('u', 'Ctrl+U · Clear the input line'),
    ctrlKey('w', 'Ctrl+W · Delete the previous word'),
    ctrlKey('a', 'Ctrl+A · Jump to line start'),
    ctrlKey('e', 'Ctrl+E · Jump to line end'),
    ctrlKey('k', 'Ctrl+K · Delete to end of line'),
    pressKey('page-pgdn', 'PGDN', 'pageDown', 'Page Down key'),
  ],
];

function isConfigurableAgentId(agentId: string): agentId is ConfigurableAgentId {
  return agentId === 'codex' || agentId === 'claude' || agentId === 'pi';
}

/** Agent hotkey rows for the resolved agent id, or null (no AGENT page). */
export function agentKeyPage(agentId: string, profiles: AgentHotkeyProfiles): KeyPageItem[][] | null {
  if (!isConfigurableAgentId(agentId)) return null;
  const hotkeys = profiles[agentId];
  if (hotkeys.length === 0) return null;
  const items: KeyPageItem[] = hotkeys.map((hotkey) => ({
    id: `agent-${agentId}-${hotkey.id}`,
    kind: 'sequence',
    label: hotkey.label,
    steps: hotkey.steps,
    description: `${formatAgentHotkeySteps(hotkey.steps)} · ${hotkey.label}`,
  }));
  const firstRowLength = Math.ceil(items.length / 2);
  return [items.slice(0, firstRowLength), items.slice(firstRowLength)].filter((row) => row.length > 0);
}
