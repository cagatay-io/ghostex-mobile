/**
 * The project header's Actions… list: the project's own actions first, then the computer's Global Actions, as the
 * desktop's Actions settings name them. A project action and a Global Action can share a commandId, so an entry is
 * identified by its scope and its commandId everywhere, the last-run mark included.
 */

import type { GhostexQuickAction, QuickActionScope } from '../contract/mobileSummary';
import { ActionCopy } from '../copy';

/** One action of the list together with the list it comes from. */
export type QuickActionEntry = { scope: QuickActionScope; action: GhostexQuickAction };

/** An action's identity, as the last-run mark stores it. */
export type QuickActionRef = { scope: QuickActionScope; commandId: string };

export type QuickActionListRow =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'separator'; key: string }
  | { kind: 'action'; key: string; entry: QuickActionEntry; selected: boolean };

/** The name an action row shows; the computer always sends one, the fallback names its type. */
export function quickActionDisplayName(action: GhostexQuickAction): string {
  if (action.name !== undefined && action.name.length > 0) {
    return action.name;
  }
  return action.actionType === 'browser' ? 'Browser' : 'Terminal';
}

/** The Actions… list in list order: the project's actions, then the Global Actions passed in from the summary. */
export function quickActionEntries(
  projectActions: readonly GhostexQuickAction[],
  globalActions: readonly GhostexQuickAction[],
): QuickActionEntry[] {
  return [
    ...projectActions.map((action) => ({ scope: 'project' as const, action })),
    ...globalActions.map((action) => ({ scope: 'global' as const, action })),
  ];
}

function isLastRun(entry: QuickActionEntry, lastRun: QuickActionRef | undefined): boolean {
  const commandId = entry.action.commandId ?? '';
  return (
    lastRun !== undefined && commandId.length > 0 && entry.scope === lastRun.scope && commandId === lastRun.commandId
  );
}

/**
 * The entry the Actions… row takes its icon from: the last-run one, else the first. Null when there is nothing to
 * list, which hides the Actions… row.
 */
export function lastRunEntry(
  entries: readonly QuickActionEntry[],
  lastRun: QuickActionRef | undefined,
): QuickActionEntry | null {
  return entries.find((entry) => isLastRun(entry, lastRun)) ?? entries[0] ?? null;
}

/**
 * The rows of the Actions… list: each non-empty part under its heading, a separator between the two parts, and a
 * check on the last-run action.
 */
export function quickActionListRows(
  entries: readonly QuickActionEntry[],
  lastRun: QuickActionRef | undefined,
): QuickActionListRow[] {
  const rows: QuickActionListRow[] = [];
  const part = (scope: QuickActionScope, label: string): void => {
    const own = entries.filter((entry) => entry.scope === scope);
    if (own.length === 0) return;
    if (rows.length > 0) rows.push({ kind: 'separator', key: 'scope-separator' });
    rows.push({ kind: 'heading', key: `${scope}-heading`, label });
    own.forEach((entry, index) => {
      const commandId = entry.action.commandId ?? '';
      rows.push({
        kind: 'action',
        key: `${scope}:${commandId.length > 0 ? commandId : `action-${index}`}`,
        entry,
        selected: isLastRun(entry, lastRun),
      });
    });
  };
  part('project', ActionCopy.projectHeading);
  part('global', ActionCopy.globalHeading);
  return rows;
}
