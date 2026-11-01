/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Without the agents' start times and attention kind no activity starts, and Settings ›
 * Live Activity says that the Mac needs an update: while a computer with agents does not send them, Settings › Live
 * Activity says which Mac needs an update; with every computer current it says nothing of the kind. The real page,
 * the real machines and inventory stores and the real summary parser; only the layout primitives and the preview are
 * stubbed. And the page's own entry on the Settings home: its words live in `src/copy.ts`.
 */

import { render, type RenderResult } from '@testing-library/react-native';

import { LiveActivityCopy } from '../../copy';
import { parseMobileSummary } from '../../contract/mobileSummary';
import { emptyMachineInventory, useInventoryStore } from '../../inventory/store';
import { useMachinesStore, type MachineRecord } from '../../machines/store';
import LiveActivityPage from './LiveActivityPage';
import { SETTINGS_PAGES } from './pages';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('./SettingsControls', () => {
  const { createElement } = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  return {
    SettingsScreenLayout: ({ children }: { children: unknown }) => createElement(View, null, children),
    SettingToggle: () => null,
    SectionHeader: () => null,
    Caption: ({ children }: { children: string }) => createElement(Text, { testID: 'caption' }, children),
  };
});
jest.mock('./LiveActivityPreview', () => () => null);

function machine(id: string, name: string): MachineRecord {
  return { id, name, host: `${id}.local`, username: 'me', port: 22, savePassword: false, lastConnectedAt: null };
}

function loaded(sessions: object[]) {
  const summary = parseMobileSummary(JSON.stringify({ sessions }));
  if (summary === null) throw new Error('summary did not parse');
  return { ...emptyMachineInventory(), summary, hasLoaded: true, loadedAt: Date.parse('2026-10-29T20:00:00Z') };
}

const agent = { provider: 'zmx', agent: 'claude', projectName: 'p' };
const currentHost = loaded([
  { ...agent, sessionId: 'a', activity: 'working', workingStartedAt: '2026-10-29T19:50:00Z' },
  {
    ...agent,
    sessionId: 'b',
    activity: 'attention',
    attention: { enteredAt: '2026-10-29T19:55:00Z', kind: 'needsInput' },
  },
]);
const olderHost = loaded([{ ...agent, sessionId: 'c', activity: 'working' }]);

function captions(screen: RenderResult): string[] {
  return screen.queryAllByTestId('caption').map((node) => String(node.props.children));
}

beforeEach(() => {
  useMachinesStore.setState({ machines: [machine('m1', 'Mac mini'), machine('m2', 'MacBook Air')] });
});

test('a Mac whose summary lacks workingStartedAt is named as needing an update', async () => {
  useInventoryStore.setState({ inventoriesByMachineId: { m1: currentHost, m2: olderHost } });
  const screen = await render(<LiveActivityPage />);
  expect(captions(screen)).toContain(
    'MacBook Air needs a newer Ghostex for the Live Activity. Update Ghostex on that Mac; until then no Live Activity starts.',
  );
  expect(captions(screen).some((text) => text.includes('Mac mini'))).toBe(false);
});

test('with every Mac current the page asks for no update', async () => {
  useInventoryStore.setState({ inventoriesByMachineId: { m1: currentHost, m2: currentHost } });
  const screen = await render(<LiveActivityPage />);
  expect(captions(screen).some((text) => text.includes('newer Ghostex'))).toBe(false);
});

test('a disabled Mac is not named', async () => {
  useMachinesStore.setState({
    machines: [machine('m1', 'Mac mini'), { ...machine('m2', 'MacBook Air'), disabled: true }],
  });
  useInventoryStore.setState({ inventoriesByMachineId: { m1: currentHost, m2: olderHost } });
  const screen = await render(<LiveActivityPage />);
  expect(captions(screen).some((text) => text.includes('newer Ghostex'))).toBe(false);
});

test('the title and description of the page on the Settings home come from src/copy.ts', () => {
  expect(SETTINGS_PAGES.liveActivity).toEqual({
    title: LiveActivityCopy.pageTitle,
    description: LiveActivityCopy.pageDescription,
  });
  expect(LiveActivityCopy.pageTitle).toBe('Live Activity');
});
