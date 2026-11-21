import { execRemoteCommand } from '../remote/commands';
/**
 * Add Project transport: gxserver reads/writes for adding local folders and
 * cloning repositories.
 *
 * Directory browsing (`browseProjectDirectories` with `details: true`),
 * picker places (`projectPickerPlaces`), and folder creation
 * (`createProjectDirectory`) use the machine's warm HTTP link when available
 * and degrade cleanly on older computers (HTTP 404 on `/api/projectPickerPlaces`
 * returns `null` with zero errors; older servers ignore `details: true`;
 * legacy SSH-only computers fall back to `ghostex browse-directories`).
 *
 * CLI-backed verbs do not reuse `components/sessions/cli.ts::runGhostexCli`
 * because Add Project needs per-command exec timeouts (a clone outlives the
 * 20s inventory budget), the parsed JSON payload even when the CLI exits
 * non-zero (a failed clone job exits 1 while the RPC itself succeeded, and
 * the real reason lives in `job.error`), and structured error strings surfaced
 * verbatim to the inline error banners instead of a truncated blob of stdout.
 */

import { chatMachineLink } from '../chat/rust/machine-link';
import type { RpcAnswer } from '../chat/rust/transport';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import {
  addProjectCommand,
  browseDirectoriesCommand,
  cloneRepositoryCommand,
  discoverSourceControlCommand,
  lookupRepositoryCommand,
  type SourceControlLookupProvider,
} from '../commands/ghostexCli';
import { runGhostexCli } from '../components/sessions/cli';
import { scanJsonObjects } from '../contract/mobileSummary';
import { FailureCopy } from '../copy';
import {
  ensureConnected,
  INVENTORY_EXEC_TIMEOUT_MS,
  isOutdatedMachineFailure,
  summarizeFailure,
} from '../inventory/client';
import { hasPassword, type MachineConnectionTarget } from '../machines/credentials';
import { addedProjectWorkspaceId } from '../workspaces/store';

/** Discovery probes are 5s each and the CLI's own RPC budget defaults to 15s. */
const DISCOVERY_RPC_TIMEOUT_MS = 30000;
const DISCOVERY_EXEC_TIMEOUT_MS = 45000;
const LOOKUP_RPC_TIMEOUT_MS = 30000;
const LOOKUP_EXEC_TIMEOUT_MS = 45000;
/** The clone job keeps running server-side if the CLI stops waiting. */
const CLONE_WAIT_TIMEOUT_MS = 240000;
const CLONE_EXEC_TIMEOUT_MS = 300000;

export type AddProjectProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azure-devops';
export type AddProjectSourceId = 'url' | AddProjectProviderId;

export type AddProjectProviderAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';
export type AddProjectProviderStatus = 'available' | 'missing' | 'unsupported';

export type AddProjectProviderDiscovery = {
  provider: AddProjectProviderId;
  label: string;
  status: AddProjectProviderStatus;
  installHint: string;
  detail?: string;
  auth: { status: AddProjectProviderAuthStatus; detail?: string };
};

export type AddProjectSourceControlDiscovery = {
  providers: AddProjectProviderDiscovery[];
};

export type AddProjectBrowseEntry = {
  name: string;
  fullPath: string;
  /** True when the folder contains a `.git` entry (newer gxserver with `details: true`). */
  git?: boolean;
  /** Current branch or short detached commit hash when `git` is true. */
  branch?: string;
  /** Detected main language from the folder's manifest files. */
  language?: string;
  /** Registered Ghostex project id when this folder is already in Ghostex. */
  projectId?: string;
};

export type AddProjectBrowseResult = {
  /** Server-resolved absolute directory the entries live in. */
  parentPath: string;
  entries: AddProjectBrowseEntry[];
  /** True when listing top-level Windows drives at `/`. */
  isDriveList?: boolean;
  /** True when the server hit its time budget or skipped a network share for details. */
  detailsPartial?: boolean;
};

export type AddProjectPlace = {
  name: string;
  path: string;
  kind?: string;
};

