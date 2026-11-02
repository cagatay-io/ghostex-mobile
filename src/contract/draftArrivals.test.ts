/// <reference types="node" />
/** Run with `bun test src/contract/draftArrivals.test.ts` from apps/mobile/app. gx-core's draft_arrivals.rs has the same tests. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DRAFT_ARRIVAL_WINDOW_MS, DRAFT_CLOCK_SLACK_MS, DraftArrivals, type DraftRow } from './draftArrivals';
import { isSidebarDraftSectionSession } from './sessionDrafts';

const NOW = 10_000_000;

function draft(id: string, createdMs: number = NOW - 1_000): DraftRow {
  return { id, collapseKey: 'id:p|drafts', createdMs };
}

describe('Drafts membership', () => {
  test('a new empty session is a draft at once', () => {
    assert.equal(isSidebarDraftSectionSession({ isDraft: true, createdAt: new Date(NOW).toISOString() }, NOW), true);
  });
  test('a sent session and a pinned draft are not in Drafts', () => {
    assert.equal(isSidebarDraftSectionSession({ isDraft: false }, NOW), false);
    assert.equal(isSidebarDraftSectionSession({ isDraft: true, isPinned: true }, NOW), false);
  });
});

describe('DraftArrivals', () => {
  test('the first list is only recorded', () => {
    assert.deepEqual(new DraftArrivals().observe([draft('a')], NOW), []);
  });
  test('a draft the previous list lacked arrives once', () => {
    const arrivals = new DraftArrivals();
    arrivals.observe([draft('a')], NOW);
    assert.deepEqual(
      arrivals.observe([draft('a'), draft('b')], NOW).map((row) => row.id),
      ['b'],
    );
    assert.deepEqual(arrivals.observe([draft('a'), draft('b')], NOW + 10), []);
  });
  test('a draft made before the first list is not an arrival', () => {
    const arrivals = new DraftArrivals();
    arrivals.observe([], NOW);
    assert.deepEqual(arrivals.observe([draft('a', NOW - DRAFT_CLOCK_SLACK_MS - 1)], NOW + 500), []);
  });
  test('an old draft that only came into view is not an arrival', () => {
    const arrivals = new DraftArrivals();
    arrivals.observe([], NOW);
    assert.deepEqual(arrivals.observe([draft('a', NOW - DRAFT_ARRIVAL_WINDOW_MS - 1)], NOW), []);
  });
  test('after a reset the next list is only recorded', () => {
    const arrivals = new DraftArrivals();
    arrivals.observe([], NOW);
    arrivals.reset();
    assert.deepEqual(arrivals.observe([draft('a')], NOW), []);
  });
});
