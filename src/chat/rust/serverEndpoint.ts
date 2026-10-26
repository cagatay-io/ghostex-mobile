/**
 * Where a computer's gxserver is: the chat link (`machine-link.ts`) and the link opener
 * (`webPreview/machineLinks.ts`) reach it the way the desktop's remote chats reach a computer
 * through their tunnel.
 *
 * The computer tells its port and bearer token over SSH (`ghostex server endpoint`), and the phone
 * forwards its loopback to that port through the SSH session it already holds (the Web Preview's
 * `startPortForward`).
 */
import { execRemoteCommand } from '../../remote/commands';
import { ensureConnected } from '../../inventory/client';
import type { MachineConnectionTarget } from '../../machines/credentials';

const ENDPOINT_TIMEOUT_MS = 20_000;

/**
 * The address the computer's end of the forward dials: gxserver binds `127.0.0.1` only, as the
 * desktop's tunnels (`server/src/ghostex_cli/rpc.rs`) know. The forward's default `localhost` broke
 * every request to a Windows computer (CDXC:Mobile 2026-10-09 in `GhostexSshConnection.kt`).
 */
export const GXSERVER_FORWARD_HOST = '127.0.0.1';

/** The gxserver port each computer last reported, whoever asked (the chat link, a link opener). */
const reportedPorts = new Map<string, number>();

/**
 * The port the computer's gxserver listens on, when any handshake this app run has learned it. A
 * loopback link to that port is gxserver's own (an agent's `ghostex show` page), which opens through
 * the `127.0.0.1` forward the chat already holds rather than a Web preview forward of its own.
 */
export function knownGxserverPort(machineId: string): number | null {
  return reportedPorts.get(machineId) ?? null;
}

/**
 * What `ghostex server endpoint` answered: the daemon's port, token and wire protocol; a computer
 * whose Ghostex predates the verb; or a verb that ran but found no daemon to describe.
 */
export type ServerEndpointAnswer =
  | { kind: 'endpoint'; port: number; authToken: string; protocolVersion: number | null; capabilities: string[] }
  | { kind: 'unsupported'; message: string }
  | { kind: 'failed'; message: string };

/**
 * Asks the computer where its gxserver is, over one SSH exec. Throws only when SSH itself fails;
 * the phone's chat link (`machine-link.ts`) uses the answer as its handshake.
 */
export async function readServerEndpoint(machine: MachineConnectionTarget): Promise<ServerEndpointAnswer> {
  await ensureConnected(machine);
  const exec = await execRemoteCommand(machine.id, 'ghostex server endpoint', ENDPOINT_TIMEOUT_MS);
  const answer = lastJsonObject(exec.stdout);
  const port = typeof answer?.port === 'number' ? answer.port : null;
  const authToken = typeof answer?.authToken === 'string' ? answer.authToken : null;
  if (port !== null && authToken !== null) {
    reportedPorts.set(machine.id, port);
    const protocolVersion = typeof answer?.protocolVersion === 'number' ? answer.protocolVersion : null;
    // Older daemons print no list; they promise nothing beyond the port and token.
    const capabilities = Array.isArray(answer?.capabilities)
      ? answer.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : [];
    return { kind: 'endpoint', port, authToken, protocolVersion, capabilities };
  }
  const detail = `${exec.stderr}`.trim() || `${exec.stdout}`.trim();
  if (/Unknown gxserver command: endpoint|Unknown command/u.test(detail)) {
    return {
      kind: 'unsupported',
      message: 'The computer runs an older Ghostex without `ghostex server endpoint`; update it.',
    };
  }
  return {
    kind: 'failed',
    message: `Could not read the computer's gxserver endpoint${detail ? `: ${detail.slice(0, 200)}` : '.'}`,
  };
}

function lastJsonObject(stdout: string): Record<string, unknown> | null {
  const lines = `${stdout}`.trim().split('\n').reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      // not the answer line
    }
  }
  return null;
}