export type AddProjectSuggestion = {
  name: string;
  path: string;
  branch?: string;
  language?: string;
  /** `'otherApps'` | `'projectFolder'` | `''` */
  source: string;
  /** Parent project folder name when `source === 'projectFolder'`. */
  from?: string;
};

export type AddProjectPlaces = {
  home: string;
  platform: string;
  defaultProjectsFolder?: string;
  volumes: AddProjectPlace[];
  standard: AddProjectPlace[];
  projectFolders: AddProjectPlace[];
  otherApps: AddProjectPlace[];
  recent: AddProjectPlace[];
  pinned: AddProjectPlace[];
  suggested: AddProjectSuggestion[];
};

export type AddProjectCreatedDirectory = {
  name: string;
  path: string;
};

export type AddProjectRepositoryInfo = {
  provider: string;
  nameWithOwner: string;
  url: string;
  sshUrl: string;
};

export type AddProjectCloneResult = {
  /** Path the daemon registered the cloned project at. */
  projectPath: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  const text = readString(value).trim();
  return text.length > 0 ? text : undefined;
}

function firstJsonObject(output: string): JsonObject | null {
  return scanJsonObjects<JsonObject>(output, (text, start) => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (isObject(parsed)) return { done: true, result: parsed };
    } catch {
      // Login-shell banners can contain brace blocks; keep scanning.
    }
    return { done: false, nextIndex: start + 1 };
  });
}

/**
 * The most specific failure text a CLI JSON payload carries. A failed clone
 * reports through the job record while the envelope still says `ok: true`.
 * `message` is preferred over `error` at the envelope level because gxserver's
 * `error` is the machine-readable code ("notFound") and `message` is the
 * sentence meant for a person; the clone job record is the other way round.
 */
