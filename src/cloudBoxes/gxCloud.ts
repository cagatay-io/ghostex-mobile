/**
 * The Cloud Boxes provider rules, through the phone's WebAssembly core: `packages/gx-cloud`'s
 * `json_api::call` behind the core page's `cloud` op (`gx_cloud_call`), so the phone builds every
 * provider request and reads every answer with gxserver's own code (plan §2.1), and a rule change
 * reaches phones with the over-the-air update that carries the core.
 */

import { wasmCoreBridge } from '../chat/rust/wasm-core/bridge';

/** A provider's refusal (`ProviderError`): `status` 0 when the request got no answer. */
export class ProviderCallError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(failed: { status?: number; code?: string | null; message?: string; retryable?: boolean }) {
    super(failed.message ?? 'The provider refused.');
    this.name = 'ProviderCallError';
    this.status = failed.status ?? 0;
    this.code = failed.code ?? null;
    this.retryable = failed.retryable === true;
  }
}

/** `{name, arguments JSON} → answer JSON`, the core's export. Swappable for a desktop harness. */
type RawCall = (name: string, argumentsJson: string) => Promise<unknown>;

let rawCall: RawCall = (name, argumentsJson) => wasmCoreBridge.call({ op: 'cloud', args: [name, argumentsJson] });

/** Runs the same calls on another copy of the core (the W6 harness loads the wasm under bun). */
export function setGxCloudCallForHarness(call: RawCall): void {
  rawCall = call;
}

/** One call: its `ok` value, or a thrown {@link ProviderCallError} for a `failed` answer. */
export async function gxCloud<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const answer = (await rawCall(name, JSON.stringify(args))) as {
    ok?: T;
    failed?: ConstructorParameters<typeof ProviderCallError>[0];
    error?: { message?: string };
  };
  if (answer.failed !== undefined) throw new ProviderCallError(answer.failed);
  if (answer.error !== undefined) throw new ProviderCallError({ message: answer.error.message });
  return answer.ok as T;
}
