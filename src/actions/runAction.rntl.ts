/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The real action runner with the real CLI runner (`runGhostexCli`) over a fake
 * `execRemoteCommand`: what is sent to the computer for a project or a Global Action, what opens afterwards, and
 * how a failed start is reported. The computer's answers are the ones `ghostex run-action` prints.
 */

import { act, renderHook } from '@testing-library/react-native';

import type { ExecResult } from '../../modules/ghostex-native/src';
import { useAppLogStore } from '../app/appLog';
import { ActionCopy, FailureCopy } from '../copy';
import { execRemoteCommand } from '../remote/commands';
import { runQuickAction, type QuickActionRunHost } from './runAction';
import type { QuickActionEntry } from './quickActions';
import {
  useSessionsScreenActions,
  type SessionsScreenActionsDeps,
} from '../screens/sessions-screen/use-sessions-screen-actions';

jest.mock('../remote/commands', () => ({ execRemoteCommand: jest.fn() }));
jest.mock('../remote/connection', () => ({ ensureConnected: jest.fn(async () => undefined) }));
jest.mock('../machines/credentials', () => ({ hasPassword: jest.fn(async () => false) }));
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const exec = execRemoteCommand as jest.MockedFunction<typeof execRemoteCommand>;

type Calls = string[];

function host(calls: Calls, options: { globalSupported?: boolean; refresh?: () => Promise<void> } = {}) {
  const machine = { id: 'm1', host: 'mac.local', username: 'me', port: 22 };
  const runHost: QuickActionRunHost = {
    machine,
    globalQuickActionsSupported: () => options.globalSupported ?? true,
    refresh: jest.fn(async () => {
      calls.push('refresh');
      await options.refresh?.();
    }),
    attach: jest.fn(async (sessionId: string) => {
      calls.push(`attach ${sessionId}`);
    }),
    openWebPreview: jest.fn((target) => {
      calls.push(`preview ${target.scheme}://${target.host}:${target.remotePort}${target.path}`);
    }),
    openUrl: jest.fn(async (url: string) => {
      calls.push(`browser ${url}`);
    }),
    setProgress: jest.fn((message: string | null) => {
      calls.push(`progress ${message ?? 'closed'}`);
    }),
    showStatus: jest.fn((message: string) => {
      calls.push(`status ${message}`);
    }),
    showStartFailure: jest.fn((failure) => {
      calls.push(`failed ${failure.name}: ${failure.message}`);
    }),
  };
  return runHost;
}

function answer(stdout: string, exitCode = 0, stderr = '') {
  exec.mockImplementation(async (_machineId, command): Promise<ExecResult> => {
    sent.push(command);
    return { stdout, stderr, exitCode };
  });
}

let sent: string[] = [];

beforeEach(() => {
  sent = [];
  exec.mockReset();
});

const projectTerminal: QuickActionEntry = {
  scope: 'project',
  action: { actionType: 'terminal', commandId: 'c1', name: 'Tests' },
};
const globalTerminal: QuickActionEntry = {
  scope: 'global',
  action: { actionType: 'terminal', commandId: 'g1', name: 'Git Status' },
};
const run = (entry: QuickActionEntry) => ({ projectId: 'p1', projectTitle: 'Ghostex', entry });

describe('terminal actions', () => {
  test('a project action sends exactly one run-action for its id and the project, without a scope', async () => {
    const calls: Calls = [];
    answer('{"ok":true,"actionType":"terminal","commandId":"c1","session":{"sessionId":"s-new"}}');
    await runQuickAction(host(calls), run(projectTerminal));
    expect(sent).toEqual(["ghostex run-action 'c1' --project-id 'p1'"]);
  });

  test('a global action sends exactly one run-action for its id in the tapped project with --scope global', async () => {
    const calls: Calls = [];
    answer('{"ok":true,"actionType":"terminal","commandId":"g1","session":{"sessionId":"s-new"}}');
    await runQuickAction(host(calls), run(globalTerminal));
    expect(sent).toEqual(["ghostex run-action 'g1' --project-id 'p1' --scope global"]);
  });

  test('the returned session opens once the list is read again, behind the progress card', async () => {
    const calls: Calls = [];
    answer('{"ok":true,"actionType":"terminal","commandId":"c1","session":{"sessionId":"s-new"}}');
    await runQuickAction(host(calls), run(projectTerminal));
    expect(calls).toEqual(['progress Starting Tests in Ghostex…', 'refresh', 'progress closed', 'attach s-new']);
  });

  test('a global action is not sent once the current summary no longer offers Global Actions', async () => {
    const calls: Calls = [];
    answer('{"ok":true}');
    await runQuickAction(host(calls, { globalSupported: false }), run(globalTerminal));
    expect(sent).toEqual([]);
    expect(calls).toEqual([`failed Git Status: ${ActionCopy.globalActionsUnavailable}`]);
  });

  test('an action without a command id sends nothing', async () => {
    const calls: Calls = [];
    answer('{"ok":true}');
    await runQuickAction(host(calls), run({ scope: 'project', action: { actionType: 'terminal', name: 'Tests' } }));
    expect(sent).toEqual([]);
    expect(calls).toEqual([]);
  });
});