function structuredError(json: JsonObject | null): string | null {
  if (json === null) return null;
  const job = isObject(json.job) ? json.job : null;
  const candidates = [
    job === null ? '' : readString(job.error),
    job === null ? '' : readString(job.message),
    readString(json.message),
    readString(json.error),
  ];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

async function runAddProjectCli(
  machine: MachineConnectionTarget,
  command: string,
  timeoutMs: number,
): Promise<JsonObject> {
  let output = '';
  let json: JsonObject | null = null;
  let failed = false;
  try {
    await ensureConnected(machine, { dialNow: true, reason: 'adding a project' });
    const result = await execRemoteCommand(machine.id, command, timeoutMs);
    output = `${result.stdout}\n${result.stderr}`.trim();
    json = firstJsonObject(result.stdout);
    const ok = json === null || typeof json.ok !== 'boolean' || json.ok;
    failed = result.exitCode !== 0 || !ok;
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
    failed = true;
  }
  if (!failed && json !== null) return json;
  const structured = structuredError(json);
  if (structured !== null) {
    // `ghostex <unknown verb> --json` reports through the JSON envelope, and its
    // `error` carries the CLI's whole usage dump. That is an outdated machine,
    // not an error worth printing.
    throw new Error(isOutdatedMachineFailure(structured) ? FailureCopy.outdatedForFeature : structured);
  }
  const machineHasPassword = await hasPassword(machine.id);
  throw new Error(summarizeFailure(output, machineHasPassword));
}

async function tryAddProjectHttpRpc(
  machine: MachineConnectionTarget,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ kind: 'answered'; answer: RpcAnswer } | { kind: 'unavailable' }> {
  try {
    const link = chatMachineLink(machine);
    if ((await link.route()) !== 'socket') return { kind: 'unavailable' };
    const sent = await link.request(method, params, timeoutMs);
    if (sent.kind !== 'answered') return { kind: 'unavailable' };
    return { kind: 'answered', answer: sent.answer };
  } catch {
    return { kind: 'unavailable' };
  }
}

function parseBrowseEntries(value: unknown): AddProjectBrowseEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: AddProjectBrowseEntry[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = readString(raw.name);
    const fullPath = readString(raw.fullPath);
    if (name.length === 0 || fullPath.length === 0) continue;
    const git = raw.git === true ? true : undefined;
    const branch = readOptionalNonEmptyString(raw.branch);
    const language = readOptionalNonEmptyString(raw.language);
    const projectId = readOptionalNonEmptyString(raw.projectId);
    entries.push({
      name,
      fullPath,
      ...(git !== undefined ? { git } : {}),
      ...(branch !== undefined ? { branch } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    });
  }
  return entries;
}

function parsePlacesList(value: unknown): AddProjectPlace[] {
  if (!Array.isArray(value)) return [];
  const places: AddProjectPlace[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = readOptionalNonEmptyString(raw.name);
    const path = readOptionalNonEmptyString(raw.path);
    if (name === undefined || path === undefined) continue;
    const kind = readOptionalNonEmptyString(raw.kind);
    places.push({
      name,
      path,
      ...(kind !== undefined ? { kind } : {}),
    });
  }
  return places;
}

function parseSuggestionsList(value: unknown): AddProjectSuggestion[] {
  if (!Array.isArray(value)) return [];
  const suggestions: AddProjectSuggestion[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = readOptionalNonEmptyString(raw.name);
    const path = readOptionalNonEmptyString(raw.path);
    if (name === undefined || path === undefined) continue;
    const branch = readOptionalNonEmptyString(raw.branch);
    const language = readOptionalNonEmptyString(raw.language);
    const from = readOptionalNonEmptyString(raw.from);
    suggestions.push({
      name,
      path,
      source: readString(raw.source),
      ...(branch !== undefined ? { branch } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(from !== undefined ? { from } : {}),
    });
  }
  return suggestions;
}

function parseAddProjectPlaces(
  value: unknown,
  defaultProjectsFolder?: string | null,
): AddProjectPlaces | null {
  if (!isObject(value)) return null;
  const home = readOptionalNonEmptyString(value.home);
  if (home === undefined) return null;
  const normalizedDefault =
    defaultProjectsFolder !== undefined && defaultProjectsFolder !== null && defaultProjectsFolder.trim().length > 0
      ? defaultProjectsFolder.trim()
      : undefined;
  return {
    home,
    platform: readString(value.platform),
    ...(normalizedDefault !== undefined ? { defaultProjectsFolder: normalizedDefault } : {}),
    volumes: parsePlacesList(value.volumes),
    standard: parsePlacesList(value.standard),
    projectFolders: parsePlacesList(value.projectFolders),
    otherApps: parsePlacesList(value.otherApps),
    recent: parsePlacesList(value.recent),
    pinned: parsePlacesList(value.pinned),
    suggested: parseSuggestionsList(value.suggested),
  };
}

/** Best-effort read of the computer's configured Default projects folder setting. */
async function readDefaultProjectsFolder(machine: MachineConnectionTarget): Promise<string | null> {
  if (isCloudBoxMachineId(machine.id)) return null;
  try {
    const result = await runGhostexCli(machine, 'ghostex settings get defaultProjectsFolder --json');
    const current = result.json?.current;
    if (typeof current !== 'string') return null;
    const trimmed = current.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Fetches Add Project places and suggested repositories from `/api/projectPickerPlaces`.
 *
 * On older computers (which answer 404 / `notFound`) or legacy SSH-only links, read calls
 * return `null` with zero errors so the UI degrades cleanly to the existing flow.
 * Explicit `pin` / `unpin` writes throw on failure so the user sees feedback.
 */
export async function fetchProjectPickerPlaces(
  machine: MachineConnectionTarget,
  options?: { pin?: string; unpin?: string; refresh?: boolean; defaultProjectsFolder?: string | null },
): Promise<AddProjectPlaces | null> {
  const isMutation = options?.pin !== undefined || options?.unpin !== undefined;
  const params: Record<string, unknown> = {};
  if (options?.pin !== undefined) params.pin = options.pin;
  if (options?.unpin !== undefined) params.unpin = options.unpin;
  if (options?.refresh === true) params.refresh = true;

  const defaultFolderPromise =
    options?.defaultProjectsFolder !== undefined
      ? Promise.resolve(options.defaultProjectsFolder)
      : isMutation
        ? Promise.resolve(null)
        : readDefaultProjectsFolder(machine);

  const [rpc, defaultProjectsFolder] = await Promise.all([
    tryAddProjectHttpRpc(machine, 'projectPickerPlaces', params, INVENTORY_EXEC_TIMEOUT_MS),
    defaultFolderPromise,
  ]);

  if (rpc.kind !== 'answered') {
    if (isMutation) {
      throw new Error('Could not update pinned folders on this machine.');
    }
    return null;
  }
  if (rpc.answer.error !== null) {
    if (isMutation) {
      throw new Error(rpc.answer.error.message);
    }
    return null;
  }
  const parsed = parseAddProjectPlaces(rpc.answer.result, defaultProjectsFolder);
  if (parsed === null && isMutation) {
    throw new Error('The machine returned an unexpected answer when updating pinned folders.');
  }
  return parsed;
}

/** Directory suggestions for one directory query (no `cwd`, dirs only). */
export async function browseDirectories(
  machine: MachineConnectionTarget,
  partialPath: string,
  options?: { details?: boolean },
): Promise<AddProjectBrowseResult> {
  const wantDetails = options?.details !== false;
  if (wantDetails) {
    const rpc = await tryAddProjectHttpRpc(
      machine,
      'browseProjectDirectories',
      { partialPath, details: true },
      INVENTORY_EXEC_TIMEOUT_MS,
    );
    if (rpc.kind === 'answered') {
      if (rpc.answer.error !== null) {
        // Fall through to SSH CLI only on transport unreachability; surface real server errors.
        if (rpc.answer.error.code !== 'unreachable') {
          throw new Error(rpc.answer.error.message);
        }
      } else if (isObject(rpc.answer.result)) {
        const result = rpc.answer.result;
        return {
          parentPath: readString(result.parentPath),
          entries: parseBrowseEntries(result.entries),
          ...(result.isDriveList === true ? { isDriveList: true } : {}),
          ...(result.detailsPartial === true ? { detailsPartial: true } : {}),
        };
      }
    }
  }
  const json = await runAddProjectCli(machine, browseDirectoriesCommand(partialPath), INVENTORY_EXEC_TIMEOUT_MS);
  return {
    parentPath: readString(json.parentPath),
    entries: parseBrowseEntries(json.entries),
    ...(json.isDriveList === true ? { isDriveList: true } : {}),
    ...(json.detailsPartial === true ? { detailsPartial: true } : {}),
  };
}

/**
 * Creates a child directory inside an existing parent folder via `/api/createProjectDirectory`.
 * Returns `null` when the computer has no warm HTTP link or predates the endpoint so the caller
 * can fall back to setting the path input and creating on submit.
 */
export async function createProjectDirectory(
  machine: MachineConnectionTarget,
  parentPath: string,
  name: string,
): Promise<AddProjectCreatedDirectory | null> {
  const rpc = await tryAddProjectHttpRpc(
    machine,
    'createProjectDirectory',
    { parentPath, name },
    INVENTORY_EXEC_TIMEOUT_MS,
  );
  if (rpc.kind !== 'answered') return null;
  if (rpc.answer.error !== null) {
    if (rpc.answer.error.code === 'notFound' || rpc.answer.error.code === 'unreachable') {
      return null;
    }
    throw new Error(rpc.answer.error.message);
  }
  const result = isObject(rpc.answer.result) ? rpc.answer.result : null;
  const createdPath = result === null ? '' : readString(result.path);
  if (createdPath.length === 0) return null;
  return {
    name: readString(result?.name) || name,
    path: createdPath,
  };
}

const PROVIDER_IDS: readonly AddProjectProviderId[] = ['github', 'gitlab', 'bitbucket', 'azure-devops'];

function parseProviderDiscovery(value: unknown): AddProjectProviderDiscovery | null {
  if (!isObject(value)) return null;
  const provider = readString(value.provider) as AddProjectProviderId;
  if (!PROVIDER_IDS.includes(provider)) return null;
  const status = readString(value.status);
  const auth = isObject(value.auth) ? value.auth : null;
  const authStatus = auth === null ? '' : readString(auth.status);
  const authDetail = auth === null ? '' : readString(auth.detail);
  const detail = readString(value.detail);
  return {
    provider,
    label: readString(value.label),
    status: status === 'available' || status === 'missing' || status === 'unsupported' ? status : 'unsupported',
    installHint: readString(value.installHint),
    ...(detail.length > 0 ? { detail } : {}),
    auth: {
      status: authStatus === 'authenticated' || authStatus === 'unauthenticated' ? authStatus : 'unknown',
      ...(authDetail.length > 0 ? { detail: authDetail } : {}),
    },
  };
}

/** Which hosting CLIs this machine can clone with. */
export async function discoverSourceControl(
  machine: MachineConnectionTarget,
): Promise<AddProjectSourceControlDiscovery> {
  const json = await runAddProjectCli(
    machine,
    discoverSourceControlCommand({ timeoutMs: DISCOVERY_RPC_TIMEOUT_MS }),
    DISCOVERY_EXEC_TIMEOUT_MS,
  );
  const discovery = isObject(json.discovery) ? json.discovery : null;
  const rawProviders = discovery === null ? [] : discovery.providers;
  const providers: AddProjectProviderDiscovery[] = [];
  if (Array.isArray(rawProviders)) {
    for (const raw of rawProviders) {
      const parsed = parseProviderDiscovery(raw);
      if (parsed !== null) providers.push(parsed);
    }
  }
  return { providers };
}

/** Resolve `owner/repo` into clone URLs through the machine's gh/glab CLI. */
export async function lookupRepository(
  machine: MachineConnectionTarget,
  provider: SourceControlLookupProvider,
  repository: string,
): Promise<AddProjectRepositoryInfo> {
  const json = await runAddProjectCli(
    machine,
    lookupRepositoryCommand(provider, repository, { timeoutMs: LOOKUP_RPC_TIMEOUT_MS }),
    LOOKUP_EXEC_TIMEOUT_MS,
  );
  const raw = isObject(json.repository) ? json.repository : null;
  const sshUrl = raw === null ? '' : readString(raw.sshUrl);
  const url = raw === null ? '' : readString(raw.url);
  if (sshUrl.length === 0 && url.length === 0) {
    throw new Error('The machine returned no clone URL for this repository.');
  }
  return {
    provider: raw === null ? provider : readString(raw.provider),
    nameWithOwner: raw === null ? repository : readString(raw.nameWithOwner),
    url,
    sshUrl,
  };
}

/**
 * Clone into `destinationPath` and register the result as a project. The
 * daemon's clone job performs the registration itself, so there is no separate
 * add step afterwards.
 */
export async function cloneRepository(
  machine: MachineConnectionTarget,
  remoteUrl: string,
  destinationPath: string,
): Promise<AddProjectCloneResult> {
  const json = await runAddProjectCli(
    machine,
    cloneRepositoryCommand(remoteUrl, destinationPath, {
      waitTimeoutMs: CLONE_WAIT_TIMEOUT_MS,
      timeoutMs: LOOKUP_RPC_TIMEOUT_MS,
      workspaceId: addedProjectWorkspaceId(machine.id),
    }),
    CLONE_EXEC_TIMEOUT_MS,
  );
  if (json.waitTimedOut === true) {
    throw new Error('The clone is still running on the machine. Reopen the project list once it finishes.');
  }
  const job = isObject(json.job) ? json.job : null;
  const state = job === null ? '' : readString(job.state);
  if (job === null || state !== 'completed') {
    throw new Error(structuredError(json) ?? 'The clone did not finish.');
  }
  return { projectPath: readString(job.projectPath) };
}

/** Register a directory as a Ghostex project, creating it when asked. */
export async function addProjectPath(
  machine: MachineConnectionTarget,
  path: string,
  options: { createIfMissing: boolean },
): Promise<void> {
  await runAddProjectCli(
    machine,
    addProjectCommand(path, {
      createIfMissing: options.createIfMissing,
      workspaceId: addedProjectWorkspaceId(machine.id),
    }),
    INVENTORY_EXEC_TIMEOUT_MS,
  );
}
