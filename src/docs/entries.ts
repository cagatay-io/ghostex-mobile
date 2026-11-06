/**
 * One row of gxserver's file listings (`file_entry` in server/src/project_docs): the Docs `list` answer
 * (`client.ts`) and the whole-project listing and search of the project file browser (`src/files/`) send the
 * same shape. Kept free of native imports so `bun test` can read it.
 */

export type DocsEntry = {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  depth: number;
  modifiedAt: string | null;
  size: number | null;
  /** Set on entries of the mounted Docs directory: what the tree calls them. */
  displayPath?: string;
};

/** The first path segment gxserver reserves for the mounted Docs directory. */
export const DOCS_MOUNT_SEGMENT = '.ghostex-docs-root';

/** A JSON object, as an answer's fields are read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One listing row, or null for anything that is not one. */
export function parseDocsEntry(value: unknown): DocsEntry | null {
  if (!isRecord(value)) return null;
  const path = typeof value.path === 'string' ? value.path : '';
  const kind = value.kind === 'directory' ? 'directory' : value.kind === 'file' ? 'file' : null;
  if (path.length === 0 || kind === null) return null;
  return {
    path,
    name: typeof value.name === 'string' && value.name.length > 0 ? value.name : path,
    kind,
    depth: typeof value.depth === 'number' ? value.depth : 0,
    modifiedAt: typeof value.modifiedAt === 'string' ? value.modifiedAt : null,
    size: typeof value.size === 'number' ? value.size : null,
    ...(typeof value.displayPath === 'string' ? { displayPath: value.displayPath } : {}),
  };
}

/** The rows of a listing answer's `entries`, unreadable ones left out. */
export function parseDocsEntries(value: unknown): DocsEntry[] {
  return Array.isArray(value) ? value.map(parseDocsEntry).filter((entry): entry is DocsEntry => entry !== null) : [];
}

/** An entry's `modifiedAt` (RFC 3339) in milliseconds, or null when it has none or it cannot be read. */
export function entryTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
