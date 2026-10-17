/**
 * The working card's height (`cards/WorkingCard.tsx`), which the transcript keeps free below its
 * newest row so the card, drawn over the transcript's bottom edge, covers nothing while the reader
 * is at the bottom (desktop: the last row's reserve in `working_card.rs`).
 */

import { create } from 'zustand';

type WorkingLane = {
  /** The card's height, 0 when no card shows. */
  height: number;
};

export const useWorkingLaneStore = create<WorkingLane>(() => ({ height: 0 }));
