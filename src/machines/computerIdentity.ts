/**
 * Which saved Easy Connect records point at the same computer, and which one
 * of them to keep.
 *
 * CDXC:RemotePairing 2026-11-05 WHY:
 * Each saved machine runs its own tailcat tunnel (the bridge keys forwards on
 * the machine id), and every tunnel uses this phone's one client key. Two
 * records for one computer therefore give the computer's WireGuard a single
 * peer behind two tunnels: its replies follow whichever tunnel spoke last, so
 * the chat link and Settings › Voice never connect while the SSH inventory
 * still does. A phone paired twice ended up exactly there. The computer is
 * named by the server key inside its `tc…` address (the DERP relays and the
 * pre-shared key in the address can change between pairings; the key does
 * not), so records with one key are one computer and are merged into one.
 *
 * CDXC:RemotePairing 2026-11-11 WHY:
 * Since 11.3.0 a pairing code carries the address of the computer's pairing door, a helper with a
 * key of its own, so a phone that scanned a new code through "Add a computer" for a computer it
 * already had saved a second record under a key no other record had. The computer replaces this
 * phone's earlier pairing, so the old record was dead ("SSH needs a key or password") and both
 * dialled with the phone's one key: the two tunnels this file exists to prevent. Two records are
 * therefore one computer when they share a key the phone has PROVEN for each: the key of the
 * address a record paired with (the pairing itself went through it) and the key of every address
 * a record connected through with its own credentials (machines/provenComputer.ts). An address a
 * computer merely names in its list proves nothing, so a computer that listed another computer's
 * address can never make the phone drop that computer's record: its own login there fails.
 *
 * No React Native imports: `bun test` runs this file directly.
 */

import type { MachineRecord } from './store';

