/// <reference types="node" />
/** Run with `bun test src/screens/sessions-screen/sessionMention.test.ts` from apps/mobile/app. gx-core's copy.rs and gx-protocol's session_ref.rs have the same tests. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MORE_DETAILS_LINE, sessionMentionText } from './sessionMention';

describe('Copy ID and Copy Details text', () => {
  test('Copy ID copies the title linked to the Global Ref, like gx-protocol session_mention', () => {
    assert.equal(
      sessionMentionText('Model and effort inventory for agent CLIs', 'S90:P3lv0:G7hgi'),
      '[Model and effort inventory for agent CLIs](S90:P3lv0:G7hgi)',
    );
    assert.equal(sessionMentionText('Fix [beta]\n  build', 'S1:P2:G3'), '[Fix \\[beta\\] build](S1:P2:G3)');
    assert.equal(sessionMentionText('  ', 'S1:P2:G3'), '[Session](S1:P2:G3)');
  });

  test('Copy Details points at ghostex agents, not a skill', () => {
    assert.ok(MORE_DETAILS_LINE.includes('`ghostex agents`'));
    assert.ok(!MORE_DETAILS_LINE.includes('$'));
  });
});
