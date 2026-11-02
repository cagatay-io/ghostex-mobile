/**
 * The Sessions screen's side of a box the phone starts with the computer off: the progress line
 * while the box comes up (the boot card's step words), then its chat, opened like any box session.
 */

import type { MachineRecord } from '../machines/store';
import { openBoxChat } from './open';
import { startBoxFromPhone } from './phoneStart';

export type PhoneBoxStart = {
  machine: MachineRecord;
  projectId: string;
  projectTitle: string;
  agent: { agentId: string; name: string };
};

export async function runPhoneBoxStart(
  start: PhoneBoxStart,
  firstMessage: string,
  ui: {
    setProgress: (message: string | null) => void;
    setTransientStatus: (message: string | null) => void;
    navigate: (params: { sessionKey: string; machineId: string; title: string }) => void;
  },
): Promise<void> {
  ui.setProgress(`Starting ${start.agent.name} on a Cloud Box…`);
  try {
    const title = firstMessage.split('\n')[0].slice(0, 60);
    const started = await startBoxFromPhone({
      homeMachineId: start.machine.id,
      homeProjectId: start.projectId,
      agentId: start.agent.agentId,
      firstMessage,
      title,
      deviceId: start.machine.deviceId,
      onProgress: (label) => ui.setProgress(`${label}…`),
    });
    ui.setProgress(null);
    openBoxChat(started.entry, started.sessionId, started.boxProjectId, title, ui.navigate);
  } catch (error) {
    ui.setProgress(null);
    ui.setTransientStatus(`Couldn't start the cloud box: ${error instanceof Error ? error.message : String(error)}`);
  }
}
