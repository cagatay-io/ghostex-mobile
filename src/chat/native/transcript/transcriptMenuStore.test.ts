/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/transcriptMenuStore.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { closeTranscriptMenu, openTranscriptMenu, replySelection, useTranscriptMenuStore } from './transcriptMenuStore';

const MESSAGE = 'Sunlight scatters off air molecules.\n\nBlue light scatters the most.';

function opened() {
  const request = useTranscriptMenuStore.getState().request;
  assert.ok(request !== null, 'the menu did not open');
  return request;
}

afterEach(closeTranscriptMenu);

describe('the transcript menu Reply quote', () => {
  test('quotes the words selected before More, not the whole message', () => {
    openTranscriptMenu({ selection: MESSAGE, selectedWords: '  Blue light scatters  ' });
    const request = opened();
    assert.equal(replySelection(request), 'Blue light scatters');
    // Copy and Add to Chat keep the whole message.
    assert.equal(request.selection, MESSAGE);
  });

  test('quotes the whole message when nothing was selected', () => {
    openTranscriptMenu({ selection: MESSAGE });
    assert.equal(replySelection(opened()), MESSAGE);
  });

  test('an empty selection from an app built before the fix quotes the whole message', () => {
    openTranscriptMenu({ selection: MESSAGE, selectedWords: '' });
    assert.equal(replySelection(opened()), MESSAGE);
    openTranscriptMenu({ selection: MESSAGE, selectedWords: ' \n ' });
    assert.equal(replySelection(opened()), MESSAGE);
  });
});
