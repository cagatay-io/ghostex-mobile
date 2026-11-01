/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { machineTabsVisible, noticeMachineId } from './machineStripPolicy';

describe('computer controls for the Sessions list layouts', () => {
  test('Project keeps tabs, Unified hides them even with several computers', () => {
    assert.equal(machineTabsVisible(false, 2), true);
    assert.equal(machineTabsVisible(true, 2), false);
    assert.equal(machineTabsVisible(false, 0), false);
  });

  test('Project shows only the selected computer notice', () => {
    const notices = [{ machineId: 'other', kind: 'failure' as const }];
    assert.equal(noticeMachineId(false, 'current', notices), null);
    assert.equal(noticeMachineId(false, 'other', notices), 'other');
  });

  test('Unified exposes a failed computer when the selected one is healthy or connecting', () => {
    const notices = [
      { machineId: 'current', kind: 'connecting' as const },
      { machineId: 'other', kind: 'failure' as const },
    ];
    assert.equal(noticeMachineId(true, 'current', notices), 'other');
    assert.equal(noticeMachineId(true, 'other', notices), 'other');
    assert.equal(noticeMachineId(true, 'current', [{ machineId: 'current', kind: 'connecting' }]), 'current');
  });
});
