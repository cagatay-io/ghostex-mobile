/**
 * The app's session inputs for Add to Session Context (REQ-FILES-010): the chat the terminal screen keeps open
 * for the session under Files, and the session's native terminal. The rule for which of the two the session shows
 * is the terminal screen's own (`chatModeActive`: a session that can show its chat, set to Chat View). What the
 * session is right now comes from the phone's tabs and the computer's session list (the inventory).
 */

import { GhostexNative } from '../../modules/ghostex-native/src';
import { openRustChatHost } from '../chat/rust/host';
import { useInventoryStore } from '../inventory/store';
import { useTerminalStore } from '../terminal/sessions';
import type { SessionInputs } from './sessionContext';

export function appSessionInputs(machineId: string, projectId: string): SessionInputs {
  return {
    showsChat: (session) => session.chatCapable && useTerminalStore.getState().chatModeArmed(session.sessionKey),
    // The chat box's own append (the transcript menu's Add to Chat, gx-chat-core `appendToDraft`): after the
    // draft, never in its place, and saved as the session's draft like typed text.
    appendToChatDraft: (session, text) => {
      const host = openRustChatHost(machineId, projectId, session.sessionId);
      if (host === null) return false;
      const { composer } = host.getState();
      if (!composer.ready) return false;
      host.dispatch({ type: 'appendToDraft', text, draft: composer.text });
      return true;
    },
    // Typed in as a paste (bracketed where the agent's input asks for it), no Enter: the prompt editor's insert.
    pasteIntoTerminal: (session, text) => GhostexNative.sendText(session.sessionKey, text),
    current: (session) => ({
      tab: useTerminalStore
        .getState()
        .tabs.find((tab) => tab.sessionKey === session.sessionKey && tab.machineId === machineId),
      record: useInventoryStore
        .getState()
        .inventoriesByMachineId[machineId]?.summary?.sessions.find((entry) => entry.sessionId === session.sessionId),
    }),
  };
}
