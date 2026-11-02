/**
 * Opens Drafts when a new session lands there, in the Project list (its project and its Drafts
 * heading) and in the Unified list (the Drafts shelf). A session the phone opens itself is shown
 * full screen, so there is no row to scroll to.
 *
 * CDXC:Drafts 2026-11-02 SEE-ALSO:
 * packages/gx-core/src/sidebar_view/draft_arrivals.rs holds the user's decision and the desktop's
 * half (which also scrolls the open session's row into view); contract/draftArrivals.ts mirrors
 * its rule.
 */

import { useEffect, useRef } from 'react';

import { DraftArrivals, type DraftRow } from '../../contract/draftArrivals';
import { projectKeyForSession, sessionKindSection } from '../../contract/grouping';
import type { UnifiedRow } from '../../contract/unified/build';
import type { MachineInventory } from '../../inventory/store';
import { useUnifiedListStore } from '../../screens/sessions-screen/unified-list-store';
import { useCollapseStore } from './collapseStore';

function createdMs(createdAt: string): number | null {
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? null : parsed;
}

/** The Project list: one tracker per computer, reset while the Unified list is shown. */
export function useOpenProjectDraftsOnArrival(
  inventoriesByMachineId: Record<string, MachineInventory>,
  enabled: boolean,
): void {
  const trackers = useRef(new Map<string, DraftArrivals>());
  useEffect(() => {
    if (!enabled) {
      trackers.current.clear();
      return;
    }
    const nowMs = Date.now();
    for (const [machineId, inventory] of Object.entries(inventoriesByMachineId)) {
      const sessions = inventory.summary?.sessions;
      if (sessions === undefined) continue;
      const drafts: DraftRow[] = sessions
        .filter((session) => sessionKindSection(session, nowMs) === 'drafts')
        .map((session) => ({
          id: session.sessionId,
          collapseKey: projectKeyForSession(session),
          createdMs: createdMs(session.createdAt),
        }));
      let tracker = trackers.current.get(machineId);
      if (tracker === undefined) {
        tracker = new DraftArrivals();
        trackers.current.set(machineId, tracker);
      }
      for (const arrival of tracker.observe(drafts, nowMs)) {
        useCollapseStore.getState().openDrafts(machineId, arrival.collapseKey);
      }
    }
  }, [inventoriesByMachineId, enabled]);
}

/** The Unified list's Drafts shelf. */
export function useOpenUnifiedDraftsOnArrival(drafts: readonly UnifiedRow[], enabled: boolean): void {
  const tracker = useRef(new DraftArrivals());
  useEffect(() => {
    if (!enabled) {
      tracker.current.reset();
      return;
    }
    const rows: DraftRow[] = drafts.map((row) => ({
      id: row.id,
      collapseKey: '',
      createdMs: row.session.createdMs,
    }));
    if (tracker.current.observe(rows, Date.now()).length > 0) useUnifiedListStore.getState().openDrafts();
  }, [drafts, enabled]);
}
