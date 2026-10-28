/**
 * Keeps an open chat's session links current: re-reads the computer's summary now and once a minute
 * while the chat shows, since the Sessions list polls only while it is on screen and gxserver re-reads
 * a link's state once a minute. The Links pill on the chat's working card (`cards/WorkingCard.tsx`)
 * and its sheet (`SessionLinksSheet.tsx`) read the result. Moved from the links strip under the chat's
 * header, which the Links pill replaced (CDXC:SessionLinks 2026-10-28 in gx-core
 * `sidebar_view/links.rs`).
 */

import { useEffect } from 'react';

import { useInventoryStore } from '../../inventory/store';
import type { MachineRecord } from '../../machines/store';

const LINKS_REFRESH_MS = 60_000;

export function useSessionLinksRefresh(machine: MachineRecord | null, sessionId: string | undefined, active: boolean): void {
  useEffect(() => {
    if (!active || machine === null || sessionId === undefined) return;
    const refresh = () => void useInventoryStore.getState().refreshMachineFresh(machine);
    refresh();
    const timer = setInterval(refresh, LINKS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, machine, sessionId]);
}
