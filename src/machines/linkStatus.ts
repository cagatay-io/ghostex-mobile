/**
 * What the Sessions screen's computer icons and the Connections sheet say about each computer's link: its status
 * (green connected, yellow slow, red can't connect) and the route it is on. No React Native imports.
 */

import { ConnectionsCopy } from '../copy';
import type { MachineTabConnectionState } from '../components/sessions/MachineTabs';
import type { MachineInventory } from '../inventory/store';
import { latestRoundTrip, type MachineHealth } from './connectionHealthModel';
import { easyConnectRouteName, type EasyConnectPath } from './easyConnectPathModel';
import type { MachineRoute } from './routeChoice';
import { sshRouteLabel, type MachineRecord } from './store';

export type LinkStatus = 'failed' | 'slow' | 'connecting' | 'connected' | 'notConnected';

/** Problems first, then the rest (the sheet's order). */
export const LINK_STATUS_ORDER: readonly LinkStatus[] = ['failed', 'slow', 'connecting', 'connected', 'notConnected'];

export function linkStatus(state: MachineTabConnectionState, health: MachineHealth | undefined): LinkStatus {
  switch (state) {
    case 'failed':
      return 'failed';
    case 'busy':
      return 'connecting';
    case 'disconnected':
      return 'notConnected';
    default:
      return health?.slowSince != null ? 'slow' : 'connected';
  }
}

/** "Tailscale · 100.77.81.4 · 38 ms", "SSH · 192.168.1.20", "Easy Connect · Private Relay · 120 ms", "Easy Connect". */
export function routeLine(
  machine: Pick<MachineRecord, 'transport' | 'host' | 'tailscaleSsh'>,
  activeRoute: MachineRoute | undefined,
  path: EasyConnectPath | undefined,
  health: MachineHealth | undefined,
  status: LinkStatus,
): string {
  if (machine.transport === 'demo') return ConnectionsCopy.demo;
  const onEasyConnect = machine.transport === 'tailcat' || activeRoute === 'easyConnect';
  const parts = onEasyConnect
    ? [ConnectionsCopy.easyConnect, ...(path === undefined ? [] : [easyConnectRouteName(path)])]
    : [sshRouteLabel(machine), ...(machine.host.length > 0 ? [machine.host] : [])];
  const ms = latestRoundTrip(health);
  if ((status === 'connected' || status === 'slow') && ms !== null) parts.push(ConnectionsCopy.roundTrip(ms));
  return parts.join(' · ');
}

/** A computer's connection as its tab draws it, from its list read (the tab strip and the sheet share it). */
export function inventoryConnectionState(
  inventory:
    | Pick<MachineInventory, 'hasLoaded' | 'retrying' | 'refreshing' | 'summary' | 'lastError'>
    | undefined,
): MachineTabConnectionState {
  // CDXC:RemoteMachines 2026-11-15 DECISION:
  // User (phone, offline Windows PC): "I already see red icon for the machine". A computer whose last read failed is red
  // while its retries run (the sheet's Retry shows the busy part), not a grey loading ring; the ring is the first
  // connect only, before any failure.
  if (inventory !== undefined && inventory.lastError !== null) return 'failed';
  if (
    inventory === undefined ||
    !inventory.hasLoaded ||
    inventory.retrying ||
    (inventory.refreshing && inventory.summary === null)
  ) {
    return 'busy';
  }
  return inventory.summary === null ? 'disconnected' : 'connected';
}
