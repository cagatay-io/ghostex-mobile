/**
 * Share…: the phone fetches the file from the computer with gxserver's read of one project file
 * (`readResource`, at most 12 MiB; server/src/project_docs/actions.rs, limits.rs), keeps a copy only in the app's
 * temporary storage while the iOS share sheet has it, and deletes that copy once the sheet closes, shared or
 * cancelled (data minimisation). Nothing is written to the project. One share at a time per share
 * sheet, and every screen hands its file to the app's one sheet, so one at a time for the whole app; each share
 * keeps and deletes only its own copy. Kept free of native imports so `bun test` drives it with a stand-in request
 * and share sheet; `shareSheet.ts` holds the app's.
 */

import { DocsCopy } from '../copy';
import { projectScopeAction, type DocsRpc } from './request';

/** One share's temporary copy: its address, and the deletion of this copy alone. */
export type SharedCopy = { uri: string; drop(): void };

/** The share sheet and the temporary copies it is handed: the app's (`shareSheet.ts`) or a test's. */
export type ShareSheet = {
  /** Keeps the file's bytes (base64) as a copy of its own named `name`, apart from every other share's. */
  keepCopy(name: string, base64: string): Promise<SharedCopy>;
  /** Hands the copy to the share sheet; settles once the sheet has closed. */
  open(uri: string, name: string): Promise<void>;
};

/** `busy`: another share on this sheet is still running, so this one did nothing. */
export type ShareOutcome = { shared: true } | { shared: false; message: string } | { shared: false; busy: true };

const sharing = new Set<ShareSheet>();
const sharingListeners = new Set<() => void>();

function setSharing(sheet: ShareSheet, running: boolean): void {
  if (running) sharing.add(sheet);
  else sharing.delete(sheet);
  for (const listener of sharingListeners) listener();
}

/** Whether a share on this sheet is running (its file being fetched, or the sheet open). */
export function isSharing(sheet: ShareSheet): boolean {
  return sharing.has(sheet);
}

/** Calls `listener` whenever a share starts or ends, until the returned function is called. */
export function subscribeSharing(listener: () => void): () => void {
  sharingListeners.add(listener);
  return () => {
    sharingListeners.delete(listener);
  };
}

/**
 * Asks gxserver once for the file (`path`: its path in the project), then hands a copy named as the file to the
 * share sheet. `onFetched` runs when the fetch is over, either way (the progress notice ends there). A file
 * gxserver refuses (over its read limit, unreadable, gone) reaches no share sheet and answers gxserver's message.
 * While another share on the same sheet runs, it does nothing and answers `busy`.
 */
export async function shareProjectFile(
  rpc: DocsRpc,
  projectId: string,
  file: { path: string; name: string },
  sheet: ShareSheet,
  onFetched: () => void,
): Promise<ShareOutcome> {
  if (sharing.has(sheet)) return { shared: false, busy: true };
  setSharing(sheet, true);
  try {
    let data: unknown;
    try {
      data = (await projectScopeAction(rpc, projectId, 'readResource', { path: file.path })).dataBase64;
    } catch (failure) {
      return { shared: false, message: failure instanceof Error ? failure.message : String(failure) };
    } finally {
      onFetched();
    }
    if (typeof data !== 'string') return { shared: false, message: DocsCopy.shareNoData };
    // The name comes from the computer: one that would leave the copy's folder is never used as a file name.
    const name = /^\.{0,2}$|[/\\\u0000]/u.test(file.name) ? DocsCopy.shareFallbackName : file.name;
    let copy: SharedCopy | null = null;
    try {
      copy = await sheet.keepCopy(name, data);
      await sheet.open(copy.uri, name);
      return { shared: true };
    } catch (failure) {
      return { shared: false, message: failure instanceof Error ? failure.message : String(failure) };
    } finally {
      copy?.drop();
    }
  } finally {
    setSharing(sheet, false);
  }
}
