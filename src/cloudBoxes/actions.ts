/**
 * What the box pill's long press and a box row's menu run: Stop, Delete, Pull branch, Open PR.
 * Each goes to the box's computer (`/api/cloudBoxes`), which owns the registry; Stop and Delete go
 * to the provider with the phone's cloud kit while that computer is off (Q1033 D7: "start chat wake
 * stop" with the computer off, delete included). Pull branch needs the computer, since it makes a
 * worktree there.
 */

import { Linking } from 'react-native';

import { homeCloudBoxesRpc, forgetBoxLink } from './boxLink';
import { boxBranch, openPrUrl } from './chip';
import { useCloudBoxesStore, type CloudBoxEntry } from './store';
import { cloudBoxMachineId, type CloudBox } from './types';

/** How a box action ended, in one sentence for the status line; `unpushed` asks for Delete anyway. */
export type BoxActionOutcome = { ok: true; message: string } | { ok: false; message: string; unpushed?: true };

/** The provider route for a computer that is off (./phoneStart.ts registers it). */
export type ProviderBoxOps = {
  stop(entry: CloudBoxEntry): Promise<CloudBox | string>;
  delete(entry: CloudBoxEntry): Promise<CloudBox | string>;
};
let providerOps: ProviderBoxOps | null = null;

export function setProviderBoxOps(ops: ProviderBoxOps): void {
  providerOps = ops;
}

async function onHome(
  entry: CloudBoxEntry,
  action: 'stop' | 'delete',
  params: Record<string, unknown>,
): Promise<{ box: CloudBox } | { error: string; code: string | null }> {
  // A box the phone started itself is not in its computer's registry until the computer adopts it
  // from the provider's list, so the provider is asked directly meanwhile.
  if (entry.source === 'provider' && providerOps !== null) {
    const row = await providerOps[action](entry);
    return typeof row === 'string' ? { error: row, code: null } : { box: row };
  }
  const answer = await homeCloudBoxesRpc(entry.homeMachineId, action, { boxId: entry.box.boxId, ...params }, 120_000);
  if (answer.error === null) {
    const box = (answer.result as { box?: CloudBox } | null)?.box;
    return { box: box ?? entry.box };
  }
  if (answer.error.code === 'unreachable' && providerOps !== null) {
    const row = await providerOps[action](entry);
    return typeof row === 'string' ? { error: row, code: null } : { box: row };
  }
  return { error: answer.error.message, code: answer.error.code ?? null };
}

export async function stopBox(entry: CloudBoxEntry): Promise<BoxActionOutcome> {
  const done = await onHome(entry, 'stop', {});
  if ('error' in done) return { ok: false, message: `Couldn't stop ${entry.box.name}: ${done.error}` };
  useCloudBoxesStore.getState().putBox(entry.homeMachineId, done.box, entry.source);
  return { ok: true, message: `Stopped ${entry.box.name}. Sending a message wakes it.` };
}

/**
 * CDXC:CloudBoxes 2026-11-02 DECISION: User (Q1039 D13 "keep and say"): a box with uncommitted or
 * unpushed work is kept; Delete then says so and offers "Delete anyway" (`force`).
 */
export async function deleteBox(entry: CloudBoxEntry, force = false): Promise<BoxActionOutcome> {
  const done = await onHome(entry, 'delete', force ? { force: true } : {});
  if ('error' in done) {
    if (done.code === 'cloudBoxHasUnpushedWork') {
      return { ok: false, unpushed: true, message: `${entry.box.name} has unpushed work: push it, or delete anyway.` };
    }
    return { ok: false, message: `Couldn't delete ${entry.box.name}: ${done.error}` };
  }
  if (done.box.state === 'deleted' || done.box.state === 'deleting') {
    useCloudBoxesStore.getState().dropBox(entry.box.boxId);
    void forgetBoxLink(cloudBoxMachineId(entry.box.boxId));
  } else {
    useCloudBoxesStore.getState().putBox(entry.homeMachineId, done.box, entry.source);
  }
  return { ok: true, message: `Deleting ${entry.box.name}.` };
}

/** Pull branch (Q1014): the box session's pushed branch into a worktree of its project on the computer. */
export async function pullBoxBranch(entry: CloudBoxEntry, sessionId: string | null): Promise<BoxActionOutcome> {
  const answer = await homeCloudBoxesRpc(
    entry.homeMachineId,
    'pullBranch',
    { boxId: entry.box.boxId, ...(sessionId === null ? {} : { sessionId }) },
    300_000,
  );
  if (answer.error !== null) {
    return {
      ok: false,
      message:
        answer.error.code === 'unreachable'
          ? 'Pull branch needs your computer: it makes a worktree there.'
          : `Couldn't pull the branch: ${answer.error.message}`,
    };
  }
  const result = answer.result as { branch?: string; path?: string } | null;
  return { ok: true, message: `Pulled ${result?.branch ?? 'the branch'} into ${result?.path ?? 'a worktree'} on your computer.` };
}

/** Open PR: GitHub's compare page for the session's branch, in the browser. */
export async function openBoxPullRequest(entry: CloudBoxEntry, sessionId: string | null): Promise<BoxActionOutcome> {
  const branch = boxBranch(entry.box, sessionId);
  const url = openPrUrl(entry.box, branch);
  if (url === null) {
    return {
      ok: false,
      message:
        branch === null
          ? 'This box has no branch yet.'
          : `Open PR needs a GitHub repository: push ${branch} and open the pull request on your Git host.`,
    };
  }
  await Linking.openURL(url);
  return { ok: true, message: `Opened the pull request page for ${branch}.` };
}
