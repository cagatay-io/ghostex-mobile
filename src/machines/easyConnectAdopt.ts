/**
 * Adopts an Easy Connect duplicate's credentials onto a Tailscale/SSH survivor when the
 * Tailscale/SSH record does not already have an Easy Connect fallback route of its own (issue #722).
 *
 * Kept separate from `easyConnectRoute.ts` and `store.ts` so both the start-up heal (`store.ts`)
 * and live deduplication (`duplicateComputers.ts`) can call it without circular imports.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getDeviceApiToken,
  getDeviceTokenExpiresAt,
  getEasyConnectAddresses,
  getPublicKey,
  getSshKey,
  getTailcatToken,
  setDeviceApiToken,
  setDeviceTokenExpiresAt,
  setEasyConnectAddresses,
  setEasyConnectPublicKey,
  setEasyConnectSshKey,
} from './credentials';
import { decodeSavedAddresses, encodeSavedAddresses } from './easyConnectAddresses';
import type { MachineRecord } from './store';

export type AdoptedEasyConnectRoute = {
  easyConnectPairedAt: string;
  deviceId?: string;
};

function timeOf(iso: string | null | undefined): number {
  if (iso === null || iso === undefined) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Copies the most recent stale `tailcat` record's Easy Connect SSH key, address list, and (when
 * missing) device API token onto `survivor` so merging away the standalone Easy Connect entry keeps
 * Easy Connect working as the Tailscale/SSH entry's fallback route.
 *
 * Returns null when `survivor` already has its own Easy Connect route or when no stale record holds
 * usable credentials.
 */
export async function adoptEasyConnectRoute(
  survivor: MachineRecord,
  staleTailcat: readonly MachineRecord[],
): Promise<AdoptedEasyConnectRoute | null> {
  if (survivor.transport === 'tailcat' || survivor.easyConnectPairedAt !== undefined) return null;
  const ordered = [...staleTailcat]
    .filter((machine) => machine.transport === 'tailcat')
    .sort((a, b) => {
      const byConnect = timeOf(b.lastConnectedAt) - timeOf(a.lastConnectedAt);
      if (byConnect !== 0) return byConnect;
      return timeOf(b.pairedAt) - timeOf(a.pairedAt);
    });
  for (const stale of ordered) {
    const [sshKey, publicKey, tailcatToken, staleAddressesText, staleApiToken, staleApiTokenExpires] =
      await Promise.all([
        getSshKey(stale.id),
        getPublicKey(stale.id),
        getTailcatToken(stale.id),
        getEasyConnectAddresses(stale.id),
        getDeviceApiToken(stale.id),
        getDeviceTokenExpiresAt(stale.id),
      ]);
    if (!sshKey || !publicKey) continue;
    const savedOnSurvivor = decodeSavedAddresses(await getEasyConnectAddresses(survivor.id), null);
    const savedOnStale = decodeSavedAddresses(staleAddressesText, tailcatToken);
    const addresses = [
      ...(savedOnSurvivor?.addresses ?? []),
      ...(savedOnStale?.addresses ?? []).filter(
        (entry) => !(savedOnSurvivor?.addresses ?? []).some((known) => known.address === entry.address),
      ),
    ];
    const hasDialable = addresses.some((entry) => entry.door !== true);
    if (!hasDialable && tailcatToken !== null && tailcatToken.length > 0) {
      addresses.push({ address: tailcatToken, relay: 'tailcat.dev', kind: 'public' });
    }
    const writes: Promise<void>[] = [
      setEasyConnectSshKey(survivor.id, sshKey),
      setEasyConnectPublicKey(survivor.id, publicKey),
    ];
    if (addresses.length > 0) {
      writes.push(setEasyConnectAddresses(survivor.id, encodeSavedAddresses({ fetchedAt: Date.now(), addresses })));
    }
    let adoptedDeviceId: string | undefined;
    const survivorApiToken = await getDeviceApiToken(survivor.id);
    if (!survivorApiToken && staleApiToken) {
      writes.push(setDeviceApiToken(survivor.id, staleApiToken));
      if (staleApiTokenExpires) writes.push(setDeviceTokenExpiresAt(survivor.id, staleApiTokenExpires));
      if (survivor.deviceId === undefined && stale.deviceId !== undefined) adoptedDeviceId = stale.deviceId;
    }
    await Promise.all(writes);
    const easyConnectPairedAt = stale.pairedAt ?? new Date().toISOString();
    // Mark Easy Connect as on under the adopted pairing, and default fallback to yes if never answered.
    await AsyncStorage.setItem(
      `easyConnect.enabled.${survivor.id}`,
      JSON.stringify({ on: true, pairing: easyConnectPairedAt }),
    ).catch(() => undefined);
    const existingFallback = await AsyncStorage.getItem(`easyConnect.fallback.${survivor.id}`).catch(() => null);
    if (existingFallback === null) {
      await AsyncStorage.setItem(`easyConnect.fallback.${survivor.id}`, 'yes').catch(() => undefined);
    }
    return adoptedDeviceId !== undefined
      ? { easyConnectPairedAt, deviceId: adoptedDeviceId }
      : { easyConnectPairedAt };
  }
  return null;
}
