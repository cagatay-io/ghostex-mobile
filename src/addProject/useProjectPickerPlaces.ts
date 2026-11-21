/**
 * Add Project places and suggested repositories state for one machine.
 *
 * Keeps a short-lived in-memory cache per machine so moving from the source
 * screen into Local folder or Clone destination shows places immediately
 * without a duplicate scan. Invalidated whenever a project is added or cloned.
 *
 * Older or legacy computers (`unsupported`) cache `null` for the TTL and render
 * zero errors; transient failures (`transient`, such as an unreachable link or
 * timeout) leave the cache empty so revisiting retries immediately.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MachineConnectionTarget } from '../machines/credentials';
import {
  fetchProjectPickerPlaces,
  fetchProjectPickerPlacesResult,
  type AddProjectPlaces,
} from './client';
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
  const initialCached = readCachedPlaces(machineId);

  const [places, setPlaces] = useState<AddProjectPlaces | null>(initialCached?.places ?? null);
  const [pending, setPending] = useState<boolean>(machine !== null && initialCached === null);
  const [pinningPath, setPinningPath] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const activeMachineIdRef = useRef<string | null>(machineId);
  const loadedMachineIdRef = useRef<string | null>(initialCached !== null ? machineId : null);
  const pinningRef = useRef(false);
  const placesRef = useRef<AddProjectPlaces | null>(places);

  activeMachineIdRef.current = machineId;
  placesRef.current = places;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  const load = useCallback(
    (forceRefresh: boolean): void => {
      // Always advance the generation before early returns so any prior in-flight
      // fetch for another machine cannot overwrite the newly active machine.
      const requestId = ++requestRef.current;

      if (machine === null || machineId === null) {
        loadedMachineIdRef.current = null;
        setPlaces(null);
        setPending(false);
        return;
      }
      if (!forceRefresh) {
        const hit = readCachedPlaces(machineId);
        if (hit !== null) {
          loadedMachineIdRef.current = machineId;
          setPlaces(hit.places);
          setPending(false);
          return;
        }
      }
      if (loadedMachineIdRef.current !== machineId) {
        loadedMachineIdRef.current = null;
        setPlaces(null);
      }
      setPending(true);
      void (async () => {
        try {
          const outcome = await fetchProjectPickerPlacesResult(
            machine,
            forceRefresh ? { refresh: true } : undefined,
          );
          if (
            !mountedRef.current ||
            requestRef.current !== requestId ||
            activeMachineIdRef.current !== machineId
          ) {
            return;
          }
          if (outcome.status === 'ok') {
            placesCache.set(machineId, { places: outcome.places, fetchedAt: Date.now() });
            loadedMachineIdRef.current = machineId;
            setPlaces(outcome.places);
          } else if (outcome.status === 'unsupported') {
            placesCache.set(machineId, { places: null, fetchedAt: Date.now() });
            loadedMachineIdRef.current = machineId;
            setPlaces(null);
          } else if (loadedMachineIdRef.current !== machineId) {
            // Transient failure: do not cache `null`, so a later open retries immediately.
            setPlaces(null);
          }
          setPending(false);
        } catch {
          if (
            !mountedRef.current ||
            requestRef.current !== requestId ||
            activeMachineIdRef.current !== machineId
          ) {
            return;
          }
          setPending(false);
        }
      })();
    },
    // Keyed on machineId so fresh store references do not retrigger fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [machineId],
  );

  useEffect(() => {
    pinningRef.current = false;
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
      if (machine === null || machineId === null || current === null || pinningRef.current) return;
      const targetMachineId = machineId;
      const expanded = expandHomePrefix(folderPath, current.home);
      const alreadyPinned = isPinned(expanded);
      pinningRef.current = true;
      // Bump request generation so an in-flight load cannot overwrite this mutation's answer.
      const requestId = ++requestRef.current;
      setPinningPath(expanded);
      setPinError(null);
      try {
        const updated = await fetchProjectPickerPlaces(machine, {
          ...(alreadyPinned ? { unpin: expanded } : { pin: expanded }),
          defaultProjectsFolder: current.defaultProjectsFolder ?? null,
        });
        if (
          !mountedRef.current ||
          activeMachineIdRef.current !== targetMachineId ||
          requestRef.current !== requestId
        ) {
          return;
        }
        if (updated !== null) {
          placesCache.set(targetMachineId, { places: updated, fetchedAt: Date.now() });
          loadedMachineIdRef.current = targetMachineId;
          setPlaces(updated);
        }
      } catch (failure) {
        if (!mountedRef.current || activeMachineIdRef.current !== targetMachineId) return;
        setPinError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (activeMachineIdRef.current === targetMachineId) {
          pinningRef.current = false;
          if (mountedRef.current) setPinningPath(null);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPinned, machineId],
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
