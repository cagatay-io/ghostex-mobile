/**
 * Starting, waking, stopping and deleting a box from the phone while its computer is off: the
 * twin of home gxserver's create, resume, stop and delete (`server/src/cloud_boxes/create.rs`,
 * `lifecycle.rs`, the boot steps in `boot_steps.rs`), driven with the phone's cloud kit
 * (./cloudKit.ts) and the provider rules in the WebAssembly core (./providerOps.ts).
 *
 * CDXC:CloudBoxes 2026-11-02 DECISION:
 * User (Q1016 "mac off too", Q1033 D7 "start chat wake stop"): with the computer off the phone
 * starts a box from a project's existing Default snapshot, chats with it, wakes, stops and deletes
 * it. A box the phone starts is tagged with the computer's id and `phone:<device>` in the
 * provider's metadata, so the computer adopts it from the provider's own list when it is back
 * (`server/src/cloud_boxes/reconcile.rs`); the phone keeps its row and token meanwhile.
 * SEE-ALSO: packages/gx-protocol/src/cloud_box/kit.rs (what the kit holds)
 */

import { cloudKitCapRefusal, cloudKitKey, cloudKitOf, type CloudKit, type CloudKitProject } from './cloudKit';
import { gxCloud } from './gxCloud';
import { ProviderOps, type ExecOutput, type ProviderMachine } from './providerOps';
import { saveConnectInfo, useCloudBoxesStore, type CloudBoxEntry } from './store';
import { setProviderBoxOps } from './actions';
import { setProviderResumer } from './wake';
import type { CloudBox, CloudBoxProgressStep } from './types';

const BOX_GHOSTEX_BIN = '/opt/ghostex/bin/ghostex';
const TICKET_VERSION = 1;

/**
 * The box's private folder: the one its boot reported (`privateDir`, issue #433: an Instabox box
 * without passwordless sudo uses a per-user folder), else the provider's usual one.
 */
function privateDir(provider: string, reported?: unknown): string {
  if (typeof reported === 'string' && reported.startsWith('/')) return reported;
  return provider === 'boat' ? '/tmp/ghostex' : '/run/ghostex';
}

function boxHome(provider: string): string {
  return provider === 'instabox' ? '/data/home' : '/home/user';
}

function nowIso(): string {
  return new Date().toISOString();
}

function base64url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const triple = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const chars = Math.min(3, bytes.length - index) + 1;
    for (let char = 0; char < chars; char += 1) out += alphabet[(triple >> (18 - char * 6)) & 63];
  }
  return out;
}

/** The branch a phone-started session works on: the first words of its first message (`session_branch`). */
export function phoneSessionBranch(boxId: string, firstMessage: string): string {
  const words = firstMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .slice(0, 6)
    .join('-')
    .slice(0, 48)
    .replace(/^-+|-+$/gu, '');
  return words.length > 0 ? words : `cloud-box-${boxId.replace(/^gx_/u, '')}`;
}

const STEP_LABELS: Record<string, string> = {
  checkCap: 'Checking the spending cap',
  create: 'Starting the box',
  boot: 'Starting Ghostex on the box',
  secrets: 'Sending logins and secrets',
  prepareSession: 'Fetching the code and starting the agent',
  connect: 'Connecting',
};

/** Keeps the phone's row of a box it drives, and its boot card's steps. */
class PhoneBoxRow {
  constructor(
    private readonly homeMachineId: string,
    public box: CloudBox,
    private readonly onProgress?: (label: string) => void,
  ) {}

  put(change: Partial<CloudBox>): void {
    this.box = { ...this.box, ...change };
    useCloudBoxesStore.getState().putBox(this.homeMachineId, this.box, 'provider');
  }

  step(step: string, state: CloudBoxProgressStep['state'], message?: string): void {
    const steps = [...(this.box.progress?.steps ?? [])];
    const at = steps.findIndex((entry) => entry.step === step);
    const previous = at >= 0 ? steps[at] : undefined;
    const next: CloudBoxProgressStep = {
      step,
      state,
      label: STEP_LABELS[step] ?? step,
      startedAt: previous?.startedAt ?? nowIso(),
      ...(state === 'running' ? {} : { finishedAt: nowIso() }),
      ...(message === undefined ? {} : { message }),
    };
    if (at >= 0) steps[at] = next;
    else steps.push(next);
    if (state === 'running') this.onProgress?.(next.label);
    this.put({ progress: { kind: this.box.progress?.kind ?? 'create', steps } });
  }

