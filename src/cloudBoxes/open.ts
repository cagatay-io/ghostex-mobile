/**
 * Opening a Cloud Box session from a list: the row sits in its home project on the home computer's
 * list, but the session runs on its box, so it opens on the box's hidden machine with the box's own
 * project id, in Chat View.
 *
 * CDXC:CloudBoxes 2026-11-02 WHY:
 * The phone reaches a box only through its gxserver (no SSH sign-in on a box), and the phone's
 * terminal view is an SSH PTY, so a box session opens in Chat View and its terminal stays on the
 * computer for now. Opening never wakes the box (Q1013): the chat shows its cached transcript and
 * "Stopped · sending wakes it" until a message is sent.
 */

import type { GhostexSession } from '../contract/mobileSummary';
import type { MachineRecord } from '../machines/store';
import { attachSessionKey, useTerminalStore } from '../terminal/sessions';
import { boxSessionOf } from './boxSessions';
import { boxMachineRecord, findMachineRecord, type CloudBoxEntry } from './store';
import { isCloudBoxMachineId } from './types';

export type CloudBoxOpen = { target: MachineRecord; session: GhostexSession } | { refused: string };

/** Where a listed session opens: `null` for a session on the computer itself. */
export function cloudBoxOpenTarget(target: MachineRecord, session: GhostexSession): CloudBoxOpen | null {
  const box = session.cloudBox;
  if (box?.machineId === undefined || isCloudBoxMachineId(target.id)) return null;
  const machine = findMachineRecord(box.machineId);
  if (machine === null) return { refused: 'This cloud box is no longer listed.' };
  if (session.kind === 'terminal') {
    return { refused: "A cloud box's terminals open on the computer; its agent chats open here." };
  }
  useTerminalStore.getState().setSessionViewMode(attachSessionKey(machine.id, session.sessionId), 'chat');
  return { target: machine, session: boxSessionOf(session) };
}

/** Opens a box session's chat by its ids (a session the phone just started on a box). */
export function openBoxChat(
  entry: CloudBoxEntry,
  sessionId: string,
  boxProjectId: string,
  title: string,
  navigate: (params: { sessionKey: string; machineId: string; title: string }) => void,
): void {
  const machine = boxMachineRecord(entry);
  const sessionKey = attachSessionKey(machine.id, sessionId);
  useTerminalStore.getState().setSessionViewMode(sessionKey, 'chat');
  useTerminalStore.getState().openChatTab(machine, { sessionId, projectId: boxProjectId, title });
  navigate({ sessionKey, machineId: machine.id, title });
}
