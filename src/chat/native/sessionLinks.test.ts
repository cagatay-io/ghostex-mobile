/// <reference types="node" />
/** Run with `bun test src/chat/native/sessionLinks.test.ts` from apps/mobile/app. gx-core's links.rs has the same tests. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { GhostexSessionLink, GhostexSessionLinks } from '../../contract/mobileSummary';
import { SidebarPalette } from '../../theme/palette';
import {
  SUGGESTED_OPEN_UP_TO_LINKED,
  SUGGESTED_SHOWN_FIRST,
  sessionLinksDisplay,
  sessionLinksRow,
  sessionLinksWithoutRemoved,
  suggestedOpensUnfolded,
  suggestionsShown,
} from './sessionLinks';

function link(key: string, state: string, finished: boolean, pinned = false): GhostexSessionLink {
  return {
    key,
    kind: 'pullRequest',
    label: key,
    title: '',
    state,
    stateName: '',
    checks: '',
    review: '',
    url: '',
    source: '',
    sourceLabel: '',
    finished,
    pinned,
    loading: false,
    branch: '',
  };
}

function links(items: GhostexSessionLink[], removed: GhostexSessionLink[] = []): GhostexSessionLinks {
  return { items, suggested: [], removed };
}

describe('session links in the sidebar', () => {
  test('defaults to Badge, and a chosen option is kept', () => {
    assert.equal(sessionLinksDisplay(undefined), 'badge');
    assert.equal(sessionLinksDisplay('nonsense'), 'badge');
    for (const value of ['always', 'selected', 'badge', 'open', 'off'] as const) {
      assert.equal(sessionLinksDisplay(value), value);
    }
  });
});

describe('the badge colour', () => {
  test('is grey once every link is merged or closed', () => {
    const row = sessionLinksRow(links([link('#3', 'merged', true), link('#4', 'closed', true)]), 'badge', false);
    assert.deepEqual(row.badge, { count: 2, color: SidebarPalette.WORK_DRAFT, suggested: false });
  });

  test('keeps the open colour while any link is open', () => {
    const row = sessionLinksRow(links([link('#3', 'merged', true), link('#2', 'open', false)]), 'badge', false);
    assert.equal(row.badge?.color, SidebarPalette.WORK_OPEN);
  });

  test('counts only the unpinned links: a pinned open one leaves it grey', () => {
    const row = sessionLinksRow(links([link('#2', 'open', false, true), link('#3', 'merged', true)]), 'badge', false);
    assert.deepEqual(
      row.line.map((item) => item.key),
      ['#2'],
    );
    assert.equal(row.badge?.color, SidebarPalette.WORK_DRAFT);
  });
});

describe('a removed link', () => {
  test('leaves its group at once and leads Removed', () => {
    const before = links([link('#1', 'open', false), link('#2', 'open', false)], [link('#9', 'merged', true)]);
    const after = sessionLinksWithoutRemoved(before, ['#2']);
    assert.deepEqual(
      after.items.map((item) => item.key),
      ['#1'],
    );
    assert.deepEqual(
      after.removed.map((item) => item.key),
      ['#2', '#9'],
    );
  });

  test('changes nothing once the computer has published the removal', () => {
    const published = links([link('#1', 'open', false)], [link('#2', 'open', false)]);
    assert.equal(sessionLinksWithoutRemoved(published, ['#2']), published);
    assert.equal(sessionLinksWithoutRemoved(published, []), published);
  });
});

describe('suggestionsShown', () => {
  test('shows the first five until Show all, then every one', () => {
    const suggested = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    assert.equal(SUGGESTED_SHOWN_FIRST, 5);
    assert.deepEqual(suggestionsShown(suggested, false), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(suggestionsShown(suggested, true), suggested);
    assert.deepEqual(suggestionsShown(['a'], false), ['a']);
  });
});

describe('sessionLinksWithoutRemoved with suggestions', () => {
  test('a dismissed suggestion leaves Suggested at once and leads Removed', () => {
    const links: GhostexSessionLinks = { items: [], suggested: [link('#1', '', false), link('#2', '', false)], removed: [] };
    const after = sessionLinksWithoutRemoved(links, ['#2']);
    assert.deepEqual(
      after.suggested.map((entry) => entry.key),
      ['#1'],
    );
    assert.deepEqual(
      after.removed.map((entry) => entry.key),
      ['#2'],
    );
  });
});

describe('Suggested on opening the sheet', () => {
  test('opens unfolded with 2 or fewer linked links and keeps the saved fold from 3', () => {
    assert.equal(SUGGESTED_OPEN_UP_TO_LINKED, 2);
    assert.equal(suggestedOpensUnfolded(0), true);
    assert.equal(suggestedOpensUnfolded(1), true);
    assert.equal(suggestedOpensUnfolded(2), true);
    assert.equal(suggestedOpensUnfolded(3), false);
    assert.equal(suggestedOpensUnfolded(12), false);
  });
});
