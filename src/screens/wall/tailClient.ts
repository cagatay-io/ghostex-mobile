/**
 * Reads a session's screen for its session wall tile: gxserver's `readSessionTerminalTail`, the screen's last lines
 * with their colour codes removed (the read behind the chat's not-ready card), over the computer's warm link
 * (`POST /api/readSessionTerminalTail`) or, on an older link, `ghostex session-chat-rpc readSessionTerminalTail`. The
 * computer finds the session's agent itself. A refusal or an unreachable computer is an unavailable preview, which the
 * tile shows as such.
 *
 * SEE-ALSO: server/src/session_chat_composer.rs (`read_session_terminal_tail`),
 * server/src/ghostex_cli/session_chat_rpc.rs (`SESSION_CHAT_RPC_METHODS`)
 */

import { sessionChatRpc } from '../../chat/rust/transport';
import type { MachineConnectionTarget } from '../../machines/credentials';
import { previewFromTail, type Preview } from './previews';

/** A thumbnail that takes longer is not worth waiting for; the next refresh asks again. */
const TAIL_TIMEOUT_MS = 15_000;

export async function readSessionTail(
  machine: MachineConnectionTarget,
  projectId: string,
  sessionId: string,
): Promise<Preview> {
  const answer = await sessionChatRpc(machine, 'readSessionTerminalTail', { projectId, sessionId }, TAIL_TIMEOUT_MS);
  return answer.error === null ? previewFromTail(answer.result) : { kind: 'unavailable' };
}
