/**
 * The Cloud Boxes wire shapes the phone reads.
 *
 * CDXC:CloudBoxes 2026-11-02 SEE-ALSO:
 * The phone's subset of `packages/shared/gxserver-protocol-cloud-boxes.ts` (the TypeScript twin of
 * `packages/gx-protocol/src/cloud_box/`); change them together. Strings stay open: an unknown
 * state or provider must never fail the phone.
 */

export type CloudBoxState =
  | 'pending'
  | 'creating'
  | 'booting'
  | 'running'
  | 'idle'
  | 'paused'
  | 'stopped'
  | 'deleting'
  | 'deleted'
  | 'failed'
  | (string & {});

export type CloudBoxSessionRow = {
  projectId: string;
  sessionId: string;
  title: string;
  agentId?: string;
  branch?: string;
  agentSessionId?: string;
  lastActiveAt?: string;
  homeSessionId?: string;
  archived?: true;
};

export type CloudBoxProgressStep = {
  step: string;
  state: string;
  label: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
};

/** One registry row (`list`, `get`, `create`, `cloudBoxesChanged`). Never carries secrets. */
export type CloudBox = {
  boxId: string;
  provider: string;
  providerBoxId?: string;
  name: string;
  state: CloudBoxState;
  stateDetail?: string;
  projectKey: string;
  homeProjectId?: string;
  snapshotId?: string;
  size?: string;
  tailcatAddress?: string;
  gxserverVersion?: string;
  createdBy?: string;
  createdAt?: string;
  startedAt?: string;
  lastActiveAt?: string;
  stoppedAt?: string;
  deleteAfter?: string;
  idleStopsAt?: string;
  costTotalUsd?: number;
  costMonthUsd?: number;
  costEstimated?: true;
  usdPerHour?: number;
  hasUnpushedWork?: boolean;
  snapshotUpdateReason?: string;
  sessions: CloudBoxSessionRow[];
  progress?: { kind: string; steps: CloudBoxProgressStep[]; error?: string };
};

/** `connectInfo`: `tailcat` (Instabox, Boat) or `direct` (`local`, a loopback port on the computer). */
export type CloudBoxConnectInfo = {
  boxId: string;
  transport: 'tailcat' | 'direct' | (string & {});
  tailcatAddress?: string;
  gxserverPort: number;
  baseUrl?: string;
  gxserverToken: string;
  gxserverVersion?: string;
};

export type CloudSnapshot = {
  snapshotId: string;
  provider: string;
  providerSnapshotId?: string;
  projectKey: string;
  name: string;
  isDefault: boolean;
  status: string;
  size?: string;
};

/** Prefix of a box's hidden machine id, `cloudbox:<boxId>` (`GXSERVER_CLOUD_BOX_MACHINE_PREFIX`). */
export const CLOUD_BOX_MACHINE_PREFIX = 'cloudbox:';

/** The chat refusal for a paused or stopped box (gx-chat-core `session/cloud_box.rs`). */
export const CLOUD_BOX_ASLEEP = 'cloudBoxAsleep';
/** The chat refusal for a box that cannot be reached and that a send would not wake. */
export const CLOUD_BOX_UNAVAILABLE = 'cloudBoxUnavailable';

export function cloudBoxMachineId(boxId: string): string {
  return `${CLOUD_BOX_MACHINE_PREFIX}${boxId}`;
}

export function isCloudBoxMachineId(machineId: string | null | undefined): boolean {
  return typeof machineId === 'string' && machineId.startsWith(CLOUD_BOX_MACHINE_PREFIX);
}

export function boxIdOfMachine(machineId: string): string | null {
  return isCloudBoxMachineId(machineId) ? machineId.slice(CLOUD_BOX_MACHINE_PREFIX.length) : null;
}

/** `CloudBoxState::is_reachable`: its gxserver answers. */
export function isReachable(state: CloudBoxState): boolean {
  return state === 'running' || state === 'idle';
}

/** `CloudBoxState::wakes_on_send`: a sent message resumes it (Q1013). */
export function wakesOnSend(state: CloudBoxState): boolean {
  return state === 'paused' || state === 'stopped';
}

/** `CloudBoxState::is_starting`. */
export function isStarting(state: CloudBoxState): boolean {
  return state === 'pending' || state === 'creating' || state === 'booting';
}

/** The ☁ badge dot (`native_sidebar/cloud_box.rs` `state_color`, D2 colours); `null` is the muted grey. */
export function cloudBoxDotColor(state: CloudBoxState): string | null {
  if (isStarting(state)) return '#60a5fa';
  if (state === 'running') return '#4ade80';
  if (state === 'idle') return '#fbbf24';
  if (state === 'failed') return '#f87171';
  return null;
}

/** `cloud_box_state_label` in gx-core. */
export function cloudBoxStateLabel(state: CloudBoxState): string {
  switch (state) {
    case 'pending':
      return 'Starts with the first message';
    case 'creating':
    case 'booting':
      return 'Starting';
    case 'running':
      return 'Running';
    case 'idle':
      return 'Idle';
    case 'paused':
      return 'Paused · sending wakes it';
    case 'stopped':
      return 'Stopped · sending wakes it';
    case 'deleting':
      return 'Deleting';
    case 'deleted':
      return 'Deleted';
    case 'failed':
      return 'Failed';
    default:
      return state;
  }
}
