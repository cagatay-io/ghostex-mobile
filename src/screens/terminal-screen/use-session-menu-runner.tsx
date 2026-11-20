/**
 * Runs the rows the chat's ⋯ and the terminal's ⋯ share with the long-press session menu (Coordinator, Mark Thread
 * Done, Copy, Tag As, Close After Done, Handoff / Export, Link to, Make Coordinator, Postpone By, Close), which
 * screens/sessions-screen/sidebar-menus.ts builds for the session on screen (`sessionMenuPlaces`). The Sessions list
 * runs the same commands through its own overlays (use-sessions-screen-menus.tsx `runMenuCommand`); here the sheets
 * those rows open (Goal & Instructions, Memory, Link to's picker) are this hook's, and what the screen already does
 * for its session (Edit Delayed Send, View Playbook, Handoff / Export, Close After Done) is handed back to it.
 *
 * CDXC:ContextMenus 2026-11-20 SEE-ALSO: packages/gx-core/src/sidebar_menu/layout.rs (the user's decision that every
 * session menu is one list, so these rows are in the chat's and the terminal's ⋯ too).
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import {
  coordinatorEditCommand,
  coordinatorResolveCommand,
  coordinatorStatusCommand,
  leadUnlinkCommand,
  makeMainCoordinatorCommand,
  promoteCoordinatorCommand,
  setSessionWorkLinksCommand,
  sleepInactiveCoordinatorThreadsCommand,
  workLinkCandidatesCommand,
  type WorkLinkKind,
} from '../../commands/ghostexCli';
import { runGhostexCli } from '../../components/sessions/cli';
import { NO_SUMMARY_CAPABILITIES, type GhostexSession } from '../../contract/mobileSummary';
import { useInventoryStore } from '../../inventory/store';
import type { MachineRecord } from '../../machines/store';
import { runSessionCommand } from '../../sessions/sessionCommands';
import { closeConfirmCopy } from '../sessions-screen/close-confirm';
import CoordinatorDetailsSheet, {
  parseCoordinatorDetails,
  type CoordinatorDetailsMode,
} from '../sessions-screen/CoordinatorDetailsSheet';
import {
  cancelDelayedSendSessionAction,
  closePutsSessionToSleep,
  closeSessionAction,
  sessionTitle,
  tagSessionAction,
  type BulkSessionAction,
} from '../sessions-screen/session-actions';
import type { SidebarMenuCommand } from '../sessions-screen/sidebar-menus';
import WorkLinkPicker, { parseWorkLinkCandidates } from '../sessions-screen/work-link-picker';
import { SessionCopy } from '../../copy';

type Sheet =
  | { kind: 'none' }
  | { kind: 'coordinatorDetails'; machine: MachineRecord; session: GhostexSession; mode: CoordinatorDetailsMode }
  | { kind: 'workLinkPicker'; machine: MachineRecord; session: GhostexSession; linkKind: WorkLinkKind };

const NO_SHEET: Sheet = { kind: 'none' };

export type SessionMenuRunnerDeps = {
  /** The full-screen progress line (null hides it). */
  setProgress: (message: string | null) => void;
  /** Delayed Send's dialog for the session on screen (Postpone By › Edit Delayed Send). */
  editDelayedSend: () => void;
  /** The coordinator's playbook sheet (Coordinator › View Playbook). */
  viewPlaybook: (machine: MachineRecord, session: GhostexSession) => void;
  /** Handoff / Export for the session on screen. */
  exportTranscript: () => void;
  /** Close After Done for the session on screen. */
  toggleCloseAfterDone: () => void;
};

function failure(title: string, error: unknown): void {
  Alert.alert(title, error instanceof Error ? error.message : String(error), [{ text: 'OK' }]);
}

