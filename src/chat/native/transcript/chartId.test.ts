/// <reference types="node" />
/** Run with `bun test src/chat/native/transcript/chartId.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { chartId } from './chartId';

describe('chart id', () => {
  test('matches the chat core (questions/content.rs chart_id)', () => {
    assert.equal(chartId('{"a":1}'), 'chart-8b9e4511');
    assert.equal(chartId('\n{"a":1}\n '), 'chart-8b9e4511');
    assert.notEqual(chartId('{"a":2}'), 'chart-8b9e4511');
  });
});