  async run<T>(step: string, work: () => Promise<T>): Promise<T> {
    this.step(step, 'running');
    try {
      const value = await work();
      this.step(step, 'done');
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.step(step, 'failed', message);
      this.put({ state: 'failed', stateDetail: message });
      throw error;
    }
  }
}

function verbAnswer(output: ExecOutput, verb: string): Record<string, unknown> {
  const value = output.json;
  if (value !== null && value.ok === true) return value;
  const error = typeof value?.error === 'string' ? value.error : null;
  throw new Error(error ?? output.missingBoxCommand ?? `ghostex box ${verb} printed no answer: ${output.failureTail}`);
}

async function opsFor(homeMachineId: string, provider: string): Promise<ProviderOps> {
  const key = await cloudKitKey(homeMachineId, provider);
  if (key === null) throw new Error(`The phone has no ${provider} key for this computer. Turn on Start boxes from your phone there.`);
  return new ProviderOps(provider, key);
}

/**
 * Install, boot, then logins and secrets: the steps a create and a resume share (`finish_boot`).
 * Answers the box's private folder.
 */
async function bootBox(
  row: PhoneBoxRow,
  ops: ProviderOps,
  providerBoxId: string,
  kit: CloudKit,
  project: CloudKitProject | null,
): Promise<string> {
  const { box } = row;
  if (kit.allowDeviceKeys.length === 0) {
    throw new Error('The computer lists no paired device the box could admit; pair this phone with Easy Connect first.');
  }
  const result = await row.run('boot', async () => {
    const { script } = await gxCloud<{ script: string }>('installScript', { version: kit.gxserverVersion });
    const installed = await ops.exec(providerBoxId, ['sh', '-c', script], null, 600);
    if (installed.exitCode !== 0) throw new Error(`Couldn't install Ghostex on the box: ${installed.failureTail}`);
    const { ticket } = await gxCloud<{ ticket: string }>('encodeTicket', {
      ticket: {
        version: TICKET_VERSION,
        boxId: box.boxId,
        provider: box.provider,
        homeMachineId: kit.homeMachineId,
        ...(box.homeProjectId === undefined ? {} : { homeProjectId: box.homeProjectId }),
        allowDeviceKeys: kit.allowDeviceKeys,
        idleStopMinutes: kit.idleStopMinutes,
        // Boat has no idle timer, so its boxes stop themselves; Instabox pauses idle boxes itself.
        selfStop: box.provider === 'boat',
        tailcat: true,
      },
    });
    return verbAnswer(await ops.exec(providerBoxId, [BOX_GHOSTEX_BIN, 'box', 'boot', '--ticket', ticket], null, 180), 'boot');
  });
  const tailcatAddress = typeof result.tailcatAddress === 'string' ? result.tailcatAddress : undefined;
  const gxserverToken = typeof result.gxserverToken === 'string' ? result.gxserverToken : '';
  const gxserverPort = typeof result.gxserverPort === 'number' ? result.gxserverPort : 0;
  const gxserverVersion = typeof result.gxserverVersion === 'string' ? result.gxserverVersion : undefined;
  if (tailcatAddress === undefined || gxserverToken.length === 0) throw new Error('The box started without an Easy Connect address.');
  await saveConnectInfo({ boxId: box.boxId, transport: 'tailcat', tailcatAddress, gxserverPort, gxserverToken, gxserverVersion });
  row.put({ tailcatAddress, gxserverVersion });
  const folder = privateDir(box.provider, result.privateDir);
  const secrets = { accounts: kit.accounts, files: project?.files ?? [], vars: project?.vars ?? [] };
  if (secrets.accounts.length === 0 && secrets.files.length === 0 && secrets.vars.length === 0) {
    row.step('secrets', 'skipped');
    return folder;
  }
  await row.run('secrets', () => ops.writeFile(providerBoxId, `${folder}/secrets.json`, JSON.stringify(secrets)));
  return folder;
}

export type PhoneStartInput = {
  homeMachineId: string;
  homeProjectId: string;
  agentId: string;
  firstMessage: string;
  accountId?: string;
  title?: string;
  /** This phone's device id on the computer (Easy Connect pairing), for `createdBy`. */
  deviceId?: string;
  /** Each step's words while it runs (the boot card's lines). */
  onProgress?: (label: string) => void;
};

export type PhoneStartResult = { entry: CloudBoxEntry; sessionId: string; boxProjectId: string };

