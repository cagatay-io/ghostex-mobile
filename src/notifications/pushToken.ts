/**
 * The phone's Expo push token on its computers. With iOS's permission, the master switch on and a build that
 * has a push project (the EAS project id), the app fetches the token and registers it with every enabled
 * computer over the existing authenticated warm link (`registerPushToken`, `{action: 'register', token, machineId,
 * kinds, deviceId?}`); `machineId` is the phone's own id for that computer (its `MachineRecord.id`), which the
 * computer keeps with the token and returns as `data.machineId` in every push, so the phone knows which computer a
 * push comes from. `kinds` are the finished, waiting and error switches: the computer pushes no kind that is off.
 * `deviceId` is the pairing device id of a computer paired by QR code (none for one added by SSH), so unpairing the
 * phone on that computer can delete its token; a pairing id the route does not take is left out (logged, without
 * the id), so the computer still takes the token, but unpairing there cannot find it. A computer keeps one token
 * per phone, under that phone's `machineId`, and replaces it at that phone's next registration. With the master
 * switch off the app asks each enabled computer to remove it (`{action: 'unregister', machineId}`), so no push
 * leaves the computers; turned on again, it registers again.
 *
 * Each pass (`sync`) runs at an occasion: the app starts or returns, the master switch, the finished, waiting or
 * error switch or the permission changes, a computer is added, shown again or paired anew (`tokenChanged`: iOS
 * issued a new token). A computer that took exactly what is wanted now (token, switches, pairing id) is not asked
 * again; one that did not take a request is asked again at the next occasion, never in a loop, so a switch change
 * that does not reach a computer takes effect there at the next registration it takes. A computer whose Ghostex does
 * not know the route has no push, and one the phone reaches only on the exec route cannot be asked: neither is asked
 * again (also not for a switch change) until the app starts again or the token changes. With the master switch off
 * at launch, each enabled computer is asked once to remove the token, because an earlier launch may have registered
 * it. What the person or iOS changed during a pass wins: a token fetched before iOS issued a newer one is never kept
 * or sent, and before each request the pass checks that the master switch and the token still ask for it, once more
 * when the computer's route is known, right before the request is handed to the link (`send`, `superseded`); if
 * not, it stops and the pass that follows sends what is wanted now. A switch change during a pass gets the pass that
 * follows, which sends the switches as they are then to each computer that took others. A request already handed to
 * the link is not called back: what the computer answered is kept, and the following pass corrects it, except for a
 * computer whose removal started (below).
 *
 * Removing a computer (`removing`, while its saved record still exists): once the first ask was answered (before it
 * this phone never registered), the app first asks that computer, hidden or not, to remove the token, whatever the
 * master switch and the phone's token say now, because an earlier registration may still be there. The removal
 * names this phone's `machineId`, so it removes this phone's token only. The removal waits for the answer at most
 * `REMOVAL_WAIT_MS`; then the computer is removed anyway: one that did not take the removal keeps the token, and
 * nothing asks it again on its own (a second Remove the person confirms during the wait asks again, and the screen
 * removes it again). From the start of its removal, for the rest of the launch, no pass sends that computer anything
 * and none corrects it: a registration a pass handed to the link before can still reach it after the removal, and
 * then it keeps the token. When removing it on the phone fails after the removal went out, it stays saved but gets
 * no registration until the app starts again.
 *
 * The app learns what each computer confirmed (`accepted`): it took the token (true), or it holds none (false: it
 * removed the token, or its Ghostex has no push route). Anything else confirms nothing, because a computer keeps the
 * token it holds until it takes a new registration or a removal: a refused request, an answer the phone cannot read,
 * a computer out of reach or on the exec route. What it took before then stays as the app knew it; the app keeps
 * that across launches (`setPushAccepted` in `eventIdentity.ts`), ids only. A computer the app never heard confirm
 * is not counted as holding the token, also when a request went out and its answer was lost.
 *
 * The token is a send credential: it is kept in memory only, goes nowhere but the computers' warm link, and no
 * log line carries it. Kept free of React Native so it is testable under `bun test`.
 */

import type { PermissionState } from './firstAsk';
import type { NotificationSettings } from './settings';

/** The finished, waiting and error switches as a registration carries them: the computer pushes no kind that is off. */
export type PushKinds = { finished: boolean; waiting: boolean; error: boolean };

/** One request of the `registerPushToken` route; each names the computer by the phone's own id for it. */
export type PushTokenParams =
  | { action: 'register'; token: string; machineId: string; kinds: PushKinds; deviceId?: string }
  | { action: 'unregister'; machineId: string };

/**
 * How a computer answered: it took the request; its Ghostex does not know the route (`unsupported`); the phone
 * reaches it only on the exec route, without its gxserver's API (`legacy`); it could not be reached; it did not
 * take the request (`refused`: it refused it, or its answer could not be read); or the request was not sent,
 * because the master switch or the token changed while it was prepared (`superseded`).
 */
export type PushTokenSendOutcome = 'done' | 'unsupported' | 'legacy' | 'unreachable' | 'refused' | 'superseded';

