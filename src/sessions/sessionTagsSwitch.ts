/**
 * Whether a computer has Session Tags switched on: the built-in extension on its Settings > Extensions
 * (`sessionTagsEnabled`, off by default), which its session summary names in `builtInFeaturesOff` while it is off.
 * While it is off the phone shows no tag on a session's row other than Favorite, no Tag As in its menus (Add to
 * Favorites / Remove from Favorites takes its place), no tag prompt when parking, no Show only sessions tagged in
 * Sort & Filter and no Session Tags section in Settings; the tags stay saved on the computer.
 *
 * CDXC:SessionTags 2026-11-27 DECISION:
 * User: "please make tagging sessions in general an advanced feature. show it in staff picks extensions disabled by
 * default. also dont show it here by default". Read from `builtInFeaturesOff`, like Session notes
 * (`sessionNotesSwitch.ts`): a computer built before the switch existed sends no entry, and its tags keep working.
 * SEE-ALSO: packages/settings-catalog/src/data/official_extensions.rs (the `sessionTags` entry).
 */

/** Session Tags' built-in feature id, as the computer lists it. */
export const SESSION_TAGS_FEATURE = 'sessionTags';

/** Whether Session Tags is on for a computer whose session summary is `summary` (none yet: on). */
export function sessionTagsOnIn(summary: { builtInFeaturesOff?: readonly string[] } | null | undefined): boolean {
  return summary?.builtInFeaturesOff?.includes(SESSION_TAGS_FEATURE) !== true;
}
