/**
 * Runs an entry of the project header's Actions… list.
 *
 * A browser action opens the URL the summary carries: a loopback address names a listener on the computer, so it
 * opens in the Web Preview, which forwards the port; every other address goes to the phone's browser. A terminal
 * action runs `ghostex run-action` in the project whose menu it was chosen from (with `--scope global` for a Global
 * Action), then the session it started opens once the list has been read again. A start the computer refuses shows
 * its message in the start-failure card.
 *
 * Global Actions run only while the computer's current summary offers them: the menu may have been opened from an
 * older summary, so this is checked at the tap.
 */

import { createdSessionId, runGhostexCli } from '../components/sessions/cli';
import { runActionCommand } from '../commands/ghostexCli';
import { ActionCopy, ProgressCopy } from '../copy';
import type { MachineConnectionTarget } from '../machines/credentials';
import { webPreviewTargetForUrl, type WebPreviewTarget } from '../webPreview/routing';
import { quickActionDisplayName, type QuickActionEntry } from './quickActions';

/**
 * An action the computer did not start: its name and the message to show, the phone's failure copy (a refusal it
 * does not recognise reads as a plain sentence; the computer's own words go to the app log, `classifyFailure`).
 */
export type ActionStartFailure = { name: string; message: string };

/** What the Sessions screen provides to run an action on one computer. */
export type QuickActionRunHost = {
  machine: MachineConnectionTarget;
  /** Whether the computer's current summary offers Global Actions (`capabilities.globalQuickActions`). */
  globalQuickActionsSupported: () => boolean;
  /** Read the computer's list again, so the new session is known before it opens. */
  refresh: () => Promise<void>;
  attach: (sessionId: string) => Promise<void>;
  openWebPreview: (target: WebPreviewTarget) => void;
  openUrl: (url: string) => Promise<unknown>;
  setProgress: (message: string | null) => void;
  showStatus: (message: string) => void;
  showStartFailure: (failure: ActionStartFailure) => void;
};

export type QuickActionRun = { projectId: string; projectTitle: string; entry: QuickActionEntry };

export async function runQuickAction(host: QuickActionRunHost, run: QuickActionRun): Promise<void> {
  const { action, scope } = run.entry;
  const name = quickActionDisplayName(action);
  const commandId = action.commandId ?? '';
  const url = action.url ?? '';
  if (action.actionType === 'browser' ? url.length === 0 : commandId.length === 0) return;
  if (scope === 'global' && !host.globalQuickActionsSupported()) {
    host.showStartFailure({ name, message: ActionCopy.globalActionsUnavailable });
    return;
  }

  if (action.actionType === 'browser') {
    const previewTarget = webPreviewTargetForUrl(url);
    if (previewTarget !== null) {
      host.openWebPreview(previewTarget);
      return;
    }
    await host.openUrl(url).catch(() => undefined);
    host.showStatus(ProgressCopy.openedInBrowser(name));
    return;
  }

  host.setProgress(ProgressCopy.startingAgent(name, run.projectTitle));
  let sessionId: string | null;
  try {
    sessionId = createdSessionId(await runGhostexCli(host.machine, runActionCommand(commandId, run.projectId, scope)));
  } catch (error) {
    host.setProgress(null);
    host.showStartFailure({ name, message: error instanceof Error ? error.message : String(error) });
    return;
  }
  // Started: from here on a failure is about reading the list or opening the session, not the start.
  try {
    await host.refresh();
    host.setProgress(null);
    if (sessionId !== null) await host.attach(sessionId);
  } catch (error) {
    host.setProgress(null);
    host.showStatus(error instanceof Error ? error.message : String(error));
  }
}
