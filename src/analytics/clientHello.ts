/**
 * Mobile analytics hello (`client.connected`).
 *
 * Every Ghostex analytics event is sent by the gxserver on the user's machine,
 * never by this app; see ANALYTICS.md in the main repo. This module reports
 * one `client.connected` per machine per hour carrying only `client: "mobile"`,
 * `client_os: "android" | "ios"`, `client_os_version`, and `client_app_version`.
 *
 * Delivery uses the warm HTTP forward (`POST /api/recordClientEvent`) when
 * available and falls back to `ghostex client-hello` over SSH on older or
 * forwarding-disabled servers. Transient failures back off briefly instead of
 * silencing the whole hour, so the real OS ping recovers quickly after a
 * connect burst or channel refusal.
 */

import { Platform } from 'react-native';

import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { clientHelloCommand, type ClientHelloPlatform } from '../commands/ghostexCli';
import { isDemoMachine } from '../demo/identity';
import type { MachineConnectionTarget } from '../machines/credentials';
import { runningAppVersion } from '../updates/overTheAir';
import { isMobileAnalyticsAllowed } from './privacy';
import { sendMobileClientEvent } from './recordEvent';

/** The daemon dedupes to one attach per client kind per hour; match it. */
const HELLO_INTERVAL_MS = 60 * 60 * 1000;
/** Short cooldown after a transient transport failure so we recover without spamming. */
const HELLO_FAILURE_COOLDOWN_MS = 60 * 1000;
const HELLO_TIMEOUT_MS = 10_000;

/** Next timestamp at which a hello may go out for each machine id. */
const nextHelloAtByMachineId = new Map<string, number>();
const inFlightHelloByMachineId = new Set<string>();
let lastMachineId: string | null = null;

const firstHelloListeners = new Set<(machineId: string) => void>();

/** The computer that most recently got a hello: where a screen without its own computer is reported. */
export function lastHelloMachineId(): string | null {
  return lastMachineId;
}

/** Called once when the first real computer becomes available for analytics in this app run. */
export function onFirstHelloMachine(listener: (machineId: string) => void): () => void {
  firstHelloListeners.add(listener);
  return () => firstHelloListeners.delete(listener);
}

/** Clamp a version token to the daemon's taxonomy charset: `[0-9A-Za-z.-]{1,32}`. */
function normalizedVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0 || trimmed.length > 32 || !/^[0-9A-Za-z.-]+$/u.test(trimmed)) return undefined;
  return trimmed;
}

function currentPlatform(): ClientHelloPlatform | null {
  if (Platform.OS === 'ios') {
    return {
      os: 'ios',
      osVersion: normalizedVersion(Platform.constants.osVersion),
      appVersion: normalizedVersion(runningAppVersion() ?? undefined),
    };
  }
  if (Platform.OS === 'android') {
    return {
      os: 'android',
      osVersion: normalizedVersion(Platform.constants.Release),
      appVersion: normalizedVersion(runningAppVersion() ?? undefined),
    };
  }
  return null;
}

function clientHelloProperties(platform: ClientHelloPlatform): Record<string, string> {
  const properties: Record<string, string> = {
    client: 'mobile',
    client_os: platform.os,
  };
  if (platform.osVersion !== undefined) properties.client_os_version = platform.osVersion;
  if (platform.appVersion !== undefined) properties.client_app_version = platform.appVersion;
  return properties;
}

/**
 * Send `client.connected` (always with `client_os: 'android' | 'ios'`) for `machine`
 * unless one succeeded within the last hour or a send is already in flight.
 * Never throws and never blocks the caller.
 */
export function reportClientHello(machine: MachineConnectionTarget): void {
  if (isDemoMachine(machine) || isCloudBoxMachineId(machine.id)) return;
  const platform = currentPlatform();
  if (platform === null) return;

  const wasNull = lastMachineId === null;
  lastMachineId = machine.id;
  if (wasNull) {
    for (const listener of firstHelloListeners) listener(machine.id);
  }

  if (!isMobileAnalyticsAllowed(machine.id)) return;

  const now = Date.now();
  const nextAllowedAt = nextHelloAtByMachineId.get(machine.id);
  if (nextAllowedAt !== undefined && now < nextAllowedAt) return;
  if (inFlightHelloByMachineId.has(machine.id)) return;

  inFlightHelloByMachineId.add(machine.id);
  void sendMobileClientEvent(
    machine,
    { event: 'client.connected', properties: clientHelloProperties(platform) },
    clientHelloCommand(platform),
    HELLO_TIMEOUT_MS,
  )
    .then((outcome) => {
      const waitMs = outcome === 'failed' ? HELLO_FAILURE_COOLDOWN_MS : HELLO_INTERVAL_MS;
      nextHelloAtByMachineId.set(machine.id, Date.now() + waitMs);
    })
    .catch(() => {
      nextHelloAtByMachineId.set(machine.id, Date.now() + HELLO_FAILURE_COOLDOWN_MS);
    })
    .finally(() => {
      inFlightHelloByMachineId.delete(machine.id);
    });
}
