/**
 * What the session menu's coordinator and copy rows do, and the words they answer with, shared by the long-press menu
 * (./use-sessions-screen-menus.tsx) and the chat's and terminal's ⋯ (../terminal-screen/use-session-menu-runner.tsx),
 * so a row gives the same feedback wherever it is pressed.
 */

import * as Clipboard from 'expo-clipboard';

import {
  coordinatorResolveCommand,
  leadUnlinkCommand,
  makeMainCoordinatorCommand,
  promoteCoordinatorCommand,
  sleepInactiveCoordinatorThreadsCommand,
} from '../../commands/ghostexCli';
import { runGhostexCli } from '../../components/sessions/cli';
import type { GhostexSession } from '../../contract/mobileSummary';
import type { MachineRecord } from '../../machines/store';
import { sessionTitle } from './session-actions';

/** How a row reports: the screen's progress line, then a short notice (an error's own words when it fails). */
export type SessionMenuFeedback = {
  setProgress: (message: string | null) => void;
  notify: (message: string, error: boolean) => void;
};

/** What a menu's Copy rows say once the text is on the clipboard. */
export const COPY_NOTICES = { details: 'Details copied', text: 'Copied', path: 'Path copied' } as const;

/** What Goal & Instructions and Memory say once saved. */
export const COORDINATOR_UPDATED_NOTICE = 'Coordinator updated';

/** Make Coordinator's question. */
export function makeCoordinatorConfirm(session: GhostexSession): { title: string; body: string; confirmLabel: string } {
  return {
    title: 'Make coordinator?',
    body: `${sessionTitle(session)} keeps its conversation and keeps running: nothing restarts or interrupts it. It gets the coordinator's crown now, and its coordinator playbook arrives once its current turn is over.`,
    confirmLabel: 'Make Coordinator',
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Puts `text` on the phone's clipboard and says so. */
export function copyWithNotice(text: string, notice: string, feedback: SessionMenuFeedback): void {
  void Clipboard.setStringAsync(text)
    .then(() => feedback.notify(notice, false))
    .catch((error: unknown) => feedback.notify(errorText(error), true));
}

async function cliStep(
  machine: MachineRecord,
  command: string,
  progress: string,
  done: (json: Record<string, unknown> | null | undefined) => string,
  feedback: SessionMenuFeedback,
): Promise<void> {
  feedback.setProgress(progress);
  try {
    const { json } = await runGhostexCli(machine, command);
    feedback.notify(done(json as Record<string, unknown> | null | undefined), false);
  } catch (error) {
    feedback.notify(errorText(error), true);
  } finally {
    feedback.setProgress(null);
  }
}

/** Make Coordinator: gxserver promotes the session in place; its running turn is never touched. */
export function makeCoordinator(machine: MachineRecord, session: GhostexSession, feedback: SessionMenuFeedback) {
  return cliStep(
    machine,
    promoteCoordinatorCommand(session.globalRef),
    'Making it a coordinator…',
    () => 'Now a coordinator',
    feedback,
  );
}

/** Make Main Coordinator: its project's main one on that computer (`ghostex coordinator make-main`). */
export function makeMainCoordinator(machine: MachineRecord, session: GhostexSession, feedback: SessionMenuFeedback) {
  return cliStep(
    machine,
    makeMainCoordinatorCommand(session.globalRef),
    'Making it the main coordinator…',
    () => 'Now the main coordinator',
    feedback,
  );
}

/** Sleep Inactive Threads: gxserver picks the orchestrator's idle threads and sleeps them. */
export function sleepInactiveCoordinatorThreads(
  machine: MachineRecord,
  session: GhostexSession,
  feedback: SessionMenuFeedback,
) {
  return cliStep(
    machine,
    sleepInactiveCoordinatorThreadsCommand(session.globalRef),
    'Sleeping inactive threads…',
    (json) => {
      const slept = Array.isArray(json?.slept) ? json.slept.length : 0;
      return slept === 0 ? 'No inactive threads to sleep' : `Slept ${slept} inactive thread${slept === 1 ? '' : 's'}`;
    },
    feedback,
  );
}

/** Mark Thread Done / Reopen Thread: gxserver resolves the thread, closing or waking its session. */
export function resolveCoordinatorThread(
  machine: MachineRecord,
  session: GhostexSession,
  resolved: boolean,
  feedback: SessionMenuFeedback,
) {
  return cliStep(
    machine,
    coordinatorResolveCommand(session.globalRef, resolved),
    resolved ? 'Marking the thread done…' : 'Reopening the thread…',
    () => (resolved ? 'Thread marked done' : 'Thread reopened'),
    feedback,
  );
}

/** Unlink from Lead / Stop Leading (lead links): the session or the lead's sessions stop reporting to it. */
export function unlinkLead(
  machine: MachineRecord,
  session: GhostexSession,
  allOfLead: boolean,
  feedback: SessionMenuFeedback,
) {
  return cliStep(
    machine,
    leadUnlinkCommand(session.globalRef, allOfLead),
    'Unlinking…',
    () => (allOfLead ? 'Stopped leading' : 'Unlinked from its lead'),
    feedback,
  );
}
