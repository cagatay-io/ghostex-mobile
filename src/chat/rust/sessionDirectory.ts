/**
 * The session list the chat core names the other session from on a message between agents
 * (`Event::SessionDirectoryChanged` in `packages/gx-chat-core/src/event.rs`): every session the
 * phone's inventory knows, on every machine. The desktop host builds the same list from its
 * sidebar store (`apps/desktop/src/app/gx_chat/session_directory.rs`).
 */

import type { ChatKnownSession } from '../../../modules/gx-chat-core/src';
import { useInventoryStore } from '../../inventory/store';

type Directory = { key: string; sessions: ChatKnownSession[] };

let cached: Directory = { key: '', sessions: [] };

/** The inventory's sessions as the core reads them. */
export function currentSessionDirectory(): ChatKnownSession[] {
  const sessions: ChatKnownSession[] = [];
  for (const inventory of Object.values(useInventoryStore.getState().inventoriesByMachineId)) {
    for (const session of inventory.summary?.sessions ?? []) {
      sessions.push({
        globalRef: session.globalRef,
        projectId: session.projectId,
        sessionId: session.sessionId,
        title: session.displayTitle || session.title,
        agentId: session.agent,
        agentName: session.agentName,
        coordinator: session.isCoordinator === true,
        // The composer's `+` picker shows each session's state, newest first.
        activity: session.activity,
        lifecycleState: session.isSleeping ? 'sleeping' : session.status,
        activeAt: session.lastInteractionAt || session.lastActiveAt,
      });
    }
  }
  // The inventory is replaced on every 5 s poll, so a change is a change to what the core reads.
  const key = JSON.stringify(sessions);
  if (key !== cached.key) cached = { key, sessions };
  return cached.sessions;
}

/** Calls `listener` with the directory whenever a session is added, removed or renamed. */
export function subscribeSessionDirectory(listener: (sessions: ChatKnownSession[]) => void): () => void {
  let last = currentSessionDirectory();
  return useInventoryStore.subscribe((state, previous) => {
    if (state.inventoriesByMachineId === previous.inventoriesByMachineId) return;
    const next = currentSessionDirectory();
    if (next === last) return;
    last = next;
    listener(next);
  });
}
