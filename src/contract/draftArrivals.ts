/**
 * Which sessions just arrived in Drafts, so the list opens Drafts for them.
 *
 * CDXC:Drafts 2026-11-02 SEE-ALSO:
 * packages/gx-core/src/sidebar_view/draft_arrivals.rs owns the rule (a draft the previous list lacked, created in the last two minutes and after the first list was seen; the first list after launch is only recorded) and the user's decision; keep this mirror aligned.
 */

export const DRAFT_ARRIVAL_WINDOW_MS = 2 * 60 * 1_000;
/** How much older than the first list a draft may be and still count (computer and phone clocks differ). */
export const DRAFT_CLOCK_SLACK_MS = 5_000;

export type DraftRow = {
  id: string;
  /** Where the row's Drafts heading is kept open: the Project list's `<projectKey>|drafts`, or empty for the Unified shelf. */
  collapseKey: string;
  createdMs: number | null;
};

export class DraftArrivals {
  private known: Set<string> | null = null;
  private startedMs = 0;

  /** Reads the drafts of the list as it stands now and returns those that just arrived. */
  observe(drafts: readonly DraftRow[], nowMs: number): DraftRow[] {
    const previous = this.known;
    this.known = new Set(drafts.map((draft) => draft.id));
    if (previous === null) {
      this.startedMs = nowMs;
      return [];
    }
    return drafts.filter(
      (draft) =>
        !previous.has(draft.id) &&
        draft.createdMs !== null &&
        draft.createdMs + DRAFT_ARRIVAL_WINDOW_MS > nowMs &&
        draft.createdMs + DRAFT_CLOCK_SLACK_MS >= this.startedMs,
    );
  }

  /** Forgets the list, so the next one is only recorded. */
  reset(): void {
    this.known = null;
  }
}
