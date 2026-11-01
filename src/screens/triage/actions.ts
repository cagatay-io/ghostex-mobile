/**
 * A short reply from the folded triage: the text goes to the session the way the session is shown on the phone. In
 * Chat View it is a chat message (`ghostex send-session-chat-message`, the send the terminal screen's Prompt Editor
 * uses in Chat View); in Terminal View the computer types it into the session's terminal and presses Enter (`ghostex
 * send-message`), whether or not the phone has that terminal open. Sending to a session is interacting with it, so its
 * attention is then acknowledged, as the chat's send does. Free of React Native: the screen hands in the real runner
 * and acknowledge, a test its fakes.
 */

import { sendSessionChatMessageCommand, sendSessionMessageCommand } from '../../commands/ghostexCli';
import type { GhostexSession } from '../../contract/mobileSummary';
import type { MachineConnectionTarget } from '../../machines/credentials';

export type ShortReplyTarget = {
  machine: MachineConnectionTarget;
  session: GhostexSession;
  /** The session opens in Chat View on this phone (`sessionOpensInChatView`). */
  chatView: boolean;
};

export type ShortReplyDeps = {
  /** Runs one `ghostex` command on the computer; rejects when it fails (`runGhostexCli`). */
  run(machine: MachineConnectionTarget, command: string): Promise<unknown>;
  acknowledge(machineId: string, sessionId: string): void;
};

export async function sendShortReply(target: ShortReplyTarget, text: string, deps: ShortReplyDeps): Promise<void> {
  const { machine, session, chatView } = target;
  await deps.run(
    machine,
    chatView
      ? sendSessionChatMessageCommand(session.sessionId, session.projectId, text)
      : sendSessionMessageCommand(session.sessionId, session.projectId, text),
  );
  deps.acknowledge(machine.id, session.sessionId);
}
