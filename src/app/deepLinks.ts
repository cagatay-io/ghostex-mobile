/**
 * ghostex:// deep links. The Android persistent notification's session rows and the agent
 * notifications fire `ghostex://session?machineId=…&sessionId=…`; handling one opens the session the
 * way a tap in the Sessions list does (reusing the warm tab when it exists) and navigates to the
 * Terminal screen, including from a cold start, where handling waits for the stores that decide or
 * overwrite the session's view (`deepLinkStoresReady`) and for navigation readiness. The rules live in
 * `deepLinkHandler.ts`; this file wires them to the stores.
 *
 * Pairing links: the computer's QR is `https://ghostex.dev/pair#ghostex-ec1:…` (an Android App Link
 * and iOS Universal Link this app claims in app.json), so scanning it with the phone's own camera
 * opens the app here; the Scan code screen then pairs exactly as if its scanner had read the QR.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import { Linking } from 'react-native';

import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { sessionHasChatView, sessionOpensInChatView } from '../screens/terminal-screen/session-lookups';
import { useSettingsStore } from '../settings/store';
import { attachSessionKey, useTerminalStore } from '../terminal/sessions';
import { revealSessionWorkspace } from '../workspaces/store';
import { handleDeepLink, type DeepLinkDeps } from './deepLinkHandler';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let installed = false;
let pendingNavigation: (() => void) | null = null;

/** Flush a navigation deferred until NavigationContainer became ready. */
export function flushPendingDeepLink(): void {
  const run = pendingNavigation;
  pendingNavigation = null;
  run?.();
}

function navigateWhenReady(run: () => void): void {
  if (navigationRef.isReady()) run();
  else pendingNavigation = run;
}

/**
 * The saved computers, Settings (the Default Agent View) and the terminal's saved per-session views are
 * loaded. Until then a link's view could be chosen from defaults or be overwritten by the loading: the
 * terminal store's hydration replaces every session's view choice.
 */
export function deepLinkStoresReady(): boolean {
  return (
    useMachinesStore.getState().hydrated && useSettingsStore.getState().hydrated && useTerminalStore.getState().hydrated
  );
}

const appDeps: DeepLinkDeps = {
  storesReady: deepLinkStoresReady,
  machine: (machineId) => {
    const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
    if (machine === undefined) return undefined;
    return {
      id: machine.id,
      host: machine.host,
      username: machine.username,
      port: machine.port,
      transport: machine.transport,
    };
  },
  session: (machineId, sessionId) => {
    const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary;
    const session = summary?.sessions.find((entry) => entry.sessionId === sessionId);
    if (session === undefined) return undefined;
    return {
      projectId: session.projectId,
      title: session.displayTitle,
      hasChatView: sessionHasChatView(session),
      opensInChatView: sessionOpensInChatView(attachSessionKey(machineId, sessionId), session),
    };
  },
  loadSession: async (machineId, sessionId) => {
    const machine = useMachinesStore.getState().machines.find((entry) => entry.id === machineId);
    // A read that starts now: one already under way may have its answer from before the tap.
    if (machine !== undefined) await useInventoryStore.getState().refreshMachineFresh(machine);
    return appDeps.session(machineId, sessionId);
  },
  revealWorkspace: revealSessionWorkspace,
  openChatTab: (machine, session) => useTerminalStore.getState().openChatTab(machine, session),
  showChatView: (sessionKey) => useTerminalStore.getState().setSessionViewMode(sessionKey, 'chat'),
  attachSession: (machine, session) => useTerminalStore.getState().attachSession(machine, session),
  navigate: (route) =>
    navigateWhenReady(() => {
      if (route.name === 'Terminal') navigationRef.navigate('Terminal', route.params);
      else if (route.name === 'Voice') navigationRef.navigate('Voice');
      else
        navigationRef.navigate({
          name: 'ScanCode',
          params: { incomingCode: { payload: route.url, at: Date.now() } },
          merge: true,
        });
    }),
  later: (retry) => setTimeout(retry, 250),
};

/** Opens a ghostex:// link from inside the app (an agent notification's tap). */
export function openDeepLink(url: string): void {
  handleDeepLink(url, appDeps);
}

/** Install once at app startup; handles both cold-start and warm URLs. */
export function initDeepLinks(): void {
  if (installed) return;
  installed = true;
  void Linking.getInitialURL().then((url) => handleDeepLink(url ?? null, appDeps));
  Linking.addEventListener('url', (event) => handleDeepLink(event.url, appDeps));
}
