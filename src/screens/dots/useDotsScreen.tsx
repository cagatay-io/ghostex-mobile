/**
 * What every OpenDots screen starts from: its computer, the polled snapshot, and the full-page
 * message shown instead of the screen while the snapshot loads, failed, or OpenDots is off.
 */

import { useCallback, type ReactElement } from 'react';

import { useMachine, useDotsPolling, useDotsStore, useMachineDots } from '../../dots/store';
import type { DotsSnapshot } from '../../dots/types';
import type { MachineRecord } from '../../machines/store';
import { DotsButton, DotsMessage } from './kit';

export type DotsScreenState = {
  machine: MachineRecord | null;
  snapshot: DotsSnapshot | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  /** A page to show instead of the screen, or null when the snapshot is ready and OpenDots is on. */
  gate: ReactElement | null;
};

export function useDotsScreen(machineId: string, options?: { withInventory?: boolean }): DotsScreenState {
  const machine = useMachine(machineId);
  useDotsPolling(machine, options?.withInventory === true);
  const { snapshot, error, loading } = useMachineDots(machineId);
  const refresh = useCallback(() => {
    if (machine !== null) void useDotsStore.getState().refresh(machine);
  }, [machine]);

  let gate: ReactElement | null = null;
  if (machine === null) {
    gate = <DotsMessage title='This computer is no longer in your list.' />;
  } else if (snapshot === null && error !== null) {
    gate = (
      <DotsMessage title="Couldn't load OpenDots" body={error}>
        <DotsButton label='Try again' variant='primary' busy={loading} onPress={refresh} />
      </DotsMessage>
    );
  } else if (snapshot === null) {
    gate = <DotsMessage title='Loading your dots…' loading />;
  } else if (!snapshot.enabled) {
    gate = (
      <DotsMessage
        title='OpenDots is off on this computer'
        body='Turn it on in Ghostex on your computer, in Settings > Extensions.'
      >
        <DotsButton label='Check again' busy={loading} onPress={refresh} />
      </DotsMessage>
    );
  }
  return { machine, snapshot, error, loading, refresh, gate };
}
