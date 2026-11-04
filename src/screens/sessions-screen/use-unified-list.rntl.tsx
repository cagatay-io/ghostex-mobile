/// <reference types="jest" />
/** The Unified list counts working time only while Sessions is in front. */
import { FlatList } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { parseMobileSummary, type GhostexMobileSummary } from '../../contract/mobileSummary';
import { emptyMachineInventory, useInventoryStore } from '../../inventory/store';
import type { MachineRecord } from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { useUnifiedList, useUnifiedListStore } from './use-unified-list';

jest.mock('../../../modules/ghostex-native/src', () => ({ GhostexNative: { addListener: () => ({ remove() {} }) } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../updates/updateNotice', () => ({ useUpdateNotice: () => null }));
jest.mock('../../voice/VoiceButton', () => ({ voiceAgentOnFor: () => false }));
jest.mock('../../voice/conversation', () => ({ VOICE_SUPPORTED: false }));
jest.mock('../../voice/callAbout', () => ({ callVoiceAbout: jest.fn() }));
jest.mock('../../chat/rust/machine-link', () => ({ chatMachineLink: jest.fn() }));
// The card's swipe row needs Reanimated's native runtime: a plain row.
jest.mock('../machines-screen/SwipeRevealRow', () => {
  const { View: PlainRow } = jest.requireActual('react-native');
  return { __esModule: true, default: PlainRow, SWIPE_REVEAL_WIDTH: 176 };
});
jest.mock('react-native-safe-area-context', () => {
  const { View: PlainView } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: PlainView };
});

function machineOf(id: string, name: string): MachineRecord {
  return { id, name, host: `${id}.local`, username: 'me', port: 22, savePassword: false, lastConnectedAt: null };
}

const MAC = machineOf('m1', 'Mac');

function wireSession(sessionId: string, projectId: string, title: string) {
  return {
    sessionId,
    projectId,
    title,
    agentIcon: 'claude',
    agentName: 'Claude',
    status: 'running',
    activity: 'idle',
    isLive: true,
    provider: 'zmx',
  };
}

function summaryOf(json: object): GhostexMobileSummary {
  const summary = parseMobileSummary(JSON.stringify({ ok: true, sidebarView: 'unified', ...json }));
  if (summary === null) throw new Error('fixture does not parse');
  return summary;
}

describe("the list's clock while an agent works", () => {
  const START = new Date('2026-11-02T10:00:00.000Z');
  let renders = 0;

  /** The Unified list of one computer whose one session has worked for a minute, as SessionsScreen draws it. */
  function ClockHarness({ focused }: { focused: boolean }) {
    renders += 1;
    const inventoriesByMachineId = useInventoryStore((state) => state.inventoriesByMachineId);
    const unified = useUnifiedList({
      machines: [MAC],
      selectedMachine: MAC,
      inventoriesByMachineId,
      selectedWorkspaceIdByMachine: {},
      selectedSessionKey: null,
      sidebarBackground: '#121212',
      focused,
      setOverlay: () => {},
      attach: async () => {},
      runBulkSessionActions: async () => {},
      snoozeSession: async () => {},
      openAddProject: () => {},
    });
    return <FlatList data={unified.items} renderItem={unified.renderItem} keyExtractor={unified.keyExtractor} />;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    useSettingsStore.setState({ hydrated: true, settings: { ...useSettingsStore.getState().settings, sessionsListLayout: 'unified', sessionsListWorkingSection: true, sessionsListGroupByProject: false } });
    const working = summaryOf({
      projects: [{ projectId: 'P1', name: 'Mac Project', path: '/mac/project' }],
      sessions: [
        {
          ...wireSession('w', 'P1', 'Worker'),
          activity: 'working',
          workingStartedAt: new Date(START.getTime() - 60_000).toISOString(),
        },
      ],
    });
    useInventoryStore.setState({
      inventoriesByMachineId: { m1: { ...emptyMachineInventory(), summary: working, serverSummary: working } },
    });
    // The Moving shelf open, so its card and the card's timer are drawn.
    useUnifiedListStore.setState({ hydrated: true, toggledShelves: ['working'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('in front it counts each second; behind another screen it does not wake; back in front it reads the time', async () => {
    const view = await render(<ClockHarness focused />);
    expect(screen.getByText('1m 0s')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText('1m 1s')).toBeTruthy();

    await view.rerender(<ClockHarness focused={false} />);
    const behind = renders;
    for (let second = 0; second < 10; second += 1) await act(() => jest.advanceTimersByTime(1_000));
    expect(renders).toBe(behind);

    await view.rerender(<ClockHarness focused />);
    expect(screen.getByText('1m 11s')).toBeTruthy();
  });
});
