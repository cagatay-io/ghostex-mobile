/**
 * Add to Session Context on a screen of the project file browser: the list's row menu and a text
 * preview's header (the design). The file's context text goes into the input of
 * the agent session the browser was opened from, and a notice names that session and says the text is not sent
 * yet, or says why nothing was added (a toast).
 */

import { useCallback } from 'react';

import { DocsCopy } from '../copy';
import { failureMessage, type DocsRpc } from './request';
import { addFileToSessionContext, type ContextSession } from './sessionContext';
import { appSessionInputs } from './sessionInputs';

/** A screen's notice: `show(message, error, title)`. */
export type ContextNotice = (message: string, error: boolean, title: string) => void;

/**
 * The action for a file, or null in a browser opened without an agent session (nothing to add to, so not offered).
 */
export function useAddToSessionContext(
  rpc: DocsRpc,
  machineId: string,
  projectId: string,
  session: ContextSession | undefined,
  show: ContextNotice,
): ((file: { path: string; name: string }) => void) | null {
  const add = useCallback(
    (file: { path: string; name: string }) => {
      if (session === undefined) return;
      void addFileToSessionContext(rpc, projectId, file.path, session, appSessionInputs(machineId, projectId)).then(
        (outcome) => {
          if (outcome.added) show(DocsCopy.contextNotSent, false, DocsCopy.contextAdded(session.title));
          else show(failureMessage(outcome.message), true, DocsCopy.contextFailed(file.name));
        },
      );
    },
    [machineId, projectId, rpc, session, show],
  );
  return session === undefined ? null : add;
}