/** Starts a box from the project's Default snapshot and the agent's session on it, with the computer off. */
export async function startBoxFromPhone(input: PhoneStartInput): Promise<PhoneStartResult> {
  const kit = await cloudKitOf(input.homeMachineId);
  const project = kit?.projects.find((candidate) => candidate.homeProjectId === input.homeProjectId) ?? null;
  if (kit === null || project === null) {
    throw new Error('This project has no Default snapshot the phone can start from. Save one on the computer first.');
  }
  const capped = cloudKitCapRefusal(kit);
  if (capped !== null) throw new Error(capped);
  const provider = project.snapshot.provider;
  const ops = await opsFor(input.homeMachineId, provider);
  const entropy = new Uint8Array(16);
  globalThis.crypto.getRandomValues(entropy);
  const { boxId, name } = await gxCloud<{ boxId: string; name: string }>('newBoxId', { entropyBase64url: base64url(entropy) });
  const size = await gxCloud<{ id: string; usdPerHour?: number }>('size', { provider, size: project.snapshot.size });
  const createdAt = nowIso();
  const idempotencyKey = `ghostex-${boxId}-create`;
  const row = new PhoneBoxRow(input.homeMachineId, {
    boxId,
    provider,
    name,
    state: 'creating',
    projectKey: project.projectKey,
    homeProjectId: project.homeProjectId,
    snapshotId: project.snapshot.snapshotId,
    size: size.id,
    usdPerHour: size.usdPerHour,
    costTotalUsd: 0,
    costEstimated: true,
    createdBy: `phone:${input.deviceId ?? 'phone'}`,
    createdAt,
    sessions: [],
    progress: { kind: 'create', steps: [] },
  }, input.onProgress);
  // Checked above against the kit's last spend (`cloudKitCapRefusal`), before anything was made.
  row.step('checkCap', 'done');
  const providerBoxId = await row.run('create', () =>
    ops.create(
      {
        boxId,
        projectKey: project.projectKey,
        homeProjectId: project.homeProjectId,
        homeMachineId: kit.homeMachineId,
        snapshotId: project.snapshot.snapshotId,
        size: size.id,
        idempotencyKey,
        createdBy: `phone:${input.deviceId ?? 'phone'}`,
        createdAt,
      },
      project.snapshot.providerSnapshotId,
      kit.idleStopMinutes,
      idempotencyKey,
    ),
  );
  row.put({ providerBoxId, state: 'booting' });
  const folder = await bootBox(row, ops, providerBoxId, kit, project);
  const slug = project.name.replace(/[^A-Za-z0-9_-]/gu, '-') || 'project';
  const branch = phoneSessionBranch(boxId, input.firstMessage);
  const prepared = await row.run('prepareSession', async () => {
    const request = {
      boxId,
      ...(project.repoUrl === undefined ? {} : { repoUrl: project.repoUrl }),
      checkoutPath: `${boxHome(provider)}/code/${slug}`,
      ...(project.baseBranch === undefined ? {} : { baseBranch: project.baseBranch }),
      branch,
      worktree: false,
      agentId: input.agentId,
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      ...(input.title === undefined ? {} : { title: input.title }),
      firstMessage: input.firstMessage,
      imagePaths: [],
      homeProjectId: project.homeProjectId,
      homeMachineId: kit.homeMachineId,
      snapshotId: project.snapshot.snapshotId,
    };
    const path = `${folder}/prepare-session.json`;
    await ops.writeFile(providerBoxId, path, JSON.stringify(request));
    return verbAnswer(
      await ops.exec(providerBoxId, [BOX_GHOSTEX_BIN, 'box', 'prepare-session', '--request', path], null, 600),
      'prepare-session',
    );
  });
  const sessionId = String(prepared.sessionId ?? '');
  const boxProjectId = String(prepared.projectId ?? '');
  row.step('connect', 'skipped');
  row.put({
    state: 'running',
    stateDetail: undefined,
    startedAt: nowIso(),
    lastActiveAt: nowIso(),
    sessions: [
      {
        projectId: boxProjectId,
        sessionId,
        title: input.title ?? input.firstMessage.slice(0, 60),
        agentId: input.agentId,
        branch: typeof prepared.branch === 'string' ? prepared.branch : branch,
        ...(typeof prepared.agentSessionId === 'string' ? { agentSessionId: prepared.agentSessionId } : {}),
        lastActiveAt: nowIso(),
      },
    ],
    progress: undefined,
  });
  return { entry: { box: row.box, homeMachineId: input.homeMachineId, source: 'provider' }, sessionId, boxProjectId };
}

