/**
 * The project file browser's requests to gxserver: `runProjectDocsAction` in the whole-project scope
 * (`scope: "project"`), the requests the desktop Files list makes for a remote project
 * (server/src/project_docs/project_scope.rs, actions.rs). The browser only reads: it sends `list`, `search` and
 * `stat`, `readResource` for Share… (REQ-FILES-009) and `addToSessionContext`, which reads a file into the text
 * a session's input takes (REQ-FILES-010); nothing that writes (REQ-FILES-005). Kept free of native imports so
 * `bun test` can drive it with a stand-in request.
 */

import type { RpcAnswer } from '../chat/rust/transport';
import { DocsCopy } from '../copy';
import { isRecord } from '../docs/entries';

/** One `runProjectDocsAction` request: `sessionChatRpc` for the browser's computer, or a test's stand-in. */
export type DocsRpc = (
  method: 'runProjectDocsAction',
  params: Record<string, unknown>,
  timeoutMs: number,
) => Promise<RpcAnswer>;

export type ProjectScopeAction = 'list' | 'search' | 'stat' | 'readResource' | 'addToSessionContext';

/** A large project's listing or search takes gxserver a while (the Docs list waits as long). */
const ACTION_TIMEOUT_MS = 60_000;

/** Sends one whole-project action and answers its result; throws gxserver's message when it refuses. */
export async function projectScopeAction(
  rpc: DocsRpc,
  projectId: string,
  action: ProjectScopeAction,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const answer = await rpc(
    'runProjectDocsAction',
    { ...fields, projectId, scope: 'project', action, requestId: `mobile-files-${action}-${Date.now()}` },
    ACTION_TIMEOUT_MS,
  );
  if (answer.error !== null) throw new Error(answer.error.message);
  const result: Record<string, unknown> = isRecord(answer.result) ? answer.result : {};
  if (typeof result.error === 'string' && result.error.length > 0) throw new Error(result.error);
  return result;
}

/** What a failure says, or the update hint where an older Ghostex on the computer lacks the request. */
export function failureMessage(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : String(failure);
  const oldGhostex = /unsupportedClient|Unknown command: session-chat-rpc|Update Ghostex/iu.test(message);
  return oldGhostex ? DocsCopy.oldCli : message;
}
