/// <reference types="node" />
/** Run with `bun test src/analytics/mobileViews.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { clientViewCommand, machineIdForRoute, mobileViewForRoute } from './mobileViews';

describe('mobileViewForRoute', () => {
  test('maps screens to their fixed view names', () => {
    assert.equal(mobileViewForRoute('Sessions'), 'mobile_sessions');
    assert.equal(mobileViewForRoute('Terminal'), 'mobile_terminal');
    assert.equal(mobileViewForRoute('DocViewer'), 'mobile_files');
    assert.equal(mobileViewForRoute('WebPreview'), 'mobile_browser');
    assert.equal(mobileViewForRoute('SettingsPage'), 'mobile_settings');
  });

  test('setup and unknown routes report nothing', () => {
    assert.equal(mobileViewForRoute('Welcome'), null);
    assert.equal(mobileViewForRoute('ScanCode'), null);
    assert.equal(mobileViewForRoute('Feedback'), null);
    assert.equal(mobileViewForRoute('toString'), null);
    assert.equal(mobileViewForRoute(undefined), null);
  });
});

describe('machineIdForRoute', () => {
  test('reads only a non-empty machineId string', () => {
    assert.equal(machineIdForRoute({ machineId: 'm1', path: '/secret' }), 'm1');
    assert.equal(machineIdForRoute({ machineId: '' }), null);
    assert.equal(machineIdForRoute(undefined), null);
  });
});

describe('clientViewCommand', () => {
  test('carries only the view name', () => {
    assert.equal(clientViewCommand('mobile_terminal'), 'ghostex client-view --client mobile --view mobile_terminal --json');
  });
});