/** Wakes a box through the provider with the computer off (registered with ./wake.ts). */
async function resumeFromPhone(box: CloudBox, homeMachineId: string): Promise<CloudBox | string> {
  try {
    if (box.providerBoxId === undefined) return 'The phone does not know this box at its provider.';
    const kit = await cloudKitOf(homeMachineId);
    if (kit === null) return 'Your computer is off and this phone has no cloud kit for it.';
    const ops = await opsFor(homeMachineId, box.provider);
    const row = new PhoneBoxRow(homeMachineId, { ...box, state: 'creating', progress: { kind: 'resume', steps: [] } });
    const providerBoxId = box.providerBoxId;
    // A sleeping box keeps running in the background of this call; the send waits on the row.
    void (async () => {
      try {
        await row.run('create', () => ops.resume(box.boxId, providerBoxId, box.state));
        row.put({ state: 'booting' });
        const project = kit.projects.find((candidate) => candidate.homeProjectId === box.homeProjectId) ?? null;
        await bootBox(row, ops, providerBoxId, kit, project);
        row.put({ state: 'running', stateDetail: undefined, startedAt: nowIso(), stoppedAt: undefined, progress: undefined });
      } catch {
        // `run` marked the row failed with the reason; the waiting send reads it.
      }
    })();
    return row.box;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function stopFromPhone(entry: CloudBoxEntry): Promise<CloudBox | string> {
  try {
    const { box } = entry;
    if (box.providerBoxId === undefined) return 'The phone does not know this box at its provider.';
    await (await opsFor(entry.homeMachineId, box.provider)).stop(box.boxId, box.providerBoxId);
    return { ...box, state: 'stopped', stoppedAt: nowIso() };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Deletes with the computer off. The unpushed-work check (D13) needs the box up; a box that is
 * not up was stopped with its work recorded (`hasUnpushedWork`), which the menu already shows as
 * "Delete anyway".
 */
async function deleteFromPhone(entry: CloudBoxEntry): Promise<CloudBox | string> {
  try {
    const { box } = entry;
    if (box.providerBoxId === undefined) return 'The phone does not know this box at its provider.';
    await (await opsFor(entry.homeMachineId, box.provider)).delete(box.boxId, box.providerBoxId);
    return { ...box, state: 'deleted' };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

setProviderResumer(resumeFromPhone);
setProviderBoxOps({ stop: stopFromPhone, delete: deleteFromPhone });

/** A provider's box as the phone lists it while the computer is off. */
function rowOfMachine(machine: ProviderMachine, provider: string, previous: CloudBox | undefined): CloudBox | null {
  const metadata = machine.metadata;
  if (metadata === null) return null;
  return {
    ...(previous ?? { sessions: [], name: `box-${metadata.boxId.replace(/^gx_/u, '').slice(0, 3)}` }),
    boxId: metadata.boxId,
    provider,
    providerBoxId: machine.providerBoxId,
    state: machine.state,
    projectKey: metadata.projectKey,
    homeProjectId: metadata.homeProjectId ?? previous?.homeProjectId,
    snapshotId: metadata.snapshotId ?? previous?.snapshotId,
    size: machine.size ?? metadata.size ?? previous?.size,
    startedAt: machine.startedAt ?? previous?.startedAt,
    stoppedAt: machine.stoppedAt ?? undefined,
    createdAt: metadata.createdAt ?? previous?.createdAt,
    createdBy: metadata.createdBy ?? previous?.createdBy,
    sessions: previous?.sessions ?? [],
  } as CloudBox;
}

/**
 * While a computer is off, its boxes' states come from the providers themselves (the provider's
 * list is the registry, plan §2.2): a box the computer stopped, or one Instabox paused, shows so.
 */
export async function refreshBoxesFromProviders(homeMachineId: string): Promise<void> {
  const kit = await cloudKitOf(homeMachineId);
  if (kit === null) return;
  const entries = useCloudBoxesStore.getState().entries;
  for (const { provider } of kit.providers) {
    const machines = await (await opsFor(homeMachineId, provider)).list().catch(() => null);
    if (machines === null) continue;
    for (const machine of machines) {
      if (machine.metadata?.homeMachineId !== kit.homeMachineId) continue;
      const previous = entries[machine.metadata.boxId];
      const row = rowOfMachine(machine, provider, previous?.box);
      if (row !== null) useCloudBoxesStore.getState().putBox(homeMachineId, row, previous?.source ?? 'home');
    }
  }
}
