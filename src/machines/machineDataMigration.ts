/**
 * Moves everything the phone saved under a dropped machine id to the machine
 * kept in its place (see `dedupeMachineRecords`).
 *
 * Per-machine data is spread over many AsyncStorage entries: the selected
 * workspace and Web Preview port per machine, the drawer's open folders, the
 * terminal tabs' font sizes and view modes (`<machineId>:<sessionId>`), the
 * chat core's drafts and retained transcripts (`remote-<machineId>:…`) and more.
 * Rather than teach every store a migration, this rewrites the id wherever it
 * appears, in key names and inside values. Machine ids are random UUIDs, so a
 * textual match cannot hit anything else. Where the kept machine already has
 * its own entry, that entry wins and the dropped machine's copy is discarded.
 *
 * The planner is pure (`bun test` runs it); `migrateMachineData` applies it.
 */

export type IdRenames = ReadonlyMap<string, string>;

function renameText(text: string, renames: IdRenames): string {
  let next = text;
  for (const [from, to] of renames) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

function mentionsAny(text: string, renames: IdRenames): boolean {
  for (const from of renames.keys()) if (text.includes(from)) return true;
  return false;
}

function renameJson(value: unknown, renames: IdRenames): unknown {
  if (typeof value === 'string') return renameText(value, renames);
  if (Array.isArray(value)) return value.map((item) => renameJson(item, renames));
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  // Entries already under their final key go first, so the kept machine's own entry wins.
  for (const [key, item] of entries) {
    if (!mentionsAny(key, renames)) result[key] = renameJson(item, renames);
  }
  for (const [key, item] of entries) {
    if (!mentionsAny(key, renames)) continue;
    const renamed = renameText(key, renames);
    if (!(renamed in result)) result[renamed] = renameJson(item, renames);
  }
  return result;
}

/** A stored value with every renamed id rewritten; JSON stays JSON, anything else is plain text. */
export function migrateStoredValue(raw: string, renames: IdRenames): string {
  if (!mentionsAny(raw, renames)) return raw;
  try {
    return JSON.stringify(renameJson(JSON.parse(raw) as unknown, renames));
  } catch {
    return renameText(raw, renames);
  }
}

export type StoragePlan = {
  /** Entries to write (new keys, and rewritten values under unchanged keys). */
  set: [string, string][];
  /** Keys to delete: the dropped machine's entries that moved or lost to the kept machine's own. */
  remove: string[];
};

/**
 * What to change in storage given every `[key, value]` row. `skipKeys` are left
 * untouched (the machine list, which the caller writes itself).
 */
export function planStorageMigration(
  rows: readonly (readonly [string, string | null])[],
  renames: IdRenames,
  skipKeys: ReadonlySet<string> = new Set(),
): StoragePlan {
  const plan: StoragePlan = { set: [], remove: [] };
  if (renames.size === 0) return plan;
  const existing = new Set(rows.map(([key]) => key));
  for (const [key, raw] of rows) {
    if (skipKeys.has(key) || raw === null) continue;
    const nextKey = renameText(key, renames);
    const nextValue = migrateStoredValue(raw, renames);
    if (nextKey === key) {
      if (nextValue !== raw) plan.set.push([key, nextValue]);
      continue;
    }
    plan.remove.push(key);
    if (!existing.has(nextKey)) plan.set.push([nextKey, nextValue]);
  }
  return plan;
}

type MigrationStorage = {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
};

/** Rewrites storage so each dropped machine id reads as the id kept in its place. */
export async function migrateMachineData(
  storage: MigrationStorage,
  renames: IdRenames,
  skipKeys: ReadonlySet<string>,
): Promise<void> {
  if (renames.size === 0) return;
  const keys = await storage.getAllKeys();
  const rows = await storage.multiGet(keys);
  const plan = planStorageMigration(rows, renames, skipKeys);
  if (plan.set.length > 0) await storage.multiSet(plan.set);
  if (plan.remove.length > 0) await storage.multiRemove(plan.remove);
}
