/**
 * The project file browser's folder tree: gxserver lists one folder's children
 * at a time in the project scope (every file type, its skip list applied: `.git`, `node_modules`, build
 * output), and the browser shows the top level plus the children of every folder that is open, hidden names
 * left out while the hidden-files switch is off.
 *
 * CDXC:Docs 2026-10-29 SEE-ALSO: the desktop files list loads its tree the same way, one folder when it is
 * opened (`native_docs_list_folder` in apps/desktop/src/app/native_docs/files.rs, CDXC:Docs 2026-09-27).
 */

import { DocsCopy } from '../copy';
import { entryTimestamp, parseDocsEntries, type DocsEntry } from '../docs/entries';
import { projectScopeAction, type DocsRpc } from './request';

/** A file as a browser row shows and opens it. */
export type BrowserFile = {
  path: string;
  name: string;
  /** What the user is shown as its path (the mounted Docs directory by its own name). */
  displayPath: string;
  size: number | null;
  modifiedAt: number | null;
};

export type BrowserFolder = { path: string; name: string; displayPath: string };

export type TreeRow =
  | {
      kind: 'folder';
      key: string;
      folder: BrowserFolder;
      depth: number;
      expanded: boolean;
      loading: boolean;
      error: string | null;
    }
  | { kind: 'file'; key: string; file: BrowserFile; depth: number };

/** What the browser knows of one folder: its children once listed, and how its last listing went. */
export type FolderState = { entries: readonly DocsEntry[] | null; loading: boolean; error: string | null };

/** A folder's children as gxserver listed them, or null when they did not change since `revision`. */
export type FolderListing = { entries: DocsEntry[]; revision: string | null } | null;

/**
 * Lists one folder of the project (`''`: its top level) with `scope: "project"` and `action: "list"`. `force` drops
 * gxserver's short-lived listing cache first, for Refresh. A Ghostex from before the whole-project listing answers
 * with its Docs list instead (no `progressive`), which is refused with the update hint rather than drawn as a tree it
 * is not.
 */
export async function listProjectFolder(
  rpc: DocsRpc,
  projectId: string,
  path: string,
  options: { revision: string | null; force: boolean },
): Promise<FolderListing> {
  const result = await projectScopeAction(rpc, projectId, 'list', {
    path,
    ...(options.revision !== null ? { revision: options.revision } : {}),
    ...(options.force ? { force: true } : {}),
  });
  if (result.progressive !== true) throw new Error(DocsCopy.oldCli);
  if (result.unchanged === true) return null;
  return {
    entries: parseDocsEntries(result.entries),
    revision: typeof result.revision === 'string' ? result.revision : null,
  };
}

/** A hidden file or folder: its name starts with a dot. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

/** Whether a shown path (`displayPath`) names a hidden file or lies inside a hidden folder. */
export function isHiddenPath(displayPath: string): boolean {
  return displayPath.split('/').some(isHiddenName);
}

export function browserFile(entry: DocsEntry): BrowserFile {
  return {
    path: entry.path,
    name: entry.name,
    displayPath: entry.displayPath ?? entry.path,
    size: entry.size,
    modifiedAt: entryTimestamp(entry.modifiedAt),
  };
}

/**
 * The tree's rows: the project's top level and, one level deeper each, the children of every open folder
 * (closing a folder's row goes back to its parent). While `showHidden` is off a hidden name is not listed, nor
 * anything under it.
 */
export function treeRows(
  folders: ReadonlyMap<string, FolderState>,
  expanded: ReadonlySet<string>,
  showHidden: boolean,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (path: string, depth: number) => {
    for (const entry of folders.get(path)?.entries ?? []) {
      if (!showHidden && isHiddenName(entry.name)) continue;
      if (entry.kind === 'file') {
        rows.push({ kind: 'file', key: `file:${entry.path}`, file: browserFile(entry), depth });
        continue;
      }
      const state = folders.get(entry.path);
      const open = expanded.has(entry.path);
      rows.push({
        kind: 'folder',
        key: `folder:${entry.path}`,
        folder: { path: entry.path, name: entry.name, displayPath: entry.displayPath ?? entry.path },
        depth,
        expanded: open,
        loading: state?.loading ?? false,
        error: state?.error ?? null,
      });
      if (open) walk(entry.path, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}
