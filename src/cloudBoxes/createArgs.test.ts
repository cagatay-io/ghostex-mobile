/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { providerCreateArgs } from './createArgs';

test('a phone create hands the provider plan to the core, which drops the idle pause on a free plan', () => {
  const free = providerCreateArgs({ boxId: 'gx_a' }, 'snap_1', 15, 'ghostex-gx_a-create', 'free');
  assert.equal(free.plan, 'free');
  assert.equal(free.idleMinutes, 15);
  assert.equal(free.providerSnapshotId, 'snap_1');
  // An older computer's kit has no plan: nothing extra is sent.
  const older = providerCreateArgs({ boxId: 'gx_a' }, null, 15, 'ghostex-gx_a-create', undefined);
  assert.equal('plan' in older, false);
  assert.equal('providerSnapshotId' in older, false);
});
