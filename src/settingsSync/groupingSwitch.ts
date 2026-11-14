/**
 * Group sessions by tags switched on the phone (Sort & Filter or Settings › Sidebar & Sessions). Turning it on first
 * saves the Session Tags list in its full form (the six status entries in their places) through the same Sidebar
 * organization writer, so the groups' order rests on a stored list rather than on how each app reads an older one;
 * then the switch. Turning it off writes the switch only.
 *
 * When the phone holds no list at all (no synced value, none of its own and none in a computer's summary: the default
 * fallback), turning it on writes the switch only: a written default list could reach a computer whose own list has
 * never synced and replace its custom tags and order.
 */

import type { GhostexMobileSummary } from '../contract/mobileSummary';
import { normalizeTagListItems, storedTagListItems } from '../contract/sessionTagList';
import { setSidebarSetting } from './settingsSync';
import { currentSidebarOrganization } from './sidebarOrganization';

export type GroupingSwitchDeps = {
  write: typeof setSidebarSetting;
  /** The tag list held now (`sidebarSessionTagListItems`; `null` when the phone holds none, the default fallback). */
  readTagList: () => unknown[] | null;
};

export function setGroupSessionsByTags(
  on: boolean,
  summary: GhostexMobileSummary | null,
  deps: GroupingSwitchDeps = {
    write: setSidebarSetting,
    readTagList: () => currentSidebarOrganization(summary).sidebarSessionTagListItems,
  },
): void {
  const held = deps.readTagList();
  if (on && held !== null) {
    const items = normalizeTagListItems(held, summary === null ? null : summary.customSessionTags);
    deps.write('sidebarSessionTagListItems', storedTagListItems(items));
  }
  deps.write('groupSessionsByTags', on);
}
