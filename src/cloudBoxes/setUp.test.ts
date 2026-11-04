/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cloudBoxesSetUp } from './setUp';

test('Cloud Box waits until a cloud provider is connected or a box exists', () => {
  // Docker being there is not using Cloud Boxes.
  const fresh = [
    { id: 'instabox', state: 'notConnected' },
    { id: 'local', state: 'connected' },
  ];
  assert.equal(cloudBoxesSetUp(fresh, false), false);
  assert.equal(cloudBoxesSetUp(fresh, true), true);
  assert.equal(cloudBoxesSetUp([{ id: 'boat', state: 'connected' }], false), true);
  assert.equal(cloudBoxesSetUp([{ id: 'instabox', state: 'expired' }], false), true);
  assert.equal(cloudBoxesSetUp([{ id: 'boat', state: 'connected', debugOnly: true }], false), false);
  assert.equal(cloudBoxesSetUp([], false), false);
});
