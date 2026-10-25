/**
 * Reads a project's Changes diff from its computer: gxserver's `runGitAction` with `changesDiff`,
 * the call behind the desktop Changes tab, over the computer's warm chat link (a direct
 * `POST /api/runGitAction`) or, on an older link, `ghostex session-chat-rpc runGitAction`, which
 * lets only `changesDiff` through.
 *
 * SEE-ALSO: server/src/typed_operations/git_changes.rs (`changesDiff`),
 * server/src/ghostex_cli/session_chat_rpc.rs (`READ_ONLY_GIT_ACTIONS`)
 */

import { sessionChatRpc } from '../chat/rust/transport';
import type { MachineConnectionTarget } from '../machines/credentials';
import { changesAnswerFrom, type ChangesAnswer, type ChangesScope } from './model';

/** A large repository's diff and its untracked files can take a while to read. */
const DIFF_TIMEOUT_MS = 60_000;

/** The error a computer whose Ghostex predates the phone's Changes screen answers with. */
export class ChangesUnsupportedError extends Error {}

export async function readChanges(
  machine: MachineConnectionTarget,
  projectId: string,
  scope: ChangesScope,
): Promise<ChangesAnswer> {
  const answer = await sessionChatRpc(
    machine,
    'runGitAction',
    { projectId, action: 'changesDiff', scope, ignoreWhitespace: false },
    DIFF_TIMEOUT_MS,
  );
  if (answer.error !== null) {
    // The SSH route's own words for a computer without `runGitAction` on the bridge, and gxserver's
    // for one that has no `changesDiff` action yet.
    if (answer.error.code === 'unsupportedClient' || /Unsupported Git action/u.test(answer.error.message)) {
      throw new ChangesUnsupportedError(answer.error.message);
    }
    throw new Error(answer.error.message);
  }
  return changesAnswerFrom(answer.result);
}