// A refusal the phone does not recognise reads as a plain sentence; the computer's own words go to the app log
// (`classifyFailure` in src/inventory/client.ts).
describe('a start that fails reports a plain sentence for the shared notice, the computer’s words in the app log', () => {
  const lastLogged = (): string | undefined => useAppLogStore.getState().entries.at(-1)?.message;

  test('a Global Action the computer does not have', async () => {
    const calls: Calls = [];
    answer('{"commandId":"g1","error":"Global quick action is not configured.","ok":false}', 1);
    await runQuickAction(host(calls), run(globalTerminal));
    expect(calls).toEqual([
      'progress Starting Git Status in Ghostex…',
      'progress closed',
      `failed Git Status: ${FailureCopy.computerRefused}`,
    ]);
    expect(lastLogged()).toBe('Unrecognised computer failure: Global quick action is not configured.');
  });

  test('a project action the computer no longer has', async () => {
    const calls: Calls = [];
    answer('{"commandId":"c1","error":"Quick action is not configured for this project.","ok":false}', 1);
    await runQuickAction(host(calls), run(projectTerminal));
    expect(calls).toEqual([
      'progress Starting Tests in Ghostex…',
      'progress closed',
      `failed Tests: ${FailureCopy.computerRefused}`,
    ]);
    expect(lastLogged()).toBe('Unrecognised computer failure: Quick action is not configured for this project.');
  });

  test('an error printed on stderr', async () => {
    const calls: Calls = [];
    answer('', 1, 'run-action --scope must be project or global.');
    await runQuickAction(host(calls), run(globalTerminal));
    expect(calls.at(-1)).toBe(`failed Git Status: ${FailureCopy.computerRefused}`);
    expect(lastLogged()).toBe('Unrecognised computer failure: run-action --scope must be project or global.');
  });

  test('no connection', async () => {
    const calls: Calls = [];
    exec.mockRejectedValue(new Error('Connection refused'));
    await runQuickAction(host(calls), run(projectTerminal));
    expect(calls).toEqual([
      'progress Starting Tests in Ghostex…',
      'progress closed',
      `failed Tests: ${FailureCopy.refused}`,
    ]);
  });

  test('a failure after the start is not reported as a failed start', async () => {
    const calls: Calls = [];
    answer('{"ok":true,"actionType":"terminal","commandId":"c1","session":{"sessionId":"s-new"}}');
    const refresh = async () => {
      throw new Error('Connection refused');
    };
    await runQuickAction(host(calls, { refresh }), run(projectTerminal));
    expect(calls).toEqual([
      'progress Starting Tests in Ghostex…',
      'refresh',
      'progress closed',
      // The message as the list read reports it, through the ordinary notice channel.
      'status Connection refused',
    ]);
  });
});

test('the Sessions handler sends a failed start through its ordinary notice channel', async () => {
  const setTransientStatus = jest.fn();
  const setProgress = jest.fn();
  const deps: SessionsScreenActionsDeps = {
    // A refused start never navigates; the navigation boundary is deliberately unused here.
    navigation: {} as SessionsScreenActionsDeps['navigation'],
    setOverlay: jest.fn(),
    setProgress,
    setTransientStatus,
    refreshMachine: jest.fn(),
    retryMachine: jest.fn(),
  };
  const machine = {
    id: 'm1',
    name: 'Mac',
    host: 'mac.local',
    username: 'me',
    port: 22,
    savePassword: false,
    lastConnectedAt: null,
  };
  answer('{"commandId":"c1","error":"Quick action is not configured for this project.","ok":false}', 1);
  const { result } = await renderHook(() => useSessionsScreenActions(deps));
  await act(async () => {
    result.current.runQuickAction(machine, 'p1', 'Ghostex', projectTerminal);
  });
  expect(setProgress).toHaveBeenLastCalledWith(null);
  expect(setTransientStatus).toHaveBeenCalledTimes(1);
  expect(setTransientStatus).toHaveBeenCalledWith(FailureCopy.computerRefused, {
    title: "Couldn't start Tests",
    error: true,
    announce: true,
  });
  expect(useAppLogStore.getState().entries.at(-1)?.message).toBe(
    'Unrecognised computer failure: Quick action is not configured for this project.',
  );
});

describe('browser actions open the URL from the summary, without a command', () => {
  for (const scope of ['project', 'global'] as const) {
    test(`${scope}: a loopback URL opens the Web Preview for remote port 3000 and path /docs`, async () => {
      const calls: Calls = [];
      const entry: QuickActionEntry = {
        scope,
        action: { actionType: 'browser', commandId: 'c3', name: 'Docs', url: 'http://localhost:3000/docs' },
      };
      await runQuickAction(host(calls), run(entry));
      expect(calls).toEqual(['preview http://localhost:3000/docs']);
      expect(exec).not.toHaveBeenCalled();
    });

    test(`${scope}: a public URL opens once in the phone's browser`, async () => {
      const calls: Calls = [];
      const entry: QuickActionEntry = {
        scope,
        action: { actionType: 'browser', commandId: 'g2', name: 'Status Page', url: 'https://example.com/' },
      };
      await runQuickAction(host(calls), run(entry));
      expect(calls).toEqual(['browser https://example.com/', 'status Opened Status Page in the browser.']);
      expect(exec).not.toHaveBeenCalled();
    });

    test(`${scope}: an empty URL opens nothing`, async () => {
      const calls: Calls = [];
      const entry: QuickActionEntry = {
        scope,
        action: { actionType: 'browser', commandId: 'c3', name: 'Docs', url: '' },
      };
      await runQuickAction(host(calls), run(entry));
      expect(calls).toEqual([]);
      expect(exec).not.toHaveBeenCalled();
    });
  }

  test('a global browser action does not open once the summary no longer offers Global Actions', async () => {
    const calls: Calls = [];
    const entry: QuickActionEntry = {
      scope: 'global',
      action: { actionType: 'browser', commandId: 'g2', name: 'Status Page', url: 'https://example.com/' },
    };
    await runQuickAction(host(calls, { globalSupported: false }), run(entry));
    expect(calls).toEqual([`failed Status Page: ${ActionCopy.globalActionsUnavailable}`]);
  });
});
