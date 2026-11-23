/**
 * Stops using an older or duplicate record for a computer the moment a newer record, or a
 * Tailscale/SSH record for the same computer (issue #722), is identified.
 *
 * CDXC:RemotePairing 2026-11-11 WHY:
 * Coordinator's brief: "recognise a newly scanned computer as one it already has (by what
 * identifies the computer, not by the address), replace the old entry, and on start merge
 * duplicates that already exist, keeping the one that works; never drop an entry for a different
 * computer." The start-up merge (`healDuplicateComputers` in store.ts) runs before anything
 * connects, so it can only use what earlier connects proved or saved. A phone that just took this
 * update has proved nothing yet, and a pairing made a moment ago has not connected either. So each
 * successful Easy Connect dial, and each Easy Connect address list fetched over an authenticated
 * Tailscale/SSH link, looks again: when duplicates are found (`duplicateMergeFor`), the stale
 * Easy Connect entries are hidden and disconnected at once (adopting their Easy Connect fallback
 * route onto a Tailscale/SSH survivor that did not already have one), which ends the duplicate
 * computer and sessions straight away, and the next start merges them permanently with their saved
 * data. Hiding is the app's own switch for a computer, so nothing is deleted while the app runs.
 */
import { logAppEvent } from '../app/appLog';
import { duplicateMergeFor, proofScopeOf, sshProofScope, tailcatServerKey } from './computerIdentity';
import { getEasyConnectAddresses, getTailcatToken } from './credentials';
import { noteDuplicateEntries } from './duplicateNotice';
import { decodeSavedAddresses } from './easyConnectAddresses';
import { adoptEasyConnectRoute } from './easyConnectAdopt';
import { fallbackChoice, noteEasyConnectOn, setFallbackChoice } from './easyConnectRoute';
import { loadMachineProofs, recordProvenAddress } from './provenComputer';
import { useMachinesStore, type MachineRecord } from './store';

type DisconnectHandler = (staleMachineId: string) => void;

let registeredDisconnect: DisconnectHandler | null = null;

/** Registers how `remote/connection.ts` cancels and tears down a hidden duplicate's connection. */
export function setDuplicateDisconnectHandler(disconnect: DisconnectHandler): void {
  registeredDisconnect = disconnect;
}

/**
 * Checks whether `machineId` shares an Easy Connect server key with another saved record and, if
 * so, hides and disconnects the stale Easy Connect duplicate(s) immediately (adopting their Easy
 * Connect fallback route onto a Tailscale/SSH survivor that does not already have one).
 */