/** The tailcat address prefix (`tailcat.Addr`: "tc" + base64url(CBOR ConnInfo)). */
const TAILCAT_ADDRESS_PREFIX = 'tc';
/** CBOR field name of `ConnInfo.ServerPublic` (tailcat wire.go). */
const SERVER_PUBLIC_FIELD = 'p';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function decodeBase64Url(text: string): Uint8Array | null {
  if (text.length === 0 || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const index = BASE64URL_ALPHABET.indexOf(char);
    if (index < 0) return null;
    buffer = ((buffer << 6) | index) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** A CBOR item head: major type and argument (length or value), or null when it runs past the end. */
function readHead(bytes: Uint8Array, offset: number): { major: number; value: number; next: number } | null {
  if (offset >= bytes.length) return null;
  const initial = bytes[offset]!;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) return { major, value: info, next: offset + 1 };
  const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
  // Indefinite lengths (31) never appear in tailcat addresses; reject them and the reserved values.
  if (width === 0 || offset + 1 + width > bytes.length) return null;
  let value = 0;
  for (let i = 0; i < width; i += 1) value = value * 256 + bytes[offset + 1 + i]!;
  return { major, value, next: offset + 1 + width };
}

/** The offset just past the CBOR item at `offset`, or null when it is malformed. */
function skipItem(bytes: Uint8Array, offset: number, depth = 0): number | null {
  if (depth > 16) return null;
  const head = readHead(bytes, offset);
  if (head === null) return null;
  switch (head.major) {
    case 0:
    case 1:
    case 7:
      return head.next;
    case 2:
    case 3:
      return head.next + head.value <= bytes.length ? head.next + head.value : null;
    case 4:
    case 5: {
      let next: number | null = head.next;
      const items = head.major === 5 ? head.value * 2 : head.value;
      for (let i = 0; i < items && next !== null; i += 1) next = skipItem(bytes, next, depth + 1);
      return next;
    }
    case 6:
      return skipItem(bytes, head.next, depth + 1);
    default:
      return null;
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The computer's tailcat server key (`nodekey:<hex>`) from an Easy Connect
 * address, or null when the address is not one this reader understands.
 */
export function tailcatServerKey(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed.startsWith(TAILCAT_ADDRESS_PREFIX)) return null;
  const bytes = decodeBase64Url(trimmed.slice(TAILCAT_ADDRESS_PREFIX.length));
  if (bytes === null) return null;
  const map = readHead(bytes, 0);
  if (map === null || map.major !== 5) return null;
  let offset = map.next;
  for (let entry = 0; entry < map.value; entry += 1) {
    const key = readHead(bytes, offset);
    if (key === null) return null;
    const keyEnd = skipItem(bytes, offset);
    if (keyEnd === null) return null;
    const isServerPublic =
      key.major === 3 &&
      key.value === SERVER_PUBLIC_FIELD.length &&
      String.fromCharCode(...bytes.subarray(key.next, keyEnd)) === SERVER_PUBLIC_FIELD;
    if (isServerPublic) {
      const value = readHead(bytes, keyEnd);
      if (value === null || value.major !== 2 || value.value === 0) return null;
      const end = value.next + value.value;
      if (end > bytes.length) return null;
      return `nodekey:${hex(bytes.subarray(value.next, end))}`;
    }
    const valueEnd = skipItem(bytes, keyEnd);
    if (valueEnd === null) return null;
    offset = valueEnd;
  }
  return null;
}

/**
 * Proof scope for an SSH/Tailscale computer: tied to its host and port so editing them
 * automatically voids earlier Easy Connect proofs (`provenComputer.ts`).
 */
export function sshProofScope(machine: Pick<MachineRecord, 'host' | 'port'>): string | null {
  const host = machine.host.trim().toLowerCase();
  if (host.length === 0) return null;
  return `ssh:${host}:${machine.port}`;
}

/**
 * Normalises a record's pairing/proof scope: a `ssh:<host>:<port>` scope passes through as-is,
 * while an Easy Connect `tc…` address reduces to its server key (`nodekey:<hex>`).
 */
export function proofScopeOf(value: string | null): string | null {
  if (value === null) return null;
  if (value.startsWith('ssh:')) return value;
  return tailcatServerKey(value);
}

/** Later timestamps sort first; a missing one sorts last. */
function timeOf(iso: string | null | undefined): number {
  if (iso === null || iso === undefined) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/*
 * CDXC:RemotePairing 2026-11-11 WHY:
 * Review of the first version (finding 2): the record kept was "a shown one over a hidden one, then
 * the newest pairing". A user who showed the old dead record again and hid the working one before
 * the next start had the dead one kept and the only working login deleted. The record kept is now
 * the one whose own login worked last: the latest connect it made with its own credentials under
 * the pairing it has now (`connectedAtOf`, machines/provenComputer.ts), whether it is shown or
 * hidden. The computer retires a phone's earlier pairing when that phone pairs again, so the record
 * that connected last is the one the computer still accepts. When no record of the group has such a
 * connect, or two have the same time, nothing says which login works and the group is left alone
 * until one connects.
 */
/** The record to keep among several for one computer (see above), or null when none can be told. */
function survivorOf(
  group: readonly MachineRecord[],
  connectedAtOf: (machineId: string) => number | null,
): MachineRecord | null {
  let best: MachineRecord | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  let tied = false;
  for (const machine of group) {
    const at = connectedAtOf(machine.id);
    if (at === null || !Number.isFinite(at)) continue;
    if (at > bestAt) {
      best = machine;
      bestAt = at;
      tied = false;
    } else if (at === bestAt) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * When a group contains both Tailscale/SSH and Easy Connect records for the same computer (issue
 * #722), keep the Tailscale/SSH record so the user keeps both routes (Tailscale primary + Easy
 * Connect fallback) instead of losing Tailscale. When several SSH records exist in the same group,
 * pick the best one to absorb the Easy Connect duplicate(s) and leave the other SSH records alone.
 */
function sshSurvivorOf(
  sshGroup: readonly MachineRecord[],
  connectedAtOf: (machineId: string) => number | null,
): MachineRecord {
  const rank = (machine: MachineRecord): [number, number, number, number] => {
    const provenAt = connectedAtOf(machine.id);
    return [
      machine.easyConnectPairedAt !== undefined ? 1 : 0,
      machine.disabled !== true ? 1 : 0,
      provenAt !== null && Number.isFinite(provenAt) ? provenAt : Number.NEGATIVE_INFINITY,
      timeOf(machine.lastConnectedAt),
    ];
  };
  let best = sshGroup[0]!;
  let bestRank = rank(best);
  for (const candidate of sshGroup.slice(1)) {
    const candidateRank = rank(candidate);
    for (let i = 0; i < candidateRank.length; i += 1) {
      if (candidateRank[i]! > bestRank[i]!) {
        best = candidate;
        bestRank = candidateRank;
        break;
      }
      if (candidateRank[i]! < bestRank[i]!) break;
    }
  }
  return best;
}

export type MachineMerge = {
  /** The record kept. */
  survivorId: string;
  /** Records for the same computer that are dropped; their data moves to the survivor. */
  staleIds: string[];
};

export type MachineDedupe = {
  /** The saved list with one record per computer, in the original tab order. */
  machines: MachineRecord[];
  merges: MachineMerge[];
};

/**
 * Collapse duplicate records whose Easy Connect server keys name the same computer into one.
 * `tokenOf` returns a `tailcat` record's saved address (null for SSH/Tailscale records or when none
 * is saved). `provenOf` returns the Easy Connect server keys proven or fetched for a record (both
 * `tailcat` and SSH/Tailscale records).
 *
 * - Among `tailcat` records only: the one whose own login worked last (`connectedAtOf`, see
 *   `survivorOf`) is kept; a group where that cannot be told is left alone.
 * - When an SSH/Tailscale record matches one or more `tailcat` records (issue #722): the
 *   SSH/Tailscale record is kept and the `tailcat` duplicate(s) are merged into it so the computer
 *   appears once with Tailscale primary and Easy Connect fallback. Two SSH records are never merged
 *   with each other.
 *
 * The kept record takes the place of the first affected record in the tab order, stays shown when
 * any affected record was, keeps a custom name, and remembers the latest connection.
 */
export function dedupeMachineRecords(
  machines: readonly MachineRecord[],
  tokenOf: (machineId: string) => string | null,
  provenOf: (machineId: string) => readonly string[] = () => [],
  connectedAtOf: (machineId: string) => number | null = () => null,
): MachineDedupe {
  // Records that share an Easy Connect server key are one computer; one record can link two others,
  // so the groups are what the links join up.
  const groupOfKey = new Map<string, MachineRecord[]>();
  const groups: MachineRecord[][] = [];
  for (const machine of machines) {
    if (machine.transport === 'demo') continue;
    let keys: string[];
    if (machine.transport === 'tailcat') {
      const token = tokenOf(machine.id);
      const pairedKey = token === null ? null : tailcatServerKey(token);
      if (pairedKey === null) continue;
      keys = [pairedKey, ...provenOf(machine.id)];
    } else {
      keys = [...provenOf(machine.id)];
      if (keys.length === 0) continue;
    }
    const joined: MachineRecord[][] = [];
    for (const key of keys) {
      const known = groupOfKey.get(key);
      if (known !== undefined && !joined.includes(known)) joined.push(known);
    }
    let group = joined[0];
    if (group === undefined) {
      group = [];
      groups.push(group);
    }
    for (const other of joined.slice(1)) {
      group.push(...other);
      groups.splice(groups.indexOf(other), 1);
      for (const [key, owner] of groupOfKey) if (owner === other) groupOfKey.set(key, group);
    }
    group.push(machine);
    for (const key of keys) groupOfKey.set(key, group);
  }
  const orderOf = (id: string): number => machines.findIndex((machine) => machine.id === id);
  const replacements = new Map<string, MachineRecord | null>();
  const merges: MachineMerge[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    const ssh = group.filter((machine) => machine.transport !== 'tailcat');
    const tailcat = group.filter((machine) => machine.transport === 'tailcat');
    // Never collapse two SSH/Tailscale records into each other; only drop duplicate Easy Connect entries.
    if (tailcat.length === 0) continue;
    let survivor: MachineRecord | null;
    let stale: MachineRecord[];
    if (ssh.length > 0) {
      survivor = sshSurvivorOf(ssh, connectedAtOf);
      stale = tailcat;
    } else {
      survivor = survivorOf(tailcat, connectedAtOf);
      if (survivor === null) continue;
      stale = tailcat.filter((machine) => machine.id !== survivor!.id);
    }
    const affected = [survivor, ...stale];
    const customName = affected.find(
      (machine) =>
        machine.name.length > 0 && machine.computerName !== undefined && machine.name !== machine.computerName,
    )?.name;
    const name =
      survivor.transport !== 'tailcat'
        ? survivor.name.length > 0
          ? survivor.name
          : (customName ?? stale.find((machine) => machine.name.length > 0)?.name ?? survivor.name)
        : (customName ?? survivor.name);
    const computerName = survivor.computerName ?? stale.find((machine) => machine.computerName !== undefined)?.computerName;
    const latestConnection = affected.reduce<string | null>(
      (latest, machine) => (timeOf(machine.lastConnectedAt) > timeOf(latest) ? machine.lastConnectedAt : latest),
      null,
    );
    const merged: MachineRecord = {
      ...survivor,
      name,
      ...(computerName !== undefined ? { computerName } : {}),
      lastConnectedAt: latestConnection,
    };
    if (affected.some((machine) => machine.disabled !== true)) delete merged.disabled;
    // The affected group's first slot in the tab order holds the merged record; the stale records drop out.
    const inTabOrder = [...affected].sort((a, b) => orderOf(a.id) - orderOf(b.id));
    replacements.set(inTabOrder[0]!.id, merged);
    for (const machine of inTabOrder.slice(1)) replacements.set(machine.id, null);
    merges.push({ survivorId: survivor.id, staleIds: stale.map((machine) => machine.id) });
  }
  if (merges.length === 0) return { machines: [...machines], merges };
  const next: MachineRecord[] = [];
  for (const machine of machines) {
    const replacement = replacements.get(machine.id);
    if (replacement === undefined) next.push(machine);
    else if (replacement !== null) next.push(replacement);
  }
  return { machines: next, merges };
}

/**
 * The saved Easy Connect machine (other than `ignoreId`) whose address names the same computer as
 * `address`: its paired address, or any address in the list the computer gave it (`addressesOf`),
 * since a computer's address on Ghostex's relay has a server key of its own.
 */
export function machineForSameComputer(
  machines: readonly MachineRecord[],
  tokenOf: (machineId: string) => string | null,
  address: string,
  ignoreId: string | null = null,
  addressesOf: (machineId: string) => readonly string[] = () => [],
): MachineRecord | null {
  const serverKey = tailcatServerKey(address);
  if (serverKey === null) return null;
  const candidates = machines.filter((machine) => machine.id !== ignoreId && machine.transport === 'tailcat');
  const names = (entries: readonly string[]): boolean => entries.some((entry) => tailcatServerKey(entry) === serverKey);
  // The record that paired through this very key first; one that only has it on its list after.
  return (
    candidates.find((machine) => {
      const token = tokenOf(machine.id);
      return token !== null && names([token]);
    }) ??
    candidates.find((machine) => names(addressesOf(machine.id))) ??
    null
  );
}

/**
 * The saved record a pairing that was just approved belongs to, so that record is paired again (or,
 * for an existing Tailscale/SSH record, gains Easy Connect as its fallback route) instead of a
 * second record being added; null when the computer is new to this phone.
 *
 * `scanned` is the address the code carried and `answered` the addresses the computer named in its
 * pairing answer. A record is that computer when
 * - it has proven the scanned address's key itself (it paired with it or connected through it), or
 * - its own list names the scanned address (a computer on 11.3.1 names its pairing door there)
 *   AND the computer that just answered names an address whose key the record has proven.
 * Both halves of the second rule are needed: a record that only lists another computer's door, or
 * a computer that only names another record's address in its answer, is one claim against none,
 * and pairing it "again" would hand one computer's saved record to another.
 */
export function machineToPairAgain(
  machines: readonly MachineRecord[],
  tokenOf: (machineId: string) => string | null,
  provenOf: (machineId: string) => readonly string[],
  listedBy: (machineId: string) => readonly string[],
  scanned: string,
  answered: readonly string[],
): MachineRecord | null {
  const scannedKey = tailcatServerKey(scanned);
  if (scannedKey === null) return null;
  // Prefer a matching Tailscale/SSH record over a tailcat record so scanning adds/updates its fallback
  // route rather than keeping a duplicate tailcat entry.
  const candidates = [
    ...machines.filter((machine) => machine.transport !== 'tailcat' && machine.transport !== 'demo'),
    ...machines.filter((machine) => machine.transport === 'tailcat'),
  ];
  const provenKeys = (machine: MachineRecord): string[] => {
    const token = machine.transport === 'tailcat' ? tokenOf(machine.id) : null;
    const pairedKey = token === null ? null : tailcatServerKey(token);
    return [...(pairedKey === null ? [] : [pairedKey]), ...provenOf(machine.id)];
  };
  const answeredKeys = new Set(answered.map((address) => tailcatServerKey(address)));
  return (
    candidates.find((machine) => provenKeys(machine).includes(scannedKey)) ??
    candidates.find(
      (machine) =>
        listedBy(machine.id).some((address) => tailcatServerKey(address) === scannedKey) &&
        provenKeys(machine).some((key) => answeredKeys.has(key)),
    ) ??
    null
  );
}

/**
 * The merge to act on now that `machineId` has shown which computer it reaches:
 * - When `machineId` is the survivor of its group, returns that merge.
 * - When `machineId` is a `tailcat` duplicate of an SSH/Tailscale survivor, returns that merge too
 *   so connecting over Easy Connect still hides the duplicate and keeps the Tailscale/SSH entry.
 * - When `machineId` is a non-survivor in a `tailcat`-only group, returns null (nothing is certain yet).
 */
export function duplicateMergeFor(
  machines: readonly MachineRecord[],
  tokenOf: (machineId: string) => string | null,
  provenOf: (machineId: string) => readonly string[],
  machineId: string,
  connectedAtOf: (machineId: string) => number | null = () => null,
): MachineMerge | null {
  const { merges } = dedupeMachineRecords(machines, tokenOf, provenOf, connectedAtOf);
  const bySurvivor = merges.find((entry) => entry.survivorId === machineId);
  if (bySurvivor !== undefined) return bySurvivor;
  const byStale = merges.find((entry) => entry.staleIds.includes(machineId));
  if (byStale === undefined) return null;
  const survivor = machines.find((machine) => machine.id === byStale.survivorId);
  return survivor !== undefined && survivor.transport !== 'tailcat' ? byStale : null;
}

/**
 * The records to stop using now that `machineId` has shown which computer it reaches: the others
 * in its group (`dedupeMachineRecords`), when `machineId` is the one that group keeps. Empty when
 * it has no duplicate, or when the group would keep another record (then nothing is certain yet).
 */
export function staleDuplicatesOf(
  machines: readonly MachineRecord[],
  tokenOf: (machineId: string) => string | null,
  provenOf: (machineId: string) => readonly string[],
  machineId: string,
  connectedAtOf: (machineId: string) => number | null = () => null,
): string[] {
  const merge = dedupeMachineRecords(machines, tokenOf, provenOf, connectedAtOf).merges.find(
    (entry) => entry.survivorId === machineId,
  );
  return merge?.staleIds ?? [];
}
