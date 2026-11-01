/**
 * Runs the session wall's thumbnail refresh (`previews.ts`) for the Sessions screen: `visible` is the screen's part
 * (the switch offered, tiles chosen, the screen in front), the app being in the foreground is this hook's (the summary
 * poll's rule, `isForeground`). The thumbnails go to `useWallPreviewStore`, where each tile reads its own.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isForeground } from '../../inventory/summaryRefresh';
import { useMachinesStore } from '../../machines/store';
import { createPreviewScheduler, useWallPreviewStore, type PreviewScheduler, type PreviewTarget } from './previews';
import { readSessionTail } from './tailClient';

export function useWallPreviews(visible: boolean, targets: readonly PreviewTarget[]): void {
  const [foreground, setForeground] = useState(() => isForeground(AppState.currentState ?? 'active'));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(isForeground(state)));
    return () => subscription.remove();
  }, []);

  const scheduler = useRef<PreviewScheduler | null>(null);
  useEffect(() => {
    const created = createPreviewScheduler<ReturnType<typeof setInterval>>({
      read: (target) => {
        // The machine record is rebuilt on every poll, so it is looked up when the read goes out.
        const machine = useMachinesStore.getState().machines.find((entry) => entry.id === target.machineId);
        if (machine === undefined) return Promise.resolve({ kind: 'unavailable' });
        return readSessionTail(machine, target.projectId, target.sessionId);
      },
      publish: (key, preview) =>
        useWallPreviewStore.setState((state) => ({ previews: { ...state.previews, [key]: preview } })),
      timers: {
        setInterval: (run, ms) => setInterval(run, ms),
        clearInterval: (handle) => clearInterval(handle),
      },
    });
    scheduler.current = created;
    return () => {
      created.stop();
      scheduler.current = null;
    };
  }, []);

  useEffect(() => {
    scheduler.current?.update(visible && foreground, targets);
  }, [visible, foreground, targets]);
}
