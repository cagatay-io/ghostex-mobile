/**
 * Talking to a dot from the phone: a dot's conversations are ordinary agent sessions in its project,
 * opened through the existing Terminal route in chat mode (CONTRACT.md §10). Starting one goes
 * through gxserver's `startChat`, which launches the dot's own agent and model and queues the first
 * message, so the phone never builds a launch command for a dot.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { GhostexSession } from '../contract/mobileSummary';
import { useInventoryStore } from '../inventory/store';
import type { MachineRecord } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { attachSessionKey, useTerminalStore } from '../terminal/sessions';
import { startChat, type ChatTarget } from './client';
import { useDotsStore } from './store';

/** Any screen's navigation prop: the dots helpers only navigate. */
export type DotsNavigation = Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate'>;

/**
 * A dot's session opens in chat unless the user already flipped that session to the terminal.
 *
 * CDXC:OpenDots 2026-10-01 WHY:
 * Dots are for handing off work and reading results, so their conversations open in the chat view on the phone whatever the Default Agent View says; an explicit per-session flip still wins, like every other session.
 */
export function preferChatView(machineId: string, sessionId: string): void {
  const sessionKey = attachSessionKey(machineId, sessionId);
  const terminal = useTerminalStore.getState();
  if (terminal.sessionViewModeBySessionKey[sessionKey] === undefined) terminal.setSessionViewMode(sessionKey, 'chat');
}

/** True when the session belongs to a dot project on that computer's last inventory. */
export function isDotSession(machineId: string, session: Pick<GhostexSession, 'projectId'>): boolean {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary;
  return summary?.projects.some((project) => project.isDot && project.projectId === session.projectId) === true;
}

/**
 * Opens one dot conversation in the chat view at once; the terminal attaches in the background
 * (the same order a newly created chat opens in on the Sessions screen).
 */
export function openDotSession(
  navigation: DotsNavigation,
  machine: MachineRecord,
  target: { sessionId: string; projectId: string; title: string; agentId?: string },
  options?: { forceChat?: boolean; onError?: (message: string) => void }
): void {
  const sessionKey = attachSessionKey(machine.id, target.sessionId);
  if (options?.forceChat === true) useTerminalStore.getState().setSessionViewMode(sessionKey, 'chat');
  else preferChatView(machine.id, target.sessionId);
  const attaching = useTerminalStore.getState().attachSession(machine, {
    sessionId: target.sessionId,
    projectId: target.projectId.length > 0 ? target.projectId : undefined,
    title: target.title,
    agentId: target.agentId !== undefined && target.agentId.length > 0 ? target.agentId : undefined,
  });
  navigation.navigate('Terminal', { sessionKey, machineId: machine.id, title: target.title });
  void attaching.catch((error: unknown) => options?.onError?.(error instanceof Error ? error.message : String(error)));
}

/** Opens a session gxserver just started for a dot (startChat, a team chat, a routine run). */
export function openStartedChat(
  navigation: DotsNavigation,
  machine: MachineRecord,
  started: ChatTarget,
  dot: { name: string; agentId?: string },
  onError?: (message: string) => void
): void {
  openDotSession(
    navigation,
    machine,
    { ...started, title: dot.name, agentId: dot.agentId },
    { forceChat: true, onError }
  );
  void useInventoryStore.getState().refreshMachine(machine);
  void useDotsStore.getState().refresh(machine);
}

/** `startChat` (optionally with the first message), then the new conversation in chat. */
export async function startDotChat(
  navigation: DotsNavigation,
  machine: MachineRecord,
  dot: { dotId: string; name: string; agentId?: string },
  message?: string,
  onError?: (message: string) => void
): Promise<void> {
  const started = await startChat(machine, dot.dotId, { message });
  openStartedChat(navigation, machine, started, dot, onError);
}
