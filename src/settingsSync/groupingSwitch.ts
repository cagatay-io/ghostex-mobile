/**
 * Group sessions by tags switched on the phone (Sort & Filter or Settings › Sidebar & Sessions). Turning it on first
 * saves the Session Tags list in its full form (the six status entries in their places) through the same Sidebar
 * organization writer, so the groups' order rests on a stored list rather than on how each app reads an older one;
 * then the switch. Turning it off writes the switch only.
 */

import type { GhostexMobileSummary } from '../contract/mobileSummary';
import { normalizeTagListItems, storedTagListItems } from '../contract/sessionTagList';
import { setSidebarSetting } from './settingsSync';
import { currentSidebarOrganization } from './sidebarOrganization';

export type GroupingSwitchDeps = {
  write: typeof setSidebarSetting;
  /** The stored tag list now (`sidebarSessionTagListItems`; `null` for the first-run list). */
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
  if (on) {
    const items = normalizeTagListItems(deps.readTagList(), summary === null ? null : summary.customSessionTags);
    deps.write('sidebarSessionTagListItems', storedTagListItems(items));
  }
  deps.write('groupSessionsByTags', on);
}