export async function reconcileDuplicateComputers(
  machineId: string,
  disconnect?: DisconnectHandler,
): Promise<void> {
  const { machines } = useMachinesStore.getState();
  const candidates = machines.filter((machine) => machine.transport !== 'demo');
  if (candidates.length < 2 || !candidates.some((machine) => machine.transport === 'tailcat')) return;

  const tailcat = candidates.filter((machine) => machine.transport === 'tailcat');
  const ssh = candidates.filter((machine) => machine.transport !== 'tailcat');
  const [tokenEntries, sshAddressEntries] = await Promise.all([
    Promise.all(tailcat.map(async (machine) => [machine.id, await getTailcatToken(machine.id)] as const)),
    Promise.all(ssh.map(async (machine) => [machine.id, await getEasyConnectAddresses(machine.id)] as const)),
  ]);
  const tokens = new Map<string, string | null>(tokenEntries);
  const sshKeys = new Map<string, string[]>();
  for (const [id, raw] of sshAddressEntries) {
    const saved = decodeSavedAddresses(raw, null);
    if (saved === null) continue;
    const keys = [
      ...new Set(
        saved.addresses
          .map((entry) => tailcatServerKey(entry.address))
          .filter((key): key is string => key !== null),
      ),
    ];
    if (keys.length > 0) sshKeys.set(id, keys);
  }
  const scopeById = new Map<string, string>();
  for (const machine of candidates) {
    if (machine.transport === 'tailcat') {
      const token = tokens.get(machine.id) ?? null;
      if (token !== null) scopeById.set(machine.id, token);
    } else {
      const scope = sshProofScope(machine);
      if (scope !== null) scopeById.set(machine.id, scope);
    }
  }
  const proofs = await loadMachineProofs((id) => scopeById.get(id) ?? null);
  const merge = duplicateMergeFor(
    machines,
    (id) => tokens.get(id) ?? null,
    (id) => {
      const proven = proofs[id]?.keys ?? [];
      const saved = sshKeys.get(id) ?? [];
      return saved.length === 0 ? proven : [...new Set([...proven, ...saved])];
    },
    machineId,
    (id) => proofs[id]?.connectedAt ?? null,
  );
  if (merge === null) return;

  const stateNow = useMachinesStore.getState();
  const survivor = stateNow.machines.find((machine) => machine.id === merge.survivorId);
  if (survivor === undefined) return;
  const staleRecords = merge.staleIds
    .map((id) => stateNow.machines.find((machine) => machine.id === id))
    .filter((entry): entry is MachineRecord => entry !== undefined && entry.disabled !== true);
  if (staleRecords.length === 0) return;

  if (survivor.transport !== 'tailcat' && survivor.easyConnectPairedAt === undefined) {
    const adopted = await adoptEasyConnectRoute(survivor, staleRecords);
    if (adopted !== null) {
      const store = useMachinesStore.getState();
      store.setEasyConnectRoute(survivor.id, adopted.easyConnectPairedAt);
      if (adopted.deviceId !== undefined && survivor.deviceId === undefined) {
        store.setMachineDeviceId(survivor.id, adopted.deviceId);
      }
      noteEasyConnectOn(survivor.id, true);
      if ((await fallbackChoice(survivor.id)) === undefined) {
        setFallbackChoice(survivor.id, 'yes');
      }
    }
  }

  // Never leave both records hidden: if a stale visible entry is hidden, the kept entry becomes visible.
  if (survivor.disabled === true) {
    useMachinesStore.getState().setMachineDisabled(survivor.id, false);
  }

  const teardown = disconnect ?? registeredDisconnect;
  const hidden: string[] = [];
  for (const record of staleRecords) {
    const current = useMachinesStore.getState().machines.find((machine) => machine.id === record.id);
    if (current === undefined || current.disabled === true) continue;
    logAppEvent(
      survivor.transport !== 'tailcat'
        ? `Easy Connect: ${record.id} is a duplicate Easy Connect entry for ${survivor.id}; hidden now, merged the next time the app opens`
        : `Easy Connect: ${record.id} is an older entry for the computer ${survivor.id} just reached; hidden now, merged the next time the app opens`,
    );
    useMachinesStore.getState().setMachineDisabled(record.id, true);
    teardown?.(record.id);
    hidden.push(record.id);
  }
  await noteDuplicateEntries(survivor.id, 'hidden', hidden);
}

/**
 * `machineId` connected through `address`, in an attempt that began while its pairing scope was
 * `pairedAddress` (a `tc…` address for `tailcat`, or `ssh:<host>:<port>` for an SSH/Tailscale
 * record's Easy Connect fallback route; a proof counts only for that pairing, provenComputer.ts).
 * `disconnect` ends a record's connection and tunnel (given by the caller, which owns them).
 */
export function noteConnectedThrough(
  machineId: string,
  pairedAddress: string | null,
  address: string,
  disconnect: DisconnectHandler,
): void {
  void (async () => {
    const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
    if (machine === undefined || machine.transport === 'demo') return;
    // A connect that began under a pairing the record no longer has (it was paired again or edited
    // meanwhile) proves nothing about the login it has now, and must not stand in for it.
    const scopeNow =
      machine.transport === 'tailcat' ? proofScopeOf(await getTailcatToken(machineId)) : sshProofScope(machine);
    const scopeAtStart = proofScopeOf(pairedAddress);
    if (scopeNow === null || scopeNow !== scopeAtStart) return;
    await recordProvenAddress(machineId, pairedAddress, address);
    await reconcileDuplicateComputers(machineId, disconnect);
  })().catch(() => undefined);
}

/**
 * Called after a computer's Easy Connect address list is saved (over SSH/Tailscale or Easy Connect)
 * so any duplicate Easy Connect entry for the same computer is hidden immediately.
 */
export function noteEasyConnectAddressesSaved(machineId: string): void {
  void reconcileDuplicateComputers(machineId).catch(() => undefined);
}
