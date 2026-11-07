/**
 * One set of box operations over Instabox and Boat for the phone: the twin of home gxserver's
 * `server/src/cloud_boxes/ops.rs` (`Ops`), with every request built and every answer read by
 * `packages/gx-cloud` through the WebAssembly core (./gxCloud.ts) and sent with `fetch`. Used only
 * while the box's computer is off (Q1033 D7); otherwise the computer makes every provider call.
 * The `local` provider runs on the computer's Docker, so a phone cannot drive it.
 */

import { providerCreateArgs } from './createArgs';
import { gxCloud, ProviderCallError } from './gxCloud';

/** How long a create or resume may take before the phone gives up (`MACHINE_WAIT`). */
const MACHINE_WAIT_MS = 10 * 60_000;
const POLL_MS = 2_000;

type BuiltRequest = {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: { json: unknown } | { form: Array<[string, string]> } | { bytesBase64url: string; contentType: string };
  timeoutSeconds: number;
};

export type ProviderMachine = {
  providerBoxId: string;
  state: string;
  metadata: {
    boxId: string;
    projectKey: string;
    homeProjectId?: string | null;
    homeMachineId?: string | null;
    snapshotId?: string | null;
    size?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
  } | null;
  createdAt?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  costMonthUsd?: number | null;
  size?: string | null;
  error?: string | null;
};

export type ExecOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The one JSON object a `ghostex box` verb printed, if any. */
  json: Record<string, unknown> | null;
  failureTail: string;
  /** What a box whose `ghostex` has no `box` command said, in words (gx-cloud `missing_box_command`); absent from an older core. */
  missingBoxCommand?: string | null;
};

type Operation = { operationId: string; providerBoxId?: string | null; state: string; phase?: string | null; error?: string | null; done: boolean };

