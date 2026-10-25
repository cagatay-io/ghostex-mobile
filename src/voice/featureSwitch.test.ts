/// <reference types="node" />
/** Run with `bun test src/voice/featureSwitch.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { voiceAgentOnIn } from './featureSwitch';

describe('the voice agent switch', () => {
  test('a computer that has not answered yet, or is too old to send the list, has it on', () => {
    assert.equal(voiceAgentOnIn(undefined), true);
    assert.equal(voiceAgentOnIn(null), true);
    assert.equal(voiceAgentOnIn({}), true);
  });

  test('a computer that lists other features as off has it on', () => {
    assert.equal(voiceAgentOnIn({ builtInFeaturesOff: ['readAloud', 'actions'] }), true);
  });

  test('a computer that lists it as off has it off', () => {
    assert.equal(voiceAgentOnIn({ builtInFeaturesOff: ['readAloud', 'voiceAgent'] }), false);
  });
});
