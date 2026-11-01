/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { machineTabsVisible, newSessionStartsInOpen, noticeMachineId } from './machineStripPolicy';

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

  test('a picked project starts where its open session is, and asks otherwise', () => {
    const project = [
      { machineId: 'laptop', projectId: 'p1' },
      { machineId: 'desktop', projectId: 'p9' },
    ];
    assert.equal(newSessionStartsInOpen(project, { machineId: 'desktop', projectId: 'p9' }), true);
    assert.equal(newSessionStartsInOpen(project, { machineId: 'desktop', projectId: 'p1' }), false);
    assert.equal(newSessionStartsInOpen(project, null), false);
  });
});
