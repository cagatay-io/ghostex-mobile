/// <reference types="node" />
/** Run with `bun test src/contract/claudeCloud.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { claudeCloudPageUrl, claudeCloudTakesTask, parseClaudeCloud } from './claudeCloud';

const cloud = (state: string, url = 'https://claude.ai/code/session_01Test') =>
  parseClaudeCloud({ state, url, accountName: 'MS' });

describe('a Claude cloud row on the phone', () => {
  test('its chat takes the task while it waits for one or its start failed', () => {
    assert.equal(claudeCloudTakesTask(cloud('draft', '')), true);
    assert.equal(claudeCloudTakesTask(cloud('failed', '')), true);
    for (const state of ['starting', 'running', 'moved']) {
      assert.equal(claudeCloudTakesTask(cloud(state)), false, state);
    }
    assert.equal(claudeCloudTakesTask(undefined), false);
  });

  test('a tap opens claude.ai only once the session runs there', () => {
    assert.equal(claudeCloudPageUrl(cloud('running')), 'https://claude.ai/code/session_01Test');
    assert.equal(claudeCloudPageUrl(cloud('draft', '')), null);
    assert.equal(claudeCloudPageUrl(cloud('starting', '')), null);
  });
});
