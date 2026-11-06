/**
 * Settings in two columns (on the unfolded Duo in landscape, like the iPad's Settings): the list's
 * selection and the right column's Back follow the stack, so turning the phone keeps the user's place.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEFAULT_SETTINGS_PAGE, isSettingsRoute, settingsColumnsFor, type ColumnRoute } from './columnRules';
import type { SettingsPageId } from './pages';

const SESSIONS: ColumnRoute = { name: 'Sessions' };
const SETTINGS: ColumnRoute = { name: 'Settings' };
/** The pages the Settings list carries; Chat's read-aloud voice and Interface's palettes are not among them. */
const LISTED: ReadonlySet<SettingsPageId> = new Set(['theme', 'chat', 'keyboard', 'licences']);
const columnsFor = (routes: readonly ColumnRoute[], index: number) =>
  settingsColumnsFor(routes, index, (page) => LISTED.has(page));

describe('Settings in two columns', () => {
  test('Settings alone selects Interface, the first page', () => {
    assert.equal(DEFAULT_SETTINGS_PAGE, 'theme');
    assert.deepEqual(columnsFor([SESSIONS, SETTINGS], 1), {
      settingsIndex: 1,
      selected: 'theme',
      subPage: false,
    });
  });

  test('a page open in portrait is the selected page in landscape', () => {
    const routes = [SESSIONS, SETTINGS, { name: 'SettingsPage', page: 'chat' as const }];
    assert.deepEqual(columnsFor(routes, 2), { settingsIndex: 1, selected: 'chat', subPage: false });
  });

  test("Keyboard's editors open in the right column with their own Back, Keyboard selected", () => {
    const routes = [
      SESSIONS,
      SETTINGS,
      { name: 'SettingsPage', page: 'keyboard' as const },
      { name: 'ExtraKeysEditor' },
    ];
    assert.deepEqual(columnsFor(routes, 3), { settingsIndex: 1, selected: 'keyboard', subPage: true });
  });

  test('a page opened from a page keeps the first one selected', () => {
    const routes = [
      SESSIONS,
      SETTINGS,
      { name: 'SettingsPage', page: 'chat' as const },
      { name: 'SettingsPage', page: 'readAloudVoice' as const },
    ];
    assert.deepEqual(columnsFor(routes, 3), { settingsIndex: 1, selected: 'chat', subPage: true });
  });

  test('a licence entry opens beside the list with its own Back, Licences selected', () => {
    const routes = [SESSIONS, SETTINGS, { name: 'SettingsPage', page: 'licences' as const }, { name: 'LicenceNotice' }];
    assert.deepEqual(columnsFor(routes, 3), { settingsIndex: 1, selected: 'licences', subPage: true });
  });

  test('a page opened from the default page, which has no route of its own, goes back to Interface', () => {
    const routes = [SESSIONS, SETTINGS, { name: 'SettingsPage', page: 'terminalPaletteDark' as const }];
    assert.deepEqual(columnsFor(routes, 2), { settingsIndex: 1, selected: 'theme', subPage: true });
    // Settings under it is the default page itself: no Back of its own.
    assert.deepEqual(columnsFor(routes, 1), { settingsIndex: 1, selected: 'theme', subPage: false });
  });

  test('that holds for every page the list does not carry, and for its editors', () => {
    for (const page of ['terminalPaletteLight', 'readAloudVoice', 'dictateLanguage'] as const) {
      assert.deepEqual(columnsFor([SESSIONS, SETTINGS, { name: 'SettingsPage', page }], 2), {
        settingsIndex: 1,
        selected: 'theme',
        subPage: true,
      });
    }
    assert.deepEqual(columnsFor([SESSIONS, SETTINGS, { name: 'ExtraKeysEditor' }], 2), {
      settingsIndex: 1,
      selected: 'theme',
      subPage: true,
    });
  });

  test('a palette opened after tapping Interface still has Interface selected and a Back', () => {
    const routes = [
      SESSIONS,
      SETTINGS,
      { name: 'SettingsPage', page: 'theme' as const },
      { name: 'SettingsPage', page: 'terminalPaletteLight' as const },
    ];
    assert.deepEqual(columnsFor(routes, 3), { settingsIndex: 1, selected: 'theme', subPage: true });
    assert.deepEqual(columnsFor(routes, 2), { settingsIndex: 1, selected: 'theme', subPage: false });
  });

  test('no columns without the Settings list under the page, or outside Settings', () => {
    assert.equal(columnsFor([SESSIONS, { name: 'SettingsPage', page: 'theme' }], 1), null);
    assert.equal(columnsFor([SESSIONS, SETTINGS, { name: 'Terminal' }], 2), null);
    assert.equal(columnsFor([SESSIONS], 0), null);
  });

  test('only the Settings routes change without a stack animation', () => {
    assert.ok(['Settings', 'SettingsPage', 'ExtraKeysEditor', 'AgentHotkeysEditor'].every(isSettingsRoute));
    assert.ok(!isSettingsRoute('Sessions') && !isSettingsRoute('Terminal'));
  });
});
