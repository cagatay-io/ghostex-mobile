/**
 * The divider between two panes: its position is the first slot's share of the pane container. A manual drag without
 * the keyboard keeps each pane between a quarter and three quarters of the container; the stored layout carries the
 * same bound, so a stored position is always one a drag could have set.
 */

export const MIN_DIVIDER_RATIO = 0.25;
export const MAX_DIVIDER_RATIO = 0.75;
/** Where a new pair of panes splits the container. */
export const DEFAULT_DIVIDER_RATIO = 0.5;

export function clampDividerRatio(ratio: number): number {
  return Math.min(MAX_DIVIDER_RATIO, Math.max(MIN_DIVIDER_RATIO, ratio));
}
