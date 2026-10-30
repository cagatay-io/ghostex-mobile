/**
 * The project file browser's search (REQ-FILES-004) and its file type filter (REQ-FILES-008): gxserver searches
 * the whole project in the project scope, matching every word of the term against each path (its own rule, which
 * REQ-FILES-004 leaves to the host), optionally only files of the picked types; with types picked and nothing
 * typed it lists every file of those types, which the browser draws as a tree of the folders holding them.
 *
 * CDXC:Docs 2026-10-29 SEE-ALSO: the desktop files list's search and type filter
 * (`native_docs_schedule_search` in apps/desktop/src/app/native_docs/files.rs, `type_filter.rs`).
 */

import { parseDocsEntries, type DocsEntry } from '../docs/entries';
import { browserFile, isHiddenPath, type TreeRow } from './list';
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './preview';
import { projectScopeAction, type DocsRpc } from './request';

export type TypeFilter = 'markdown' | 'html' | 'excalidraw' | 'image' | 'video';

/** The type filter's types in its menu's order (approved mockup), each with the extensions it covers (desktop). */
export const TYPE_FILTERS: readonly { readonly id: TypeFilter; readonly extensions: readonly string[] }[] = [
  { id: 'markdown', extensions: ['md', 'mdx', 'markdown'] },
  { id: 'html', extensions: ['html', 'htm'] },
  { id: 'excalidraw', extensions: ['excalidraw'] },
  { id: 'image', extensions: IMAGE_EXTENSIONS },
  { id: 'video', extensions: VIDEO_EXTENSIONS },
];

export type SearchAnswer = {
  entries: DocsEntry[];
  /** More matched than gxserver sends back; only the best are listed. */
  truncated: boolean;
  /** The project holds more than gxserver searches (its first 200,000 files and folders). */
  incomplete: boolean;
};

/** Sends the search with `scope: "project"` and `action: "search"` for `query`, limited to `types` (REQ-FILES-004 AC1). */
export async function searchProjectFiles(
  rpc: DocsRpc,
  projectId: string,
  query: string,
  types: readonly TypeFilter[],
): Promise<SearchAnswer> {
  const extensions = TYPE_FILTERS.filter((filter) => types.includes(filter.id)).flatMap((filter) => filter.extensions);
  const result = await projectScopeAction(rpc, projectId, 'search', { query: query.trim(), extensions });
  return {
    entries: parseDocsEntries(result.entries),
    truncated: result.truncated === true,
    incomplete: result.incomplete === true,
  };
}

/**
 * The files of a search answer the browser lists: files, not the folders gxserver also finds (REQ-FILES-004,
 * approved mockup), and hidden ones only while the hidden-files switch is on (REQ-FILES-007).
 */
export function searchedFiles(entries: readonly DocsEntry[], showHidden: boolean): DocsEntry[] {
  return entries.filter(
    (entry) => entry.kind === 'file' && (showHidden || !isHiddenPath(entry.displayPath ?? entry.path)),
  );
}

/**
 * The type filter's tree, with types picked and nothing typed: each matching file inside the folders that hold
 * it, in path order, every folder open unless the user closed it (`collapsed`), as the desktop draws it.
 */
export function filteredTreeRows(files: readonly DocsEntry[], collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  // The folders of the file before, from the top; a file opens only the folders it does not share with it.
  let open: string[] = [];
  for (const entry of sorted) {
    const parts = entry.path.split('/');
    const shownPathParts = (entry.displayPath ?? entry.path).split('/');
    // The mounted Docs directory is shown by its own name; any other path is shown as it is.
    const shownParts = shownPathParts.length === parts.length ? shownPathParts : parts;
    const depth = parts.length - 1;
    let shared = 0;
    while (shared < Math.min(open.length, depth) && open[shared] === parts[shared]) shared += 1;
    open = parts.slice(0, depth);
    const closedAbove = (level: number) =>
      parts.slice(0, level).some((_, index) => collapsed.has(parts.slice(0, index + 1).join('/')));
    for (let level = shared; level < depth; level += 1) {
      if (closedAbove(level)) continue;
      const path = parts.slice(0, level + 1).join('/');
      rows.push({
        kind: 'folder',
        key: `folder:${path}`,
        folder: { path, name: shownParts[level] ?? '', displayPath: shownParts.slice(0, level + 1).join('/') },
        depth: level,
        expanded: !collapsed.has(path),
        loading: false,
        error: null,
      });
    }
    if (!closedAbove(depth)) rows.push({ kind: 'file', key: `file:${entry.path}`, file: browserFile(entry), depth });
  }
  return rows;
}
