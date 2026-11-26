/**
 * Keeps a computer's Save and its removal apart.
 *
 * CDXC:MachineCredentials 2026-11-27 WHY:
 * Security review finding 6: Remove did not wait for a Save still running, and a Save could start while
 * the removal waited on the computer, so a password or key could be written under an id whose record was
 * then deleted, and nothing removed those entries later. Now a removal marks the id first: a Save
 * started after that is refused, and the removal deletes the saved entries only once every Save
 * already writing has finished.
 */

/** How many removals are running for each computer id. */
const removing = new Map<string, number>();
const writing = new Map<string, Set<Promise<unknown>>>();

/** Whether this computer is being removed from the phone. */
export function isMachineBeingRemoved(machineId: string): boolean {
  return removing.has(machineId);
}

/**
 * Runs a Save's writes for one computer, or returns `{ ran: false }` without running them when the
 * computer is being removed.
 */
export async function runMachineWrites<T>(
  machineId: string,
  writes: () => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (removing.has(machineId)) return { ran: false };
  const running = writes();
  let set = writing.get(machineId);
  if (set === undefined) {
    set = new Set();
    writing.set(machineId, set);
  }
  set.add(running);
  try {
    return { ran: true, value: await running };
  } finally {
    set.delete(running);
    if (set.size === 0) writing.delete(machineId);
  }
}

/** Marks the computer as being removed; returns the function that ends this mark (marks nest). */
export function beginMachineRemoval(machineId: string): () => void {
  removing.set(machineId, (removing.get(machineId) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const left = (removing.get(machineId) ?? 1) - 1;
    if (left <= 0) removing.delete(machineId);
    else removing.set(machineId, left);
  };
}

/** Waits until no Save is writing for this computer. */
export async function machineWritesSettled(machineId: string): Promise<void> {
  for (;;) {
    const set = writing.get(machineId);
    if (set === undefined || set.size === 0) return;
    await Promise.allSettled([...set]);
  }
}
