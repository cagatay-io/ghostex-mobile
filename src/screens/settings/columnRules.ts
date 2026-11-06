/**
 * Settings in two columns on the iPhone Duo's inner display in landscape, like the iPad's Settings: the Settings list on the left, the open page on the right.
 *
 * The stack stays the one source of where the user is: Settings, then the open page (a `SettingsPage`
 * route), then any page opened from it (Keyboard's editors, Chat's read-aloud voice, Interface's terminal
 * palettes). The two columns only draw that stack side by side, so turning the phone keeps the user's place
 * both ways: a page open in portrait is the selected page in landscape, and the selected page is still open
 * in portrait.
 * Kept free of React Native so its rules are testable under `bun test`.
 */

import type { SettingsPageId } from './pages';

/** The routes Settings is made of. */
const SETTINGS_ROUTES: ReadonlySet<string> = new Set([
  'Settings',
  'SettingsPage',
  'ExtraKeysEditor',
  'AgentHotkeysEditor',
  'CommandPadKeysEditor',
  'LicenceNotice',
]);

/** The page selected while none was opened yet: the first of the list (Interface). */
export const DEFAULT_SETTINGS_PAGE: SettingsPageId = 'theme';

export function isSettingsRoute(name: string): boolean {
  return SETTINGS_ROUTES.has(name);
}

/** A stack route as far as the columns care: its name and, for a `SettingsPage`, its page. */
export type ColumnRoute = { readonly name: string; readonly page?: SettingsPageId };

export type SettingsColumns = {
  /** Where Settings itself is in the stack. */
  readonly settingsIndex: number;
  /** The list's selected row: the first listed page opened after Settings, else the default. */
  readonly selected: SettingsPageId;
  /** The right column shows a page opened from the selected one, which goes back to it. */
  readonly subPage: boolean;
};

/**
 * The columns for the route at `index`, or null when it is not part of Settings opened from its list
 * (another screen above it, or a Settings page reached without the list under it).
 *
 * `isListed` tells whether a page is one of the Settings list's own rows. The page the list selects is
 * the first listed one opened after Settings; a route opened before it, or with none opened, comes from
 * the default page, which is shown without a route of its own (Settings alone), and is a page opened from
 * it: it goes back to the default page. That holds for every page the list does not carry, so the terminal
 * palettes opened from Interface behave like those opened after tapping Interface's row.
 */
export function settingsColumnsFor(
  routes: readonly ColumnRoute[],
  index: number,
  isListed: (page: SettingsPageId) => boolean,
): SettingsColumns | null {
  let settingsIndex = -1;
  for (let at = index; at >= 0; at -= 1) {
    const name = routes[at]?.name;
    if (name === undefined || !isSettingsRoute(name)) return null;
    if (name === 'Settings') {
      settingsIndex = at;
      break;
    }
  }
  if (settingsIndex < 0) return null;
  const opened = routes
    .slice(settingsIndex + 1, index + 1)
    .findIndex((route) => route.name === 'SettingsPage' && route.page !== undefined && isListed(route.page));
  if (opened < 0) return { settingsIndex, selected: DEFAULT_SETTINGS_PAGE, subPage: index > settingsIndex };
  const pageIndex = settingsIndex + 1 + opened;
  return {
    settingsIndex,
    selected: routes[pageIndex]?.page ?? DEFAULT_SETTINGS_PAGE,
    subPage: index > pageIndex,
  };
}
