/**
 * Audible/haptic alerts.
 * - Terminal bell (BEL from either native engine) routed per the
 *   "Alerts and hardware keys" setting: vibrate (haptics), beep (native app
 *   sound), or ignore. Throttled so bell storms cannot queue endless feedback.
 * - Attention notification sound: detects remote sessions TRANSITIONING into
 *   attention/done across inventory refreshes (never re-alerts on unchanged
 *   states or on the first snapshot) and plays the native attention sound when
 *   settings.doneNotificationSound is enabled. Independent of the terminal bell.
 *   The sound goes through the gate agent notifications share
 *   (`announceAttentionTransitions` in `src/notifications/notify.ts`): when
 *   the computer names the attention's feed row (and announces that it does,
 *   capability `attentionNotificationId`), the event sounds once, whichever
 *   route announces it first; without that name the sound and the row's
 *   notification are separate announcements (`eventIdentity.ts`, rule 2), and
 *   since the sound usually comes first, the one-per-session limit then
 *   usually holds the row's notification back: the person gets the sound and
 *   the list row. Both share the same rate limit. A pass waits until the
 *   record of announced events has read what the last launch stored.
 */

import * as Haptics from 'expo-haptics';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { displayStatus } from '../contract/mobileSummary';
import { useInventoryStore } from '../inventory/store';
import { announcedEvents, attentionKey, type EventIdentity } from '../notifications/eventIdentity';
import { announceAttentionTransitions } from '../notifications/notify';
import { useSettingsStore } from '../settings/store';
import { sessionOnScreen } from '../terminal/zmxDisplay';
import { logAppEvent } from './appLog';

const BELL_THROTTLE_MS = 250;

/** Statuses whose *entry* should alert the user. */
const ALERT_STATUSES = new Set(['attention', 'done']);

let installed = false;
let lastBellAt = 0;
/** `${machineId}:${sessionId}` → last seen display status. */
const lastStatusBySession = new Map<string, string>();
/** Machines whose sessions have been observed at least once (no first-snapshot alerts). */
const observedMachines = new Set<string>();

function handleBell(): void {
  const { settings, hydrated } = useSettingsStore.getState();
  if (!hydrated || settings.bellBehavior === 'ignore') return;
  const now = Date.now();
  if (now - lastBellAt < BELL_THROTTLE_MS) return;
  lastBellAt = now;
  if (settings.bellBehavior === 'vibrate') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    return;
  }
  void GhostexNative.playAlertSound('bell').catch(() => undefined);
}

function scanInventoryTransitions(): void {
  const inventories = useInventoryStore.getState().inventoriesByMachineId;
  const entered: EventIdentity[] = [];
  /** Sessions the list shows out of attention or no longer lists: their next attention is a new event. */
  const left: { machineId: string; sessionId: string }[] = [];

  for (const [machineId, inventory] of Object.entries(inventories)) {
    const summary = inventory.summary;
    if (summary === null) continue;
    const firstSnapshot = !observedMachines.has(machineId);
    const seenKeys = new Set<string>();

    for (const session of summary.sessions) {
      const key = `${machineId}:${session.sessionId}`;
      seenKeys.add(key);
      const status = displayStatus(session);
      const previous = lastStatusBySession.get(key);
      lastStatusBySession.set(key, status);
      if (!ALERT_STATUSES.has(status)) left.push({ machineId, sessionId: session.sessionId });
      if (firstSnapshot || previous === undefined) continue;
      if (previous !== status && ALERT_STATUSES.has(status) && !ALERT_STATUSES.has(previous)) {
        // The list names no event kind; its attention is the feed row the computer names for it, else an event of
        // its own (`eventIdentity.ts`, rule 2). A row id from a computer that does not announce it is not used.
        entered.push({
          machineId,
          sessionId: session.sessionId,
          kind: null,
          rowId: summary.capabilities.attentionNotificationId ? session.attentionNotificationId : '',
          episode: attentionKey(session.attentionEventId, session.attentionEnteredAt),
        });
      }
    }

    // Drop sessions that disappeared so a later reappearance is a fresh observation.
    for (const key of lastStatusBySession.keys()) {
      if (key.startsWith(`${machineId}:`) && !seenKeys.has(key)) {
        lastStatusBySession.delete(key);
        left.push({ machineId, sessionId: key.slice(machineId.length + 1) });
      }
    }
    observedMachines.add(machineId);
  }

  if (left.length === 0 && entered.length === 0) return;
  announceAttentionTransitions(left, entered, {
    announced: announcedEvents,
    soundOn: () => {
      const { settings, hydrated } = useSettingsStore.getState();
      return hydrated && settings.doneNotificationSound;
    },
    onScreen: sessionOnScreen,
    play: playAttentionSound,
    log: logAppEvent,
  });
}

/** Plays the native attention sound once (for the events the pass announced). */
function playAttentionSound(): void {
  void GhostexNative.playAlertSound('attention').catch(() => undefined);
}

/** Install once at app startup; subscriptions live for the app's lifetime. */
export function initAlerts(): void {
  if (installed) return;
  installed = true;
  GhostexNative.addListener('onTerminalBell', handleBell);
  useInventoryStore.subscribe(scanInventoryTransitions);
}
