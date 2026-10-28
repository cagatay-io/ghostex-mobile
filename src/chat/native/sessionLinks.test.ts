/// <reference types="node" />
/** Run with `bun test src/chat/native/sessionLinks.test.ts` from apps/mobile/app. gx-core's links.rs has the same tests. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { GhostexSessionLink, GhostexSessionLinks } from '../../contract/mobileSummary';
import { SidebarPalette } from '../../theme/palette';
import {
  SUGGESTED_OPEN_UP_TO_LINKED,
  SUGGESTED_SHOWN_FIRST,
  sessionLinksBadgeLabel,
  sessionLinksChatPill,
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
    assert.deepEqual(row.badge, { count: 2, color: SidebarPalette.WORK_DRAFT, suggested: false, label: '#3', more: 1 });
  });

  test('keeps the open colour while any link is open', () => {
    const row = sessionLinksRow(links([link('#3', 'merged', true), link('#2', 'open', false)]), 'badge', false);
    assert.equal(row.badge?.color, SidebarPalette.WORK_OPEN);
  });

  test('names a pinned link with no line of its own; the pinned open one colours it', () => {
    const row = sessionLinksRow(links([link('#3', 'merged', true), link('#2', 'open', false, true)]), 'badge', false);
    assert.deepEqual(row.line, []);
    assert.deepEqual([row.badge?.label, row.badge?.more, row.badge?.color], ['#2', 1, SidebarPalette.WORK_OPEN]);
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

describe('sessionLinksChatPill', () => {
  test('reads like the badge (ID and +N) and says suggested quietly', () => {
    const failing = { ...link('#1', 'open', false), checks: 'failing' };
    const three = sessionLinksChatPill(links([link('#2', 'open', false), failing, link('#3', 'merged', true)]), 'muted');
    assert.deepEqual([three?.label, three?.more, three?.color, three?.suggested], ['#1', 2, SidebarPalette.WORK_CLOSED, false]);

    const one = sessionLinksChatPill(links([{ ...link('SPX-123', 'open', false), kind: 'linear' }]), 'muted');
    assert.deepEqual([one?.label, one?.more], ['SPX-123', 0]);

    const suggested = sessionLinksChatPill(
      { items: [], suggested: [link('#4', 'open', false), link('#5', 'open', false)], removed: [] },
      'muted',
    );
    assert.deepEqual([suggested?.label, suggested?.color, suggested?.suggested], ['2 suggested', 'muted', true]);

    assert.equal(sessionLinksChatPill(links([], [link('#6', 'open', false)]), 'muted'), null);
    assert.equal(sessionLinksChatPill(undefined, 'muted'), null);
  });
});

describe('sessionLinksBadgeLabel', () => {
  test('one link, a pinned one, ties and every link finished', () => {
    assert.deepEqual(sessionLinksBadgeLabel([link('SPX-123', 'open', false)]), { label: 'SPX-123', more: 0 });
    const failing = { ...link('#1', 'open', false), checks: 'failing' };
    assert.deepEqual(sessionLinksBadgeLabel([failing, link('#3', 'merged', true, true)]), { label: '#3', more: 1 });
    assert.deepEqual(sessionLinksBadgeLabel([link('#7', 'open', false), link('#8', 'open', false)]), { label: '#7', more: 1 });
    const review = { ...link('#9', 'open', false), review: 'reviewRequired' };
    assert.deepEqual(sessionLinksBadgeLabel([link('#7', 'open', false), review]), { label: '#9', more: 1 });
    assert.deepEqual(sessionLinksBadgeLabel([link('#3', 'merged', true), link('#4', 'merged', true)]), { label: '#3', more: 1 });
    assert.equal(sessionLinksBadgeLabel([]), null);
  });
});
