/// <reference types="node" />
/** Run with `bun test src/components/sessions/drawerStatusLine.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { MachineInventory } from '../../inventory/store';
import { drawerStatusLine } from './drawerStatusLine';
import { machineNotice } from './machineNotice';
import type { MachineTabConnectionState } from './MachineTabs';

const machine = 'M7-Desktop';
const summary = { sessions: [{}], projects: [{}] } as unknown as NonNullable<MachineInventory['summary']>;

function inventory(overrides: Partial<MachineInventory>): MachineInventory {
  return {
    summary: null,
    hasLoaded: false,
    refreshing: false,
    retrying: false,
    lastError: null,
    lastErrorCode: null,
    ...overrides,
  } as MachineInventory;
}

/** The tab's connection state, as SessionsScreen derives it. */
function connectionState(inv: MachineInventory | undefined): MachineTabConnectionState {
  if (inv === undefined || !inv.hasLoaded || inv.retrying || (inv.refreshing && inv.summary === null)) return 'busy';
  if (inv.lastError !== null) return 'failed';
  return inv.summary === null ? 'disconnected' : 'connected';
}

const STATES: Record<string, MachineInventory | undefined> = {
  'not loaded yet': undefined,
  'first load': inventory({ refreshing: true }),
  'retry after failure': inventory({ hasLoaded: true, retrying: true, lastError: 'timeout' }),
  'failed, never loaded': inventory({ hasLoaded: true, lastError: 'timeout' }),
  'refresh failed with sessions': inventory({ hasLoaded: true, summary, lastError: 'timeout' }),
  refreshing: inventory({ hasLoaded: true, summary, refreshing: true }),
  connected: inventory({ hasLoaded: true, summary }),
};

describe('drawerStatusLine', () => {
  for (const [name, inv] of Object.entries(STATES)) {
    test(`never repeats the machine notice: ${name}`, () => {
      const notice = machineNotice('M7-Desktop', inv, connectionState(inv));
      const line = drawerStatusLine(machine, inv, notice);
      if (notice !== null) {
        assert.equal(line, '');
      } else {
        assert.notEqual(line, '');
      }
      assert.ok(!line.startsWith('Connecting to'));
    });
  }

  test('keeps what the notice does not say', () => {
    assert.equal(drawerStatusLine(machine, STATES.refreshing, null), 'Refreshing sessions on M7-Desktop...');
    assert.equal(drawerStatusLine(machine, STATES.connected, null), 'Connected to M7-Desktop');
    assert.equal(
      drawerStatusLine(null, undefined, null),
      'Add a machine to connect to Ghostex over Tailscale.',
    );
  });
});
