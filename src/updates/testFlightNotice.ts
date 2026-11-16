/**
 * The TestFlight goodbye: 11.8.0 is the last TestFlight build, so a TestFlight install says once that
 * new versions come only on the App Store and offers to open Ghostex there. Shown only when iOS says
 * this install came from TestFlight (resolveInstallSource: StoreKit's AppTransaction environment is
 * `sandbox`); App Store installs (`production`), Android, development builds and the simulator
 * (`xcode`, or no update server) never see it, and an install StoreKit can't answer for yet (offline)
 * is asked again at the next launch. Open the App Store counts as seen; Later brings it back at the
 * next launch, at most once a day.
 *
 * What carries over: the computer list is in the app's own storage and the pairing tokens and this
 * phone's key are in the keychain. Installing the App Store app over this one is an update of the same
 * bundle id, so both stay; deleting this app first loses the computer list, hence the copy's "without
 * deleting this app first".
 *
 * CDXC:Release 2026-11-16 DECISION: User: "make this the last one, and in it please tell people to switch to the app store version because test flight version wont be getting anymore updates (do this just for test flight version, show a notice when they open the app after update)".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { openStorePage, resolveInstallSource } from './installSource';

export const TESTFLIGHT_NOTICE_KEY = 'testFlightNotice.11.8.0';
const DAY_MS = 24 * 60 * 60 * 1000;

export type TestFlightNoticeState = {
  seen?: boolean;
  /** When Later was last tapped (ms). */
  laterAt?: number;
};

/** Whether the notice should open now. */
export function testFlightNoticeDue(state: TestFlightNoticeState, now: number): boolean {
  return state.seen !== true && (state.laterAt === undefined || now - state.laterAt >= DAY_MS);
}

async function readState(): Promise<TestFlightNoticeState> {
  const raw = await AsyncStorage.getItem(TESTFLIGHT_NOTICE_KEY).catch(() => null);
  if (raw === null) return {};
  try {
    return JSON.parse(raw) as TestFlightNoticeState;
  } catch {
    return {};
  }
}

function writeState(state: TestFlightNoticeState): void {
  void AsyncStorage.setItem(TESTFLIGHT_NOTICE_KEY, JSON.stringify(state)).catch(() => undefined);
}

export const useTestFlightNotice = create<{ visible: boolean; openError: string | null }>()(() => ({
  visible: false,
  openError: null,
}));

let checked = false;

/** At launch: opens the notice when this is a TestFlight install that hasn't seen it. */
export function initTestFlightNotice(): void {
  if (checked) return;
  checked = true;
  void (async () => {
    if ((await resolveInstallSource()) !== 'testflight') return;
    if (!testFlightNoticeDue(await readState(), Date.now())) return;
    useTestFlightNotice.setState({ visible: true });
  })();
}

/** Open the App Store: counts as seen, and the notice closes once the App Store opens. */
export async function openAppStoreFromNotice(): Promise<void> {
  try {
    await openStorePage('appStore');
  } catch (error) {
    useTestFlightNotice.setState({ openError: error instanceof Error ? error.message : String(error) });
    return;
  }
  writeState({ seen: true });
  useTestFlightNotice.setState({ visible: false, openError: null });
}

/** Later: back at the next launch a day or more from now. */
export function laterTestFlightNotice(): void {
  writeState({ laterAt: Date.now() });
  useTestFlightNotice.setState({ visible: false, openError: null });
}
