/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/SessionsScreen.newSession.rntl.tsx`. New session opens the agent picker in the right
 * project also when that project sits in a saved project collection, as on a computer whose projects are all in
 * collections ("Acme", "Internal").
 *
 * The Unified list has no project header: its New session button (the header's pencil) and a project group's "+" look
 * the project's header up from the computer's summary (`projectHeaderOf`, contract/grouping.ts). The Project list
 * draws a project in a collection only while that collection is open, and its "Select agent" takes the header it draws.
 * Both lists are tested here, with the picker's agent row tapped through to the `create-agent` command it sends.
 *
 * The real `SessionsScreen` with its real stores and a summary parsed by the real parser; mocked are the boundaries
 * only: the native module, the computer's CLI (`runGhostexCli`, recorded), storage, haptics, navigation focus, the
 * voice button and Reanimated's swipe row.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { useCollapseStore } from '../components/sessions/collapseStore';
import { parseMobileSummary, type GhostexMobileSummary } from '../contract/mobileSummary';
import { EMPTY_UNIFIED_FILTER } from '../contract/unified/build';
import { repoIdentity } from '../contract/unified/repo';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { defaultSettings, useSettingsStore } from '../settings/store';
import { useTerminalStore } from '../terminal/sessions';
import { useUnifiedListStore } from './sessions-screen/unified-list-store';
import SessionsScreen from './SessionsScreen';

/** Every command the screen sent to a computer's CLI, as `[machineId, command]`; none of them answers. */
const mockRun = jest.fn((_machine: { id: string }, _command: string) => new Promise<never>(() => undefined));

jest.mock('../components/sessions/cli', () => ({
  ...jest.requireActual('../components/sessions/cli'),
  runGhostexCli: (...args: [{ id: string }, string]) => mockRun(...args),
}));
jest.mock('../../modules/ghostex-native/src', () => {
  // Every native call resolves to nothing; listeners can be removed.
  const call = () => Promise.resolve(undefined);
  const native = new Proxy(
    {},
    { get: (_target, key) => (key === 'addListener' ? () => ({ remove: () => undefined }) : call) },
  );
  return { GhostexNative: native, GhostexTerminalView: () => null };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
}));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));
// The Unified list's swipe-to-reveal row runs on Reanimated, whose worklets runtime does not load under Jest.
jest.mock('./machines-screen/SwipeRevealRow', () => ({
  __esModule: true,
  SWIPE_REVEAL_WIDTH: 176,
  default: ({ children }: { children: unknown }) => children,
}));

/** The jest preset's `measureInWindow`, which answers nothing unless a test says what; "Select agent" measures. */
const measureInWindow = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default.measureInWindow;

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Studio',
  host: 'studio.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};
const MINI: MachineRecord = { ...MACHINE, id: 'm2', name: 'Mac mini', host: 'mini.local' };

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function session(sessionId: string, title: string, projectId: string, minutes: number): object {
  return {
    sessionId,
    projectId,
    title,
    status: 'idle',
    activity: 'idle',
    isLive: true,
    provider: 'zmx',
    agent: 'claude',
    lastInteractionAt: minutesAgo(minutes),
    createdAt: minutesAgo(600),
  };
}

const PROJECTS = [
  { projectId: 'P1', name: 'website', path: '/repo/website' },
  { projectId: 'P2', name: 'inventory', path: '/repo/inventory' },
  { projectId: 'P3', name: 'billing', path: '/repo/billing' },
];

/**
 * One computer: `inventory` in the collection "Internal", `billing` in "Acme", `website` in none. The most
 * recent session is in `inventory`, so it is the Unified list's top card.
 */
function summary(extra: object = {}): GhostexMobileSummary {
  const parsed = parseMobileSummary(
    JSON.stringify({
      ok: true,
      projects: PROJECTS,
      sessions: [
        session('s-inventory', 'Stock reconciliation', 'P2', 2),
        session('s-bill', 'Invoice export', 'P3', 30),
        session('s-web', 'Landing copy', 'P1', 90),
      ],
      agents: [{ agentId: 'claude', name: 'Claude', icon: 'claude' }],
      sidebarProjectCollections: {
        order: ['acme', 'internal'],
        collections: {
          acme: { title: 'Acme', color: '#3366cc', projectIds: ['P3'] },
          internal: { title: 'Internal', color: '#cc6633', projectIds: ['P2'] },
        },
      },
      ...extra,
    }),
  );
  if (parsed === null) throw new Error('the summary did not parse');
  return parsed;
}

/** The repository key the Unified filter's Projects section picks a project by. */
function repoKeyOf(projectId: string): string {
  const project = PROJECTS.find((entry) => entry.projectId === projectId)!;
  return repoIdentity(null, project.path, null, project.name).key;
}

type Setup = {
  extra?: object;
  /** A second computer, "Mac mini", with the same projects in the same collections. */
  withMini?: boolean;
  /** The open session, as its id on the machine. */
  openSessionId?: string | null;
  /** The Unified filter's one project, by project id. */
  filterProjectId?: string;
  expandedProjects?: string[];
  expandedCollections?: string[];
};

async function renderSessions({
  extra = {},
  withMini = false,
  openSessionId = null,
  filterProjectId,
  expandedProjects = [],
  expandedCollections = [],
}: Setup = {}): Promise<void> {
  const parsed = summary(extra);
  const machines = withMini ? [MACHINE, MINI] : [MACHINE];
  useSettingsStore.setState({ hydrated: true, settings: defaultSettings() });
  useMachinesStore.setState({ hydrated: true, machines, selectedMachineId: MACHINE.id });
  useInventoryStore.setState({
    inventoriesByMachineId: Object.fromEntries(
      machines.map((machine) => [
        machine.id,
        { ...emptyMachineInventory(), summary: parsed, serverSummary: parsed, hasLoaded: true },
      ]),
    ),
  });
  useTerminalStore.setState({ selectedSessionKey: openSessionId === null ? null : `${MACHINE.id}:${openSessionId}` });
  useCollapseStore.setState({
    hydrated: true,
    expandedProjectsByMachine: { [MACHINE.id]: expandedProjects },
    expandedCollectionsByMachine: { [MACHINE.id]: expandedCollections },
  });
  useUnifiedListStore.setState({
    hydrated: true,
    filter:
      filterProjectId === undefined
        ? EMPTY_UNIFIED_FILTER
        : { ...EMPTY_UNIFIED_FILTER, repos: [repoKeyOf(filterProjectId)] },
    toggledShelves: [],
    foldedGroups: [],
    lastMachines: {},
    recentRepos: [],
  });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <SessionsScreen
        navigation={{ navigate: () => undefined } as never}
        route={{ key: 'sessions', name: 'Sessions' } as never}
      />
    </SafeAreaProvider>,
  );
  await act(async () => undefined);
}

async function press(label: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

/** iOS presents the next modal only after the current menu or sheet has finished dismissing. */
async function pressAndDismiss(target: TestInstance): Promise<void> {
  const modal = screen.container.queryAll((entry) => entry.props.visible === true && typeof entry.props.onDismiss === 'function')[0];
  if (modal === undefined) throw new Error('no visible modal to dismiss');
  const onDismiss = modal.props.onDismiss;
  await act(async () => fireEvent.press(target));
  await act(async () => onDismiss());
}

/**
 * The agent picker is open for `title`, and its agent row starts that agent in `projectId` on the computer `machineId`:
 * the `create-agent` command the tap sends names the project and goes to that computer.
 */
async function expectPickerStarting(title: string, projectId: string, machineId = MACHINE.id): Promise<void> {
  expect(screen.getByText('Start an agent session')).toBeTruthy();
  expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  expect(screen.getByText('New Coordinator…')).toBeTruthy();
  mockRun.mockClear();
  await pressAndDismiss(screen.getByText('Claude'));
  const launches = mockRun.mock.calls.filter(([, command]) => command.startsWith('ghostex create-agent '));
  expect(launches).toHaveLength(1);
  const [machine, command] = launches[0];
  expect(machine.id).toBe(machineId);
  expect(command).toMatch(new RegExp(`--project-id '?${projectId}'? `));
}

beforeEach(() => {
  mockRun.mockClear();
  measureInWindow.mockImplementation((frame: (...values: number[]) => void) => frame(0, 100, 320, 30));
});

afterEach(() => {
  measureInWindow.mockReset();
});

describe('the Unified list, projects in collections', () => {
  const UNIFIED = { sidebarView: 'unified' };

  test('New session with the filter on All opens the picker in the first project choice ("Acme")', async () => {
    await renderSessions({ extra: UNIFIED });
    await press('New session');
    await expectPickerStarting('billing', 'P3');
  });

  test('New session with the filter on one project opens the picker in that project ("Acme")', async () => {
    await renderSessions({ extra: UNIFIED, filterProjectId: 'P3' });
    await press('New session');
    await expectPickerStarting('billing', 'P3');
  });

  test("New session with a session open opens the picker in the open session's project", async () => {
    await renderSessions({ extra: UNIFIED, openSessionId: 's-bill' });
    await press('New session');
    await expectPickerStarting('billing', 'P3');
  });

  test('a project group\'s "+" opens the picker in that project', async () => {
    await renderSessions({ extra: { ...UNIFIED, unifiedGroupByProject: true } });
    await press('New session in inventory');
    await expectPickerStarting('inventory', 'P2');
  });

  test('a project group\'s "+" on two computers opens the picker on the computer picked', async () => {
    await renderSessions({ extra: { ...UNIFIED, unifiedGroupByProject: true }, withMini: true });
    await press('New session in inventory');
    await pressAndDismiss(screen.getByRole('button', { name: 'Project: inventory on Studio. Tap to change' }));
    await pressAndDismiss(screen.getByRole('button', { name: 'inventory on Mac mini' }));
    await expectPickerStarting('inventory', 'P2', MINI.id);
  });

  test('a project outside every collection keeps its picker', async () => {
    await renderSessions({ extra: UNIFIED, filterProjectId: 'P1' });
    await press('New session');
    await expectPickerStarting('website', 'P1');
  });
});

describe('the Project list, a project in a collection', () => {
  test('its open header\'s "Select agent" opens the picker in that project', async () => {
    await renderSessions({ expandedCollections: ['internal'], expandedProjects: ['id:P2'] });
    await press('Select agent');
    await expectPickerStarting('inventory', 'P2');
  });

  test('a closed collection draws no project header, so no picker can be asked for there', async () => {
    await renderSessions({ expandedProjects: ['id:P2'] });
    expect(screen.getByLabelText('Internal')).toBeTruthy();
    expect(screen.queryByLabelText('Select agent')).toBeNull();
  });
});
