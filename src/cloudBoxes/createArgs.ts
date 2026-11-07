/**
 * The arguments of a provider create (`json_api` `create` in packages/gx-cloud), kept apart from
 * ./providerOps.ts so tests need no WebAssembly. `plan` is the provider's plan from the computer's
 * kit: Instabox's free plan keeps its own 30-minute idle pause and refuses any other, so the core
 * leaves `idleMinutes` out of the request when the plan is `free`, as home gxserver does.
 */
export function providerCreateArgs<M>(
  metadata: M,
  providerSnapshotId: string | null,
  idleMinutes: number,
  idempotencyKey: string,
  plan: string | null | undefined,
): Record<string, unknown> {
  return {
    metadata,
    idempotencyKey,
    idleMinutes,
    ...(plan == null || plan === '' ? {} : { plan }),
    ...(providerSnapshotId === null ? {} : { providerSnapshotId }),
  };
}
