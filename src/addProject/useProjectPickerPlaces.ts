/**
 * Add Project places and suggested repositories state for one machine.
 *
 * Keeps a short-lived in-memory cache per machine so moving from the source
 * screen into Local folder or Clone destination shows places immediately
 * without a duplicate scan. Invalidated whenever a project is added or cloned.
 *
 * Older computers return `null` from `fetchProjectPickerPlaces` with no error
 * so callers simply omit the Suggested and Places UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MachineConnectionTarget } from '../machines/credentials';
import { fetchProjectPickerPlaces, type AddProjectPlaces } from './client';
import { expandHomePrefix, remotePathIdentity } from './paths';

const PLACES_CACHE_TTL_MS = 30_000;

type CacheEntry = {
  places: AddProjectPlaces | null;
  fetchedAt: number;
};

const placesCache = new Map<string, CacheEntry>();

export function invalidateProjectPickerPlacesCache(machineId: string): void {
  placesCache.delete(machineId);
}

function readCachedPlaces(machineId: string | null): CacheEntry | null {
  if (machineId === null) return null;
  const entry = placesCache.get(machineId);
  if (entry === undefined) return null;
  if (Date.now() - entry.fetchedAt > PLACES_CACHE_TTL_MS) {
    placesCache.delete(machineId);
    return null;
  }
  return entry;
}

export type ProjectPickerPlacesState = {
  places: AddProjectPlaces | null;
  pending: boolean;
  pinningPath: string | null;
  pinError: string | null;
  isPinned: (folderPath: string) => boolean;
  togglePin: (folderPath: string) => Promise<void>;
  refresh: () => void;
};

export function useProjectPickerPlaces(machine: MachineConnectionTarget | null): ProjectPickerPlacesState {
  const machineId = machine?.id ?? null;
  const cached = readCachedPlaces(machineId);

  const [places, setPlaces] = useState<AddProjectPlaces | null>(cached?.places ?? null);
  const [pending, setPending] = useState<boolean>(machine !== null && cached === null);
  const [pinningPath, setPinningPath] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const placesRef = useRef<AddProjectPlaces | null>(places);
  placesRef.current = places;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    (forceRefresh: boolean): void => {
      if (machine === null || machineId === null) {
        setPlaces(null);
        setPending(false);
        return;
      }
      if (!forceRefresh) {
        const hit = readCachedPlaces(machineId);
        if (hit !== null) {
          setPlaces(hit.places);
          setPending(false);
          return;
        }
      }
      const requestId = ++requestRef.current;
      setPending(true);
      void (async () => {
        try {
          const result = await fetchProjectPickerPlaces(machine, forceRefresh ? { refresh: true } : undefined);
          if (!mountedRef.current || requestRef.current !== requestId) return;
          placesCache.set(machineId, { places: result, fetchedAt: Date.now() });
          setPlaces(result);
          setPending(false);
        } catch {
          if (!mountedRef.current || requestRef.current !== requestId) return;
          setPending(false);
        }
      })();
    },
    // Keyed on machineId so fresh store references do not retrigger fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [machineId],
  );

  useEffect(() => {
    setPinError(null);
    setPinningPath(null);
    load(false);
  }, [load]);

  const isPinned = useCallback((folderPath: string): boolean => {
    const current = placesRef.current;
    if (current === null) return false;
    const expanded = expandHomePrefix(folderPath, current.home);
    const target = remotePathIdentity(expanded);
    if (target.length === 0) return false;
    return current.pinned.some((item) => remotePathIdentity(item.path) === target);
  }, []);

  const togglePin = useCallback(
    async (folderPath: string): Promise<void> => {
      const current = placesRef.current;
      if (machine === null || machineId === null || current === null || pinningPath !== null) return;
      const expanded = expandHomePrefix(folderPath, current.home);
      const alreadyPinned = isPinned(expanded);
      setPinningPath(expanded);
      setPinError(null);
      try {
        const updated = await fetchProjectPickerPlaces(machine, {
          ...(alreadyPinned ? { unpin: expanded } : { pin: expanded }),
          defaultProjectsFolder: current.defaultProjectsFolder ?? null,
        });
        if (!mountedRef.current) return;
        if (updated !== null) {
          placesCache.set(machineId, { places: updated, fetchedAt: Date.now() });
          setPlaces(updated);
        }
      } catch (failure) {
        if (!mountedRef.current) return;
        setPinError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (mountedRef.current) setPinningPath(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPinned, machineId, pinningPath],
  );

  const refresh = useCallback(() => {
    if (machineId !== null) placesCache.delete(machineId);
    load(true);
  }, [load, machineId]);

  return {
    places,
    pending,
    pinningPath,
    pinError,
    isPinned,
    togglePin,
    refresh,
  };
}
