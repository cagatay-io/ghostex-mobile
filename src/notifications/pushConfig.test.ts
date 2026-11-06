/// <reference types="node" />
/**
 * Run with `bun test src/notifications/pushConfig.test.ts`. The iOS push configuration as Expo resolves it for a
 * build (`expo config --type introspect`: app.json, app.config.js and every config plugin, Expo's automatic ones
 * included): remote notifications on, `remote-notification` once among the background modes, the voice call's
 * `audio` and `voip` modes kept, and no background fetch, so a plugin that adds `fetch` (expo-task-manager's) fails here.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

/** A field of a JSON object, or undefined when `value` is no object or lacks it. */
function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

/** The project's resolved Expo config, as the build sees it (parsed JSON, read field by field below). */
function introspectedConfig(): unknown {
  const projectRoot = path.resolve(__dirname, '../..');
  // `bun x expo` is the project's own Expo CLI; the arguments go as an array, no shell.
  const output = execFileSync(process.execPath, ['x', 'expo', 'config', '--type', 'introspect', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output);
}

test('iOS gets remote notifications, remote-notification beside the voice call modes, and no background fetch', () => {
  const ios = field(introspectedConfig(), 'ios');
  assert.equal(typeof field(field(ios, 'entitlements'), 'aps-environment'), 'string');
  const modes = field(field(ios, 'infoPlist'), 'UIBackgroundModes');
  assert.ok(Array.isArray(modes));
  assert.equal(modes.filter((mode) => mode === 'remote-notification').length, 1);
  assert.ok(modes.includes('audio') && modes.includes('voip'));
  assert.ok(!modes.includes('fetch'));
});
