/**
 * The Sessions header's New session button: it opens the agent menu on the project a new session
 * aims at (the Unified filter's one repository, else the top of Recent, `unifiedNewSessionTarget`),
 * where the project row changes the project and its computer, and nothing starts until a row is
 * picked. This file holds the button and what an empty list comes to; the screen wires them to its
 * menu, its sheet and its toast.
 *
 * CDXC:Sidebar 2026-11-14 DECISION:
 * User: New session on the phone must match the desktop: choose the project and the type of session (an agent, a coordinator, a terminal), never just start Claude or the last agent. It opens the agent menu on the last project used, with the project row to change it, listing what that computer has set up: New Coordinator…, its coding agents, Cloud Box where offered, and Terminal. When that project can't open its menu (its computer is off or not read yet), the project list opens instead. This supersedes the 2026-11-10 WHY (PR #540) that started the last-used agent on a pick.
 * SEE-ALSO: ./new-session-place.ts (the rows and the agent's Space), ./use-sessions-screen-menus.tsx (`openAgentMenuAt`, `agentMenuItems`), apps/desktop/src/app/window/new_thread_picker.rs (the desktop's picker).
 */

import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { EditGlyph } from '../../components/sessions/unified/glyphs';
import { NewSessionCopy } from '../../copy';

/** What the screen's toast shows instead of a start. */
export type NewSessionNotice = { title: string; message: string };

/**
 * Why the agent menu can't open on a project of a computer (a project's "+", the agent menu's
 * project row), or null when it can: the computer is off, its summary hasn't been read yet, or the
 * project is gone from it.
 */
export function agentMenuNotice(input: {
  connected: boolean;
  computer: string;
  read: boolean;
  found: boolean;
}): NewSessionNotice | null {
  if (!input.connected) return { title: NewSessionCopy.offlineTitle, message: NewSessionCopy.offline(input.computer) };
  if (!input.read) return { title: NewSessionCopy.loadingTitle, message: NewSessionCopy.loadingOne(input.computer) };
  if (!input.found) return { title: NewSessionCopy.goneTitle, message: NewSessionCopy.gone(input.computer) };
  return null;
}

/** A computer the phone has saved, as the empty sheet reads it. */
export type NewSessionComputer = {
  label: string;
  /** Its summary has been read at least once. */
  read: boolean;
  /** Its last read failed. */
  failed: boolean;
};

/** What New session does when the sheet would have no row. */
export type NewSessionEmpty =
  { kind: 'addComputer' } | { kind: 'addProject' } | { kind: 'notice'; notice: NewSessionNotice };

/**
 * An empty project list means "no projects" only when every computer was read; a computer still
 * loading its first summary, or whose read failed, is skipped by the list, so it says so instead.
 */
export function newSessionEmptyList(computers: readonly NewSessionComputer[]): NewSessionEmpty {
  if (computers.length === 0) return { kind: 'addComputer' };
  const unread = computers.filter((computer) => !computer.read);
  if (unread.length === 0) return { kind: 'addProject' };
  const failed = unread.filter((computer) => computer.failed);
  if (failed.length > 0) {
    return {
      kind: 'notice',
      notice: {
        title: NewSessionCopy.offlineTitle,
        message: NewSessionCopy.unreachable(failed.map((computer) => computer.label)),
      },
    };
  }
  return { kind: 'notice', notice: { title: NewSessionCopy.loadingTitle, message: NewSessionCopy.loading } };
}

/** The pencil in the Sessions title row, beside the bell and the menu. */
export function NewSessionButton({
  color,
  style,
  onPress,
}: {
  color: string;
  style: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={NewSessionCopy.button} style={style} onPress={onPress}>
      <EditGlyph size={20} color={color} />
    </Pressable>
  );
}
