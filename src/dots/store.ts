/**
 * The OpenDots snapshot per computer. The desktop refetches on gxserver's `openDotsChanged` event
 * and every 5s while its view shows (CONTRACT.md §9); the phone has no event stream, so a focused
 * Dots screen polls every 5s and every change the phone makes refetches at once.
 */

import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { create } from 'zustand';

import { useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { fetchSnapshot } from './client';
import type { DotsSnapshot } from './types';

export const DOTS_POLL_INTERVAL_MS = 5000;

export type MachineDots = {
  snapshot: DotsSnapshot | null;
  /** The last refresh's failure, null when it worked. */
  error: string | null;
  loading: boolean;
};

const EMPTY_MACHINE_DOTS: MachineDots = { snapshot: null, error: null, loading: false };

type DotsState = {
  byMachine: Record<string, MachineDots>;
  refresh: (machine: MachineRecord) => Promise<void>;
  /** Apply a local change at once (the next refresh replaces it with gxserver's truth). */
  patchSnapshot: (machineId: string, patch: (snapshot: DotsSnapshot) => DotsSnapshot) => void;
};

const inFlight = new Map<string, Promise<void>>();

export const useDotsStore = create<DotsState>()((set, get) => {
  const patchMachine = (machineId: string, patch: Partial<MachineDots>): void => {
    const current = get().byMachine[machineId] ?? EMPTY_MACHINE_DOTS;
    set({ byMachine: { ...get().byMachine, [machineId]: { ...current, ...patch } } });
  };
  return {
    byMachine: {},
    refresh: (machine) => {
      const existing = inFlight.get(machine.id);
      if (existing !== undefined) return existing;
      patchMachine(machine.id, { loading: true });
      const request = fetchSnapshot(machine)
        .then((snapshot) => patchMachine(machine.id, { snapshot, error: null, loading: false }))
        .catch((error: unknown) =>
          patchMachine(machine.id, { error: error instanceof Error ? error.message : String(error), loading: false })
        )
        .finally(() => inFlight.delete(machine.id));
      inFlight.set(machine.id, request);
      return request;
    },
    patchSnapshot: (machineId, patch) => {
      const current = get().byMachine[machineId];
      if (current?.snapshot == null) return;
      patchMachine(machineId, { snapshot: patch(current.snapshot) });
    },
  };
});

export function useMachineDots(machineId: string): MachineDots {
  return useDotsStore((state) => state.byMachine[machineId] ?? EMPTY_MACHINE_DOTS);
}

export function useMachine(machineId: string): MachineRecord | null {
  return useMachinesStore((state) => state.machines.find((machine) => machine.id === machineId) ?? null);
}

/**
 * Refresh at once and every 5s while the calling screen is focused and the app is in front.
 * `withInventory` also refreshes the computer's session list, which only polls on its own while
 * the Sessions screen is in front, for screens that list a dot's chats.
 */
export function useDotsPolling(machine: MachineRecord | null, withInventory = false): void {
  useFocusEffect(
    useCallback(() => {
      if (machine === null) return undefined;
      const refresh = (): void => {
        if (AppState.currentState !== 'active') return;
        void useDotsStore.getState().refresh(machine);
        if (withInventory) void useInventoryStore.getState().refreshMachine(machine);
      };
      refresh();
      const timer = setInterval(refresh, DOTS_POLL_INTERVAL_MS);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [machine, withInventory])
  );
}

/**
 * Runs one OpenDots change with a pending flag and a readable error, then refetches the snapshot
 * (and, when asked, the session inventory, because dots and their chats are projects and sessions).
 */
export function useDotsAction(machine: MachineRecord | null) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T>(action: (target: MachineRecord) => Promise<T>, options?: { refreshInventory?: boolean }) => {
      if (machine === null) {
        setError('This computer is no longer in your list.');
        return undefined;
      }
      setPending(true);
      setError(null);
      try {
        const result = await action(machine);
        void useDotsStore.getState().refresh(machine);
        if (options?.refreshInventory === true) void useInventoryStore.getState().refreshMachine(machine);
        return result;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [machine]
  );
  return { run, pending, error, setError };
}
