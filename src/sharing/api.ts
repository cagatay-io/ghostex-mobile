/**
 * Built-in Share links client for the phone app (JS-only, OTA-safe).
 *
 * Talks to gxserver's `/api/sharing` over the existing warm machine link (`chatMachineLink`).
 * Every touchpoint is capability-gated on `"shareLinks"` so older servers hide the Share action
 * cleanly without breaking 11.2.1+ or older desktop computers.
 */

import { useEffect, useState } from 'react';

import type { MachineConnectionTarget } from '../machines/credentials';
import { machineNameById } from '../machines/store';
import { chatMachineLink, onChatLinkHandshake, unreachableMessage } from '../chat/rust/machine-link';

export const SHARE_LINKS_CAPABILITY = 'shareLinks';

const CALL_TIMEOUT_MS = 25_000;

export type ShareExpiry = '1h' | '24h' | '7d' | 'untilStopped';

export type ShareItem = {
  id?: string;
  shareId: string;
  kind: 'page' | 'port';
  title: string;
  url: string;
  createdAtMs: number;
  expiresAtMs: number | null;
  passcodeRequired?: boolean;
  hasPasscode?: boolean;
  passcode?: string;
  pageId?: string;
  port?: number;
};

export type SharingConfig = {
  enabled: boolean;
  provider: string;
  relayUrl: string;
  defaultExpiry: ShareExpiry;
  defaultPasscode: boolean;
};

export type SharingState = {
  config: SharingConfig;
  shares: ShareItem[];
  provider?: {
    id: string;
    displayName: string;
    connected: boolean;
    hostname?: string | null;
    lastError?: string | null;
  };
};

export type SharingAnswer<T = SharingState> =
  | { result: T; error: null }
  | { result: null; error: string };

type MachineShareSnapshot = {
  pages: Set<string>;
  ports: Set<number>;
  shares: ShareItem[];
  supported: boolean;
};

const snapshots = new Map<string, MachineShareSnapshot>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

onChatLinkHandshake((machine, capabilities) => {
  const prev = snapshots.get(machine.id);
  const supported = capabilities.includes(SHARE_LINKS_CAPABILITY);
  if (prev === undefined || prev.supported !== supported) {
    snapshots.set(machine.id, {
      pages: prev?.pages ?? new Set(),
      ports: prev?.ports ?? new Set(),
      shares: prev?.shares ?? [],
      supported,
    });
    notifyListeners();
  }
});

export function updateSharingSnapshot(machineId: string, state: SharingState) {
  const pages = new Set<string>();
  const ports = new Set<number>();
  const shares = Array.isArray(state.shares) ? state.shares : [];
  for (const share of shares) {
    if (share.kind === 'page' && typeof share.pageId === 'string') {
      pages.add(share.pageId);
    } else if (share.kind === 'port' && typeof share.port === 'number') {
      ports.add(share.port);
    }
  }
  snapshots.set(machineId, { pages, ports, shares, supported: true });
  notifyListeners();
}

export function supportsShareLinks(machine: MachineConnectionTarget | undefined): boolean {
  if (machine === undefined) return false;
  const caps = chatMachineLink(machine).capabilities();
  if (caps !== null) return caps.includes(SHARE_LINKS_CAPABILITY);
  return snapshots.get(machine.id)?.supported === true;
}

export function useShareLinksSupported(machine: MachineConnectionTarget | undefined): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return supportsShareLinks(machine);
}

export function useMachineShares(machineId: string | null | undefined): {
  pages: ReadonlySet<string>;
  ports: ReadonlySet<number>;
} {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  const snap = machineId ? snapshots.get(machineId) : undefined;
  return {
    pages: snap?.pages ?? EMPTY_STRINGS,
    ports: snap?.ports ?? EMPTY_NUMBERS,
  };
}

const EMPTY_STRINGS: ReadonlySet<string> = new Set();
const EMPTY_NUMBERS: ReadonlySet<number> = new Set();

export async function sharingRpc<T = SharingState>(
  machine: MachineConnectionTarget,
  params: Record<string, unknown>,
): Promise<SharingAnswer<T>> {
  try {
    const answer = await chatMachineLink(machine).rpc('sharing', params, CALL_TIMEOUT_MS);
    if (answer.error === null) {
      const result = (answer.result ?? {}) as Record<string, unknown>;
      if (Array.isArray(result.shares)) {
        updateSharingSnapshot(machine.id, result as unknown as SharingState);
      } else {
        const nested = (result.status ?? result.state) as SharingState | undefined;
        if (nested && typeof nested === 'object' && Array.isArray(nested.shares)) {
          updateSharingSnapshot(machine.id, nested);
        }
      }
      return { result: result as unknown as T, error: null };
    }
    const unknown = /unknown|not a gxserver|no gxserver endpoint/i.test(answer.error.message);
    return {
      result: null,
      error: unknown
        ? `Update Ghostex on ${machineNameById(machine.id)} to share links from your phone.`
        : answer.error.message,
    };
  } catch (failure) {
    return {
      result: null,
      error: failure instanceof Error ? failure.message : unreachableMessage(machineNameById(machine.id)),
    };
  }
}

export async function refreshMachineShares(machine: MachineConnectionTarget): Promise<void> {
  if (!supportsShareLinks(machine)) return;
  await sharingRpc(machine, { op: 'read' });
}

const BLOCKED_PORTS = new Set([
  22, 2222, 5432, 5433, 3306, 33060, 27017, 27018, 6379, 6380, 11211, 9200, 9300, 9042, 1433, 1521,
  5984, 8529, 26257, 2375, 2376, 5900, 3389, 445, 139, 25, 465, 587, 143, 993, 110, 995,
]);

const BLOCKED_PROCESSES = [
  'gxserver',
  'sshd',
  'postgres',
  'mysqld',
  'mariadbd',
  'mongod',
  'redis-server',
  'valkey-server',
  'memcached',
  'dockerd',
];

export function isPortShareBlocked(port: number, command?: string | null): string | null {
  if (port >= 58744 && port <= 58760) return 'Ghostex internal port';
  if (BLOCKED_PORTS.has(port)) return 'Protected system or database port';
  if (command) {
    const lower = command.toLowerCase();
    if (BLOCKED_PROCESSES.some((name) => lower.includes(name))) {
      return 'Protected local service';
    }
  }
  return null;
}

export function formatShareRemaining(expiresAtMs: number | null): string {
  if (expiresAtMs === null) return 'Until stopped';
  const mins = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 60_000));
  if (mins === 0) return 'Expires in <1 min';
  if (mins < 60) return `Expires in ${mins} min`;
  if (mins < 1440) return `Expires in ${Math.round(mins / 60)} h`;
  return `Expires in ${Math.round(mins / 1440)} d`;
}