export function useSessionMenuRunner({
  setProgress,
  editDelayedSend,
  viewPlaybook,
  exportTranscript,
  toggleCloseAfterDone,
}: SessionMenuRunnerDeps): {
  run: (machine: MachineRecord, session: GhostexSession, command: SidebarMenuCommand) => void;
  sheets: ReactNode;
} {
  const [sheet, setSheet] = useState<Sheet>(NO_SHEET);

  /** One `ghostex` call behind the progress line; a refusal is the computer's own words in an alert. */
  const cli = useCallback(
    async (machine: MachineRecord, command: string, progress: string, failedTitle: string): Promise<void> => {
      setProgress(progress);
      try {
        await runGhostexCli(machine, command);
      } catch (error) {
        failure(failedTitle, error);
      } finally {
        setProgress(null);
      }
    },
    [setProgress],
  );

  const runAction = useCallback((machine: MachineRecord, action: BulkSessionAction, failedTitle: string): void => {
    void runSessionCommand(machine, action.command, {
      closeWarmSessionId: action.closeWarmSession ? action.sessionId : undefined,
      optimisticChange: action.optimisticChange,
      onError: (message) => Alert.alert(failedTitle, message, [{ text: 'OK' }]),
    });
  }, []);

  const confirmClose = useCallback(
    (machine: MachineRecord, session: GhostexSession): void => {
      const summary = useInventoryStore.getState().inventoriesByMachineId[machine.id]?.summary;
      const copy = closePutsSessionToSleep(session)
        ? { title: 'Close session?', body: SessionCopy.claudeCloudCloseSleeps }
        : (closeConfirmCopy(session, summary?.sessions ?? [], summary?.capabilities ?? NO_SUMMARY_CAPABILITIES) ?? {
            title: 'Close session?',
            body: 'This closes the selected Ghostex session on the connected machine.',
          });
      Alert.alert(copy.title, `${sessionTitle(session)}\n\n${copy.body}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Session',
          style: 'destructive',
          onPress: () => runAction(machine, closeSessionAction(session, 'phone.sessionMenu'), 'Close Failed'),
        },
      ]);
    },
    [runAction],
  );

  const run = useCallback(
    (machine: MachineRecord, session: GhostexSession, command: SidebarMenuCommand): void => {
      switch (command.type) {
        case 'command': {
          const message = command.message;
          switch (message.type) {
            case 'copyText':
            case 'copySessionDetails':
              void Clipboard.setStringAsync(message.text).catch((error: unknown) => failure('Copy Failed', error));
              return;
            case 'setSessionTag':
              runAction(machine, tagSessionAction(session, message.sessionTag), 'Tag Failed');
              return;
            case 'toggleCloseAfterDone':
              toggleCloseAfterDone();
              return;
            case 'exportSessionTranscript':
              exportTranscript();
              return;
            case 'cancelDelayedSend':
              runAction(machine, cancelDelayedSendSessionAction(session), 'Delayed Send Failed');
              return;
            case 'closeSession':
              confirmClose(machine, session);
              return;
            case 'makeCoordinator':
              Alert.alert(
                'Make coordinator?',
                `${sessionTitle(session)} keeps its conversation and keeps running: nothing restarts or interrupts it. It gets the coordinator's crown now, and its coordinator playbook arrives once its current turn is over.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Make Coordinator',
                    onPress: () =>
                      void cli(
                        machine,
                        promoteCoordinatorCommand(session.globalRef),
                        'Making it a coordinator…',
                        'Make Coordinator Failed',
                      ),
                  },
                ],
              );
              return;
            case 'sleepInactiveCoordinatorThreads':
              void cli(
                machine,
                sleepInactiveCoordinatorThreadsCommand(session.globalRef),
                'Sleeping inactive threads…',
                'Sleep Inactive Threads Failed',
              );
              return;
            case 'setSessionWorkLinks':
              void runSessionCommand(
                machine,
                setSessionWorkLinksCommand(session.sessionId, session.projectId, message.links),
                { onError: (text) => Alert.alert('Link Failed', text, [{ text: 'OK' }]) },
              );
              return;
            default:
              // The shared places make no other message (sidebar-menus.ts `sessionMenuPlaces`).
              return;
          }
        }
        case 'sessionAction':
          if (command.action === 'linkWork') {
            setSheet({ kind: 'workLinkPicker', machine, session, linkKind: command.kind });
          } else if (command.action === 'delayedSend') {
            editDelayedSend();
          }
          return;
        case 'coordinatorSessionAction':
          switch (command.action) {
            case 'goal':
            case 'memory':
              setSheet({ kind: 'coordinatorDetails', machine, session, mode: command.action });
              return;
            case 'viewPlaybook':
              viewPlaybook(machine, session);
              return;
            case 'makeMain':
              void cli(
                machine,
                makeMainCoordinatorCommand(session.globalRef),
                'Making it the main coordinator…',
                'Make Main Coordinator Failed',
              );
              return;
            case 'unlinkLead':
            case 'stopLeading':
              void cli(
                machine,
                leadUnlinkCommand(session.globalRef, command.action === 'stopLeading'),
                'Unlinking…',
                'Unlink Failed',
              );
              return;
            case 'markDone':
            case 'reopen':
              void cli(
                machine,
                coordinatorResolveCommand(session.globalRef, command.action === 'markDone'),
                command.action === 'markDone' ? 'Marking the thread done…' : 'Reopening the thread…',
                command.action === 'markDone' ? 'Mark Thread Done Failed' : 'Reopen Thread Failed',
              );
              return;
          }
          return;
        default:
          return;
      }
    },
    [cli, confirmClose, editDelayedSend, exportTranscript, runAction, toggleCloseAfterDone, viewPlaybook],
  );

  const close = useCallback(() => setSheet(NO_SHEET), []);

  let sheets: ReactNode = null;
  if (sheet.kind === 'coordinatorDetails') {
    const { machine, session } = sheet;
    sheets = (
      <CoordinatorDetailsSheet
        mode={sheet.mode}
        load={async () =>
          parseCoordinatorDetails((await runGhostexCli(machine, coordinatorStatusCommand(session.globalRef))).json)
        }
        onSave={async (edit) => {
          await runGhostexCli(machine, coordinatorEditCommand(session.globalRef, edit));
          close();
        }}
        onCancel={close}
      />
    );
  } else if (sheet.kind === 'workLinkPicker') {
    const { machine, session, linkKind } = sheet;
    sheets = (
      <WorkLinkPicker
        kind={linkKind}
        sessionTitle={sessionTitle(session)}
        load={async (query) =>
          parseWorkLinkCandidates(
            (
              await runGhostexCli(
                machine,
                workLinkCandidatesCommand(session.sessionId, session.projectId, linkKind, query),
                { timeoutMs: 45_000 },
              )
            ).json,
          )
        }
        onPick={(values) => {
          close();
          // The chosen values replace what that kind linked to (use-sessions-screen-menus.tsx `saveWorkLinks`).
          const links =
            linkKind === 'pullRequest'
              ? { pullRequest: values[0] ?? 'none' }
              : linkKind === 'linearProject'
                ? { linearProject: values[0] ?? '' }
                : linkKind === 'githubProject'
                  ? { githubProject: values[0] ?? 'none' }
                  : linkKind === 'linearIssue'
                    ? { linearIssues: values }
                    : { githubIssues: values };
          void runSessionCommand(machine, setSessionWorkLinksCommand(session.sessionId, session.projectId, links), {
            onError: (text) => Alert.alert('Link Failed', text, [{ text: 'OK' }]),
          });
        }}
        onCancel={close}
      />
    );
  }
  return { run, sheets };
}
