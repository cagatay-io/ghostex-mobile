/**
 * Directory-suggestion state for an Add Project path input.
 *
 * The fetch is keyed on the DIRECTORY portion of the query only
 * §2.4), so typing a leaf name never refetches and no debounce is needed;
 * crossing a `/` issues exactly one new request. Leaf filtering is client-side
 * and hidden folders are always excluded on mobile (spec §5.6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MachineConnectionTarget } from '../machines/credentials';
import { browseDirectories, type AddProjectBrowseEntry, type AddProjectBrowseResult } from './client';
import { getBrowseDirectoryPath, getBrowseLeafPathSegment, hasTrailingPathSeparator } from './paths';

export type DirectoryBrowseState = {
  /** Entries for the query's directory, filtered by the typed leaf segment. */
  entries: AddProjectBrowseEntry[];
  /** Raw result for the directory currently shown, null before the first load. */
  result: AddProjectBrowseResult | null;
  /** True while a request for the current directory is in flight. */
  pending: boolean;
  /** True only for the first load of a directory (spinner, not revalidation). */
  firstLoad: boolean;
  error: string | null;
  /** Entry whose name matches the typed leaf exactly (case-sensitive). */
  exactEntry: AddProjectBrowseEntry | null;
  /** Re-fetches the current directory listing (e.g., after creating a folder). */
  reload: () => void;
};

export function useDirectoryBrowse(machine: MachineConnectionTarget | null, query: string): DirectoryBrowseState {
  const directory = getBrowseDirectoryPath(query);
  const machineId = machine?.id ?? null;
  const currentKey = machineId === null || directory.length === 0 ? null : `${machineId}:${directory}`;
  const [result, setResult] = useState<AddProjectBrowseResult | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestRef = useRef(0);

  const reload = useCallback(() => {
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (machine === null || currentKey === null || directory.length === 0) {
      setResult(null);
      setLoadedKey(null);
      setPending(false);
      setError(null);
      return () => {
        requestRef.current += 1;
      };
    }
    setPending(true);
    setError(null);
    void (async () => {
      try {
        const next = await browseDirectories(machine, directory, { details: true });
        if (requestRef.current !== requestId) return;
        setResult(next);
        setLoadedKey(currentKey);
        setPending(false);
      } catch (failure) {
        if (requestRef.current !== requestId) return;
        setResult(null);
        setLoadedKey(currentKey);
        setPending(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    })();
    return () => {
      requestRef.current += 1;
    };
    // Keyed on the machine ID rather than the record: the record is looked up
    // fresh on every render, so depending on it would refetch on every keystroke.
  }, [currentKey, directory, machineId, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrent = currentKey !== null && loadedKey === currentKey;
  const currentResult = isCurrent ? result : null;

  const filter = hasTrailingPathSeparator(query) ? '' : getBrowseLeafPathSegment(query);

  const entries = useMemo(() => {
    const source = currentResult?.entries ?? [];
    const lower = filter.toLowerCase();
    const isDriveList = currentResult?.isDriveList === true;
    return source.filter((entry) => {
      if (!isDriveList && entry.name.startsWith('.')) return false;
      return entry.name.toLowerCase().startsWith(lower);
    });
  }, [currentResult, filter]);

  const exactEntry = useMemo(() => {
    if (filter.length === 0) return null;
    return entries.find((entry) => entry.name === filter) ?? null;
  }, [entries, filter]);

  return {
    entries,
    result: currentResult,
    pending,
    firstLoad: pending && !isCurrent,
    error: isCurrent ? error : null,
    exactEntry,
    reload,
  };
}
