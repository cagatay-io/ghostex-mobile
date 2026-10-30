/**
 * The project file browser's folder tree as it loads (REQ-FILES-001): the top level when the browser opens, a
 * folder's children when it is first opened, and on Refresh the top level and every open folder again. Each
 * folder remembers gxserver's revision of its children, so a refresh that finds nothing new sends nothing back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DocsEntry } from '../docs/entries';
import { listProjectFolder, type FolderState } from './list';
import type { DocsRpc } from './request';

export type ProjectTree = {
  folders: ReadonlyMap<string, FolderState>;
  expanded: ReadonlySet<string>;
  /** Opens a closed folder (listing it the first time, or again after it failed) or closes an open one. */
  toggleFolder: (path: string) => void;
  /** Lists the top level and every open folder again, past gxserver's short-lived listing cache. */
  refresh: () => void;
};

const NOT_LISTED: FolderState = { entries: null, loading: false, error: null };

function withFolder(
  folders: ReadonlyMap<string, FolderState>,
  path: string,
  change: Partial<FolderState>,
): ReadonlyMap<string, FolderState> {
  const next = new Map(folders);
  next.set(path, { ...(folders.get(path) ?? NOT_LISTED), ...change });
  return next;
}

/** `cachedRoot`: the top level as last listed for this project, shown at once while it is listed again. */
export function useProjectTree(rpc: DocsRpc, projectId: string, cachedRoot: readonly DocsEntry[] | null): ProjectTree {
  const [folders, setFolders] = useState<ReadonlyMap<string, FolderState>>(() =>
    cachedRoot === null ? new Map() : new Map([['', { ...NOT_LISTED, entries: cachedRoot }]]),
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Read by requests and answers only, never while rendering.
  const revisions = useRef(new Map<string, string>());
  // Answers for an earlier project, or arriving after the screen closed, are dropped.
  const generation = useRef(0);

  const listFolder = useCallback(
    (path: string, force: boolean) => {
      const mine = generation.current;
      setFolders((current) => withFolder(current, path, { loading: true, error: null }));
      listProjectFolder(rpc, projectId, path, { revision: revisions.current.get(path) ?? null, force }).then(
        (listing) => {
          if (mine !== generation.current) return;
          if (listing === null) {
            setFolders((current) => withFolder(current, path, { loading: false }));
            return;
          }
          if (listing.revision !== null) revisions.current.set(path, listing.revision);
          setFolders((current) => withFolder(current, path, { entries: listing.entries, loading: false }));
        },
        (failure: unknown) => {
          if (mine !== generation.current) return;
          const error = failure instanceof Error ? failure.message : String(failure);
          setFolders((current) => withFolder(current, path, { loading: false, error }));
        },
      );
    },
    [projectId, rpc],
  );

  useEffect(() => {
    listFolder('', false);
    return () => {
      generation.current += 1;
    };
  }, [listFolder]);

  const toggleFolder = useCallback(
    (path: string) => {
      const open = expanded.has(path);
      const next = new Set(expanded);
      if (open) next.delete(path);
      else next.add(path);
      setExpanded(next);
      const state = folders.get(path);
      if (!open && (state === undefined || (state.entries === null && !state.loading) || state.error !== null)) {
        listFolder(path, false);
      }
    },
    [expanded, folders, listFolder],
  );

  const refresh = useCallback(() => {
    listFolder('', true);
    for (const path of expanded) {
      if ((folders.get(path)?.entries ?? null) !== null) listFolder(path, true);
    }
  }, [expanded, folders, listFolder]);

  return { folders, expanded, toggleFolder, refresh };
}