export type BoxMetadataInput = {
  boxId: string;
  projectKey: string;
  homeProjectId?: string;
  homeMachineId?: string;
  snapshotId?: string;
  size?: string;
  idempotencyKey?: string;
  createdBy?: string;
  createdAt?: string;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64urlBytes(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export type HttpAnswer = { status: number; body: string };
type HttpSend = (request: BuiltRequest) => Promise<HttpAnswer>;

/** Sends one built request with `fetch`. Never logs it: its headers carry the provider key. */
const fetchSend: HttpSend = async (request) => {
  const headers: Record<string, string> = {};
  for (const [name, value] of request.headers) headers[name] = value;
  let body: BodyInit | undefined;
  if (request.body !== undefined) {
    if ('json' in request.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.body.json);
    } else if ('form' in request.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = request.body.form.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    } else {
      headers['Content-Type'] = request.body.contentType;
      body = base64urlBytes(request.body.bytesBase64url).buffer as ArrayBuffer;
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutSeconds * 1000);
  try {
    const response = await fetch(request.url, { method: request.method, headers, body, signal: controller.signal });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    throw new ProviderCallError({
      status: 0,
      message: controller.signal.aborted ? 'The provider did not answer in time.' : `Couldn't reach the provider: ${String(error)}`,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
};

let send: HttpSend = fetchSend;

/** Sends provider requests elsewhere (the W6 harness's stand-in provider). */
export function setProviderHttpForHarness(next: HttpSend): void {
  send = next;
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

function idempotency(boxId: string, action: string): string {
  return `ghostex-${boxId}-${action}-${randomHex(8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A provider with its key, ready to call: `Ops::Instabox` / `Ops::Boat`. */
export class ProviderOps {
  constructor(
    readonly provider: string,
    private readonly key: string,
    /** The provider's plan from the computer's kit (`free`, `pro`); absent from an older computer. */
    private readonly plan?: string | null,
  ) {}

  private async call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const base = { provider: this.provider, op, key: this.key, ...args };
    const request = await gxCloud<BuiltRequest>('request', base);
    const response = await send(request);
    return gxCloud<T>('parse', { provider: this.provider, op, response });
  }

  /** Every Ghostex box at the provider. */
  async list(): Promise<ProviderMachine[]> {
    const all: ProviderMachine[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { machines: ProviderMachine[]; nextCursor?: string | null } = await this.call('list', cursor === null ? {} : { cursor });
      all.push(...page.machines);
      if (page.nextCursor == null || all.length >= 2000) return all;
      cursor = page.nextCursor;
    }
  }

  /** One box now; `null` when it is gone. */
  async get(providerBoxId: string): Promise<ProviderMachine | null> {
    try {
      return await this.call<ProviderMachine>('get', { providerBoxId });
    } catch (error) {
      if (error instanceof ProviderCallError && error.status === 404) return null;
      throw error;
    }
  }

  private async waitOperation(start: Operation): Promise<void> {
    let operation = start;
    const deadline = Date.now() + MACHINE_WAIT_MS;
    while (!operation.done) {
      if (Date.now() > deadline) {
        throw new Error(`Instabox is still ${operation.phase ?? 'working'} after ${MACHINE_WAIT_MS / 60_000} minutes.`);
      }
      operation = await this.call<Operation>('operation', { operationId: operation.operationId });
    }
    if (operation.state !== 'succeeded') throw new Error(operation.error ?? 'The Instabox operation failed.');
  }

  private async waitRunning(providerBoxId: string): Promise<void> {
    const deadline = Date.now() + MACHINE_WAIT_MS;
    for (;;) {
      const machine = await this.get(providerBoxId);
      if (machine === null) throw new Error('The provider no longer has this box.');
      if (machine.state === 'running') return;
      if (machine.state === 'failed') throw new Error(machine.error ?? 'The box failed to start.');
      if (Date.now() > deadline) throw new Error(`The box did not start within ${MACHINE_WAIT_MS / 60_000} minutes.`);
      await sleep(POLL_MS);
    }
  }

  /** Makes the machine and waits until it runs; answers its provider id (`Ops::create`). */
  async create(
    metadata: BoxMetadataInput,
    providerSnapshotId: string | null,
    idleMinutes: number,
    idempotencyKey: string,
  ): Promise<string> {
    const args = providerCreateArgs(metadata, providerSnapshotId, idleMinutes, idempotencyKey, this.plan);
    if (this.provider === 'instabox') {
      const operation = await this.call<Operation>('create', args);
      const machineId = operation.providerBoxId;
      if (machineId == null) throw new Error("Instabox didn't say which machine it made.");
      await this.waitOperation(operation);
      // A create from a snapshot with storage stays stopped; start it.
      if ((await this.get(machineId))?.state === 'stopped') await this.resume(metadata.boxId, machineId, 'stopped');
      return machineId;
    }
    const created = await this.call<ProviderMachine>('create', args);
    await this.waitRunning(created.providerBoxId);
    return created.providerBoxId;
  }

  /** Wakes a paused or stopped box and waits until it runs (`Ops::resume`). */
  async resume(boxId: string, providerBoxId: string, state: string): Promise<void> {
    if (this.provider === 'instabox') {
      const action = state === 'paused' ? 'resume' : 'start';
      const operation = await this.call<Operation>('action', {
        providerBoxId,
        action,
        idempotencyKey: idempotency(boxId, action),
      });
      await this.waitOperation(operation);
      return;
    }
    await this.call('action', { providerBoxId, action: 'resume' });
    await this.waitRunning(providerBoxId);
  }

  /** Stops the box: programs end, the disk is kept (`Ops::stop`). */
  async stop(boxId: string, providerBoxId: string): Promise<void> {
    if (this.provider === 'instabox') {
      const operation = await this.call<Operation>('action', {
        providerBoxId,
        action: 'stop',
        idempotencyKey: idempotency(boxId, 'stop'),
      });
      await this.waitOperation(operation);
      return;
    }
    await this.call('action', { providerBoxId, action: 'stop' });
  }

  async delete(boxId: string, providerBoxId: string): Promise<void> {
    await this.call('delete', { providerBoxId, idempotencyKey: idempotency(boxId, 'delete') });
  }

  /** Runs argv on the box (no shell on Instabox; Boat quotes it for its shell). */
  exec(providerBoxId: string, argv: string[], stdin: string | null, timeoutSeconds: number): Promise<ExecOutput> {
    return this.call<ExecOutput>('exec', {
      providerBoxId,
      argv,
      timeoutSeconds,
      ...(stdin === null ? {} : { stdin }),
    });
  }

  /** Writes a private file (mode 0600) on the box. */
  async writeFile(providerBoxId: string, path: string, contents: string): Promise<void> {
    await this.call('writeFile', { providerBoxId, path, contents });
  }
}
