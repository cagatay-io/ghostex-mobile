/// <reference types="node" />
/** Run with `bun test src/machines/machineToolsView.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { agentCliRow, answerError, skillRow, TOO_OLD_MESSAGE, toolRow } from './machineToolsView';

describe('agent CLI rows', () => {
  test('a missing CLI offers its first install that can run there', () => {
    const row = agentCliRow({
      agentId: 'gemini',
      name: 'Gemini',
      methods: [
        { id: 'brew', unavailableReason: 'Homebrew is not on this computer.' },
        { id: 'npm', label: 'npm' },
      ],
    });
    assert.equal(row.title, 'Gemini');
    assert.equal(row.detail, 'Not installed');
    assert.deepEqual(row.action, { label: 'Install', operation: 'install', methodId: 'npm' });
  });

  test('an installed CLI with a newer release offers the update through the method that installed it', () => {
    const row = agentCliRow({
      agentId: 'grok',
      executablePath: 'C:\\Users\\me\\grok.exe',
      version: '1.0.62',
      latestVersion: '1.0.70',
      updateAvailable: true,
      detectedMethodId: 'native',
    });
    assert.equal(row.title, 'grok');
    assert.equal(row.detail, 'Installed · 1.0.62 · 1.0.70 available');
    assert.deepEqual(row.action, { label: 'Update', operation: 'update', methodId: 'native' });
  });

  test('a running job shows its progress and no button; a failed one says why', () => {
    const running = agentCliRow({ agentId: 'codex', job: { status: 'running', operation: 'update' } });
    assert.equal(running.busy, true);
    assert.equal(running.detail, 'Updating…');
    assert.equal(running.action, null);
    const failed = agentCliRow({ agentId: 'codex', job: { status: 'failed', error: 'npm exited with 1.' } });
    assert.equal(failed.detail, 'npm exited with 1.');
    assert.equal(failed.tone, 'warning');
  });
});

describe('tool rows', () => {
  test('a Mac-only tool on Linux says why and offers nothing', () => {
    const row = toolRow({
      id: 'spaceo',
      label: 'SpaceO',
      supported: false,
      unsupportedReason: 'SpaceO runs only on Apple Silicon Macs with macOS 14 or later.',
    });
    assert.equal(row.detail, 'SpaceO runs only on Apple Silicon Macs with macOS 14 or later.');
    assert.equal(row.action, null);
  });

  test('an installed desktop-control tool without its grants is not shown as done', () => {
    const note =
      "Installed, but it can't control that Mac yet. Only someone at that Mac can allow Accessibility and Screen Recording.";
    const row = toolRow({
      id: 'trycua',
      label: 'Fast Computer & Browser Use',
      supported: true,
      installed: true,
      version: '0.37.0',
      permissionNote: note,
      actions: ['update', 'reinstall', 'uninstall'],
    });
    assert.equal(row.tone, 'warning');
    assert.equal(row.detail, `0.37.0. ${note}`);
  });

  test('a tool whose check is not answering says so and offers Retry', () => {
    const row = toolRow({
      id: 'gh',
      label: 'GitHub CLI',
      supported: true,
      installed: true,
      actions: ['update'],
      notAnswering: "`gh --version` didn't answer within 5 seconds, so Ghostex stopped it.",
    });
    assert.equal(row.tone, 'warning');
    assert.equal(row.detail, "Not answering. `gh --version` didn't answer within 5 seconds, so Ghostex stopped it.");
    assert.deepEqual(row.action, { label: 'Retry', operation: 'retry' });
  });

  test('a terminal install is not started from the phone', () => {
    const row = toolRow({
      id: 'systemTools',
      label: 'System tools',
      supported: true,
      installed: false,
      actions: ['install'],
      terminalCommand: 'sudo apt-get install -y curl',
    });
    assert.equal(row.action, null);
    assert.equal(row.detail, 'Install it from a terminal on that computer.');
  });
});

describe('skill rows and errors', () => {
  test('skills install, remove, or say why they cannot', () => {
    assert.deepEqual(skillRow({ skillName: 'ghostex-cli', name: 'Ghostex CLI', installed: false }).action, {
      label: 'Install',
      operation: 'installSkill',
    });
    assert.equal(skillRow({ skillName: 'ghostex-cli', installed: true }).action?.operation, 'uninstallSkill');
    const spaceo = skillRow({ skillName: 'ghostex-spaceo', unavailableReason: 'SpaceO is only available on macOS.' });
    assert.equal(spaceo.action, null);
    assert.equal(spaceo.detail, 'SpaceO is only available on macOS.');
  });

  test('a gxserver without the endpoint is named as too old', () => {
    assert.equal(
      answerError({ code: 'notFound', message: 'x is not a gxserver HTTP endpoint.' }, 'unreachable'),
      TOO_OLD_MESSAGE,
    );
    assert.equal(answerError({ code: 'badRequest', message: 'Unknown tool.' }, 'unreachable'), 'Unknown tool.');
    assert.equal(answerError({ message: ' ' }, 'unreachable'), 'unreachable');
  });
});