export type PushTokenDeps = {
  /** iOS's notification permission now. */
  permission(): Promise<PermissionState>;
  settings(): NotificationSettings;
  /** The build's push project (EAS project id); null when the build has none. */
  projectId(): string | null;
  /** Fetches the Expo push token for the project; rejects when iOS or Expo give none. */
  obtainToken(projectId: string): Promise<string>;
  /**
   * The enabled computers, by the phone's own id for each (`MachineRecord.id`), with the pairing device id of one
   * paired by QR code.
   */
  machines(): readonly { id: string; label: string; deviceId?: string }[];
  /**
   * One request to a computer's gxserver over the warm link; `current` tells whether the pass still wants it sent,
   * checked right before it is handed to the link.
   */
  send(machineId: string, params: PushTokenParams, current: () => boolean): Promise<PushTokenSendOutcome>;
  /** A computer confirmed that it holds this phone's token (true) or that it holds none (false). */
  accepted(machineId: string, holds: boolean): void;
  log(message: string): void;
  /** A timer of `ms`: `expired` resolves when it ran out; `cancel` stops it. */
  startTimer(ms: number): { expired: Promise<void>; cancel(): void };
};

/** How long removing a computer waits for its answer to the removal of the token. */
export const REMOVAL_WAIT_MS = 2_000;

/** An Expo push token as the computer accepts it (the registration's schema). */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,64}\]$/u;

/** A pairing device id as the computer accepts it (the registration's schema): 1 to 128 visible ASCII characters. */
const DEVICE_ID = /^[\x21-\x7e]{1,128}$/u;

/** Whether a computer that took `taken` holds what `wanted` asks for: the same token, switches and pairing id. */
function holdsAlready(taken: PushTokenParams, wanted: PushTokenParams): boolean {
  if (taken.action === 'unregister' || wanted.action === 'unregister') return taken.action === wanted.action;
  return (
    taken.token === wanted.token &&
    taken.deviceId === wanted.deviceId &&
    taken.kinds.finished === wanted.kinds.finished &&
    taken.kinds.waiting === wanted.kinds.waiting &&
    taken.kinds.error === wanted.kinds.error
  );
}

export class PushTokenRegistration {
  private token: string | null = null;
  /** How often iOS issued a new token: a fetch that began before the latest issue is stale. */
  private tokenIssues = 0;
  /** Per enabled computer, the request it took last in this launch: a registration, or the removal. */
  private readonly taken = new Map<string, PushTokenParams>();
  /** Computers that have no push or cannot be asked, until the app starts again or the token changes. */
  private readonly unsupported = new Set<string>();
  /** Computers the person removes in this launch, from the start of their removal: no pass sends them anything. */
  private readonly removed = new Set<string>();
  private toldNoProject = false;
  private running: Promise<void> | null = null;
  private again: Promise<void> | null = null;

  constructor(private readonly deps: PushTokenDeps) {}

  /** One pass now; an occasion during a pass gets one more pass after it, shared by every such occasion. */
  sync(): Promise<void> {
    if (this.running === null) {
      this.running = this.pass().finally(() => {
        this.running = null;
      });
      return this.running;
    }
    this.again ??= this.running.then(() => {
      this.again = null;
      return this.sync();
    });
    return this.again;
  }

  /** iOS issued a new token: it is fetched anew and goes to every computer, those without push included. */
  tokenChanged(): Promise<void> {
    this.token = null;
    this.tokenIssues += 1;
    this.unsupported.clear();
    return this.sync();
  }

  /** Whether removing a computer asks it to remove the token: once the first ask was answered, as `removing` does. */
  asksOnRemoval(): boolean {
    // Before the first ask was answered this phone never registered.
    return this.deps.settings().askedAt !== undefined;
  }

  /**
   * The person removes `machine` (hidden or not) and its saved record still exists: when `asksOnRemoval`, the
   * computer is asked once to remove the token. Resolves with its answer, or when `REMOVAL_WAIT_MS` ran out; never
   * throws. Nothing asks it again unless the person removes it again, and no pass sends it anything for the rest of
   * the launch.
   */
  async removing(machine: { id: string; label: string }): Promise<void> {
    this.removed.add(machine.id);
    if (!this.asksOnRemoval()) return;
    const timer = this.deps.startTimer(REMOVAL_WAIT_MS);
    let waiting = true;
    const answer = this.deps
      .send(machine.id, { action: 'unregister', machineId: machine.id }, () => waiting)
      .catch((): PushTokenSendOutcome => 'unreachable');
    const outcome = await Promise.race([answer, timer.expired.then(() => null)]);
    // A request not yet handed to the link is not sent once the removal stopped waiting; a later answer is moot.
    waiting = false;
    timer.cancel();
    if (outcome === null) {
      const seconds = REMOVAL_WAIT_MS / 1000;
      this.deps.log(
        `${machine.label}: no answer to the push token removal within ${seconds} s; the computer may keep it`,
      );
    } else if (outcome === 'done' || outcome === 'unsupported') {
      this.deps.accepted(machine.id, false);
      this.deps.log(`${machine.label}: push token ${outcome === 'done' ? 'removed' : 'removal not needed (no push)'}`);
    } else {
      this.deps.log(`${machine.label}: push token removal not taken (${outcome}); the computer may keep it`);
    }
  }

  private async pass(): Promise<void> {
    const machines = this.deps.machines();
    const enabled = new Set(machines.map((machine) => machine.id));
    // A hidden or removed computer gets the token again when it is shown again.
    for (const id of [...this.taken.keys()]) if (!enabled.has(id)) this.taken.delete(id);
    const wanted = await this.wantedToken();
    if (wanted === undefined) return;
    for (const machine of machines) {
      if (this.removed.has(machine.id) || this.unsupported.has(machine.id)) continue;
      const params = this.request(machine, wanted);
      const taken = this.taken.get(machine.id);
      if (taken !== undefined && holdsAlready(taken, params)) continue;
      if (!this.deps.machines().some((entry) => entry.id === machine.id)) continue;
      if (!this.stillWanted(wanted)) {
        // The master switch or the token changed meanwhile: the pass that follows sends what is wanted now.
        void this.sync();
        return;
      }
      const outcome = await this.deps
        .send(machine.id, params, () => this.stillWanted(wanted) && !this.removed.has(machine.id))
        .catch((): PushTokenSendOutcome => 'unreachable');
      if (outcome === 'superseded') {
        void this.sync();
        return;
      }
      // Its removal started meanwhile: what it answered to this request goes with it.
      if (this.removed.has(machine.id)) continue;
      if (params.action === 'register' && params.deviceId === undefined && (machine.deviceId ?? '').length > 0) {
        // The id itself stays out of the log: it is pairing metadata, not something the log needs.
        this.deps.log(
          `${machine.label}: pairing id left out of the push token registration (not one the computer takes)`,
        );
      }
      const what = wanted === null ? 'removal' : 'registration';
      if (outcome === 'done') {
        this.taken.set(machine.id, params);
        this.deps.accepted(machine.id, wanted !== null);
        this.deps.log(`${machine.label}: push token ${wanted === null ? 'removed' : 'registered'}`);
      } else if (outcome === 'unsupported' || outcome === 'legacy') {
        this.unsupported.add(machine.id);
        // Only a Ghostex that answered it knows no push route surely holds no token.
        if (outcome === 'unsupported') this.deps.accepted(machine.id, false);
        this.deps.log(`${machine.label}: this computer has no push yet; not asked again until the app starts again`);
      } else {
        // Not taken: the computer keeps what it held before, so nothing is confirmed.
        this.deps.log(`${machine.label}: push token ${what} not taken (${outcome}); asked again at the next occasion`);
      }
    }
  }

  /**
   * What `machine` is asked for now: the registration of `wanted` with the switches as they are now and its pairing
   * device id when the route takes it (an empty one is none; one it does not take is left out), or the removal
   * (`wanted` null).
   */
  private request(machine: { id: string; deviceId?: string }, wanted: string | null): PushTokenParams {
    if (wanted === null) return { action: 'unregister', machineId: machine.id };
    const { finished, waiting, error } = this.deps.settings();
    const deviceId = machine.deviceId ?? '';
    return {
      action: 'register',
      token: wanted,
      machineId: machine.id,
      kinds: { finished, waiting, error },
      ...(DEVICE_ID.test(deviceId) ? { deviceId } : {}),
    };
  }

  /** Whether the master switch and the phone's token still ask each computer to hold `wanted`. */
  private stillWanted(wanted: string | null): boolean {
    const settings = this.deps.settings();
    if (settings.askedAt === undefined) return false;
    if (!settings.enabled) return wanted === null;
    return wanted !== null && wanted === this.token;
  }

  /**
   * The token each computer should hold: the phone's (master switch on, permission, push project), null (master
   * switch off after the first ask: none), or undefined when nothing is to be sent now.
   */
  private async wantedToken(): Promise<string | null | undefined> {
    const settings = this.deps.settings();
    // Before the first ask was answered this phone never registered.
    if (settings.askedAt === undefined) return undefined;
    if (!settings.enabled) return null;
    if ((await this.deps.permission()) !== 'granted') return undefined;
    if (this.token !== null) return this.token;
    const projectId = this.deps.projectId();
    if (projectId === null) {
      if (!this.toldNoProject) this.deps.log('Push: this build has no push project; push notifications stay off');
      this.toldNoProject = true;
      return undefined;
    }
    const issued = this.tokenIssues;
    try {
      const token = await this.deps.obtainToken(projectId);
      if (!EXPO_PUSH_TOKEN.test(token)) throw new Error('not an Expo push token');
      // iOS issued a newer token while this one was fetched: the pass that issue asked for fetches that one.
      if (issued !== this.tokenIssues) return undefined;
      this.token = token;
      return token;
    } catch {
      // iOS's or Expo's own error text stays out of the app log: it can carry the token.
      this.deps.log('Push: no push token this time; asked again at the next occasion');
      return undefined;
    }
  }
}
