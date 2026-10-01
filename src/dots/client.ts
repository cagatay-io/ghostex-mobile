/**
 * OpenDots calls from the phone: one `ghostex dots rpc <method> --params-base64 <json>` SSH exec per
 * call, the verb printing gxserver's own `{ok, result}` or `{ok:false, code, message}` line
 * (CONTRACT.md §7), exactly the way the chat reaches gxserver through `ghostex session-chat-rpc`.
 * One typed function per `/api/openDotsRpc` method (CONTRACT.md §2).
 *
 * CDXC:OpenDots 2026-10-01 WHY:
 * The phone reaches the computer only by SSH exec, so it shares the desktop's method list through one CLI verb instead of growing a CLI verb per action; a method gxserver adds needs only a typed wrapper here.
 * SEE-ALSO: server/src/ghostex_cli/dots/, server/src/open_dots/mod.rs, src/chat/rust/transport.ts.
 */

import { GhostexNative, type ExecResult } from '../../modules/ghostex-native/src';
import { loginShellCommand } from '../commands/ghostexCli';
import { ensureConnected } from '../inventory/client';
import type { MachineConnectionTarget } from '../machines/credentials';
import { execRemoteCommand, remoteEnvironment } from '../remote/commands';
import {
  parseApproval,
  parseBrowserScreenshot,
  parseDot,
  parseDotsSnapshot,
  parseFileEntries,
  parseRoutine,
  parseTeam,
  type BrowserInput,
  type BrowserScreenshot,
  type Dot,
  type DotApproval,
  type DotFileEntry,
  type DotLook,
  type DotRoutine,
  type DotsSnapshot,
  type DotTeam,
  type RuleDecision,
} from './types';

/** Room for gxserver plus the SSH exec itself. */
const DEFAULT_TIMEOUT_MS = 45_000;
/** Creating a session (startChat, a team chat, a routine run) can take a while on a busy computer. */
const LAUNCH_TIMEOUT_MS = 90_000;

/** A refusal from gxserver (or the transport), with a message a customer can read. */
export class DotsRpcError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'DotsRpcError';
    this.code = code;
  }
}

/** UTF-8 bytes of `text` as a binary string, for `btoa`. */
function utf8Binary(text: string): string {
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) out += String.fromCharCode(code);
    else if (code < 0x800) out += String.fromCharCode(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out += String.fromCharCode(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out += String.fromCharCode(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
  }
  return out;
}

function checkMethod(method: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(method)) throw new Error(`Invalid OpenDots method: ${method}`);
}

/** The `dots rpc` command line for one call. Base64 so no shell re-quotes the JSON. */
export function dotsRpcCommand(method: string, params: unknown): string {
  checkMethod(method);
  return `ghostex dots rpc ${method} --params-base64 ${btoa(utf8Binary(JSON.stringify(params ?? {})))}`;
}

/**
 * Methods whose params carry a secret (a saved login's password, the Composio triggers key).
 *
 * CDXC:OpenDots 2026-10-01 WHY:
 * On a macOS or Linux computer these params travel on the SSH exec's standard input (`--params-stdin`) instead of the command line, where every user of that computer could read them in the process list while the call runs. A Windows or WSL computer keeps `--params-base64`: its exec already sends the PowerShell script itself over standard input, and Windows does not show other users' command lines without administrator rights.
 */
const SECRET_METHODS = new Set(['addPassword', 'setTriggersKey']);

/** Runs one `dots rpc` call on the computer, secrets on standard input where the shell allows. */
async function execDotsRpc(
  machine: MachineConnectionTarget,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number
): Promise<ExecResult> {
  if (SECRET_METHODS.has(method) && (await remoteEnvironment(machine.id)).kind === 'posix') {
    checkMethod(method);
    return GhostexNative.execWithInput(
      machine.id,
      loginShellCommand(`ghostex dots rpc ${method} --params-stdin`),
      JSON.stringify(params),
      timeoutMs
    );
  }
  return execRemoteCommand(machine.id, dotsRpcCommand(method, params), timeoutMs);
}

/** The last stdout line that parses as a JSON object: the verb prints exactly one. */
function lastJsonLine(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A shell banner line; keep looking.
    }
  }
  return null;
}

const UPDATE_GHOSTEX = 'Update Ghostex on this computer to use OpenDots from the phone.';

/** One OpenDots call. Throws `DotsRpcError` with gxserver's own message on a refusal. */
export async function dotsRpc(
  machine: MachineConnectionTarget,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  let stdout = '';
  let stderr = '';
  try {
    await ensureConnected(machine);
    const exec = await execDotsRpc(machine, method, params, timeoutMs);
    stdout = exec.stdout;
    stderr = exec.stderr;
  } catch (error) {
    throw new DotsRpcError(error instanceof Error ? error.message : String(error), 'unreachable');
  }
  const outcome = lastJsonLine(stdout);
  if (outcome?.ok === true) return outcome.result ?? null;
  if (outcome?.ok === false) {
    throw new DotsRpcError(
      typeof outcome.message === 'string' && outcome.message.length > 0 ? outcome.message : 'Request failed.',
      typeof outcome.code === 'string' ? outcome.code : null
    );
  }
  const detail = `${stderr}`.trim() || `${stdout}`.trim();
  // An older Ghostex has no `dots` verb (or no `dots rpc` yet) and prints its usage instead.
  if (/Unknown command: dots|Unknown dots command/u.test(detail)) {
    throw new DotsRpcError(UPDATE_GHOSTEX, 'unsupportedClient');
  }
  throw new DotsRpcError(detail.split('\n').slice(-1)[0] || 'The computer did not answer the OpenDots request.', null);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dotFrom(value: unknown): Dot {
  const dot = parseDot(record(record(value).dot));
  if (dot === null) throw new DotsRpcError('The computer answered without the dot.', null);
  return dot;
}

export type ChatTarget = { projectId: string; sessionId: string };

function chatTargetFrom(value: unknown): ChatTarget {
  const result = record(value);
  const projectId = typeof result.projectId === 'string' ? result.projectId : '';
  const sessionId = typeof result.sessionId === 'string' ? result.sessionId : '';
  if (sessionId.length === 0) throw new DotsRpcError('The computer did not start the chat.', null);
  return { projectId, sessionId };
}

// ---------------------------------------------------------------------------
// Typed methods (CONTRACT.md §2).
// ---------------------------------------------------------------------------

export async function fetchSnapshot(machine: MachineConnectionTarget): Promise<DotsSnapshot> {
  return parseDotsSnapshot(await dotsRpc(machine, 'snapshot'));
}

export type DotFields = {
  name?: string;
  purpose?: string;
  instructions?: string;
  look?: DotLook;
  agentId?: string;
  model?: string | null;
};

export async function createDot(machine: MachineConnectionTarget, fields: DotFields & { name: string }): Promise<Dot> {
  return dotFrom(await dotsRpc(machine, 'createDot', fields, LAUNCH_TIMEOUT_MS));
}

export async function updateDot(machine: MachineConnectionTarget, dotId: string, fields: DotFields): Promise<Dot> {
  return dotFrom(await dotsRpc(machine, 'updateDot', { dotId, ...fields }));
}

export async function deleteDot(machine: MachineConnectionTarget, dotId: string): Promise<void> {
  await dotsRpc(machine, 'deleteDot', { dotId }, LAUNCH_TIMEOUT_MS);
}

export async function pauseDot(machine: MachineConnectionTarget, dotId: string): Promise<Dot> {
  return dotFrom(await dotsRpc(machine, 'pauseDot', { dotId }));
}

export async function resumeDot(machine: MachineConnectionTarget, dotId: string): Promise<Dot> {
  return dotFrom(await dotsRpc(machine, 'resumeDot', { dotId }));
}

export async function stopDot(machine: MachineConnectionTarget, dotId: string): Promise<Dot> {
  return dotFrom(await dotsRpc(machine, 'stopDot', { dotId }));
}

export async function startChat(
  machine: MachineConnectionTarget,
  dotId: string,
  options?: { message?: string; title?: string }
): Promise<ChatTarget> {
  const params: Record<string, unknown> = { dotId };
  if (options?.message !== undefined && options.message.trim().length > 0) params.message = options.message.trim();
  if (options?.title !== undefined && options.title.trim().length > 0) params.title = options.title.trim();
  return chatTargetFrom(await dotsRpc(machine, 'startChat', params, LAUNCH_TIMEOUT_MS));
}

export async function startTeamChat(
  machine: MachineConnectionTarget,
  team: { name: string; leadId: string; memberIds: string[]; message: string }
): Promise<ChatTarget & { team: DotTeam | null }> {
  const result = await dotsRpc(machine, 'startTeamChat', team, LAUNCH_TIMEOUT_MS);
  return { ...chatTargetFrom(result), team: parseTeam(record(record(result).team)) };
}

export async function deleteTeam(machine: MachineConnectionTarget, teamId: string): Promise<void> {
  await dotsRpc(machine, 'deleteTeam', { teamId });
}

export async function addRule(
  machine: MachineConnectionTarget,
  dotId: string | null,
  action: string,
  decision: RuleDecision
): Promise<void> {
  await dotsRpc(machine, 'addRule', { dotId, action, decision });
}

export async function deleteRule(machine: MachineConnectionTarget, ruleId: string): Promise<void> {
  await dotsRpc(machine, 'deleteRule', { ruleId });
}

export async function addMemory(machine: MachineConnectionTarget, dotId: string, text: string): Promise<void> {
  await dotsRpc(machine, 'addMemory', { dotId, text });
}

export async function deleteMemory(machine: MachineConnectionTarget, memoryId: string): Promise<void> {
  await dotsRpc(machine, 'deleteMemory', { memoryId });
}

export async function saveSkill(
  machine: MachineConnectionTarget,
  skill: { dotId: string; name: string; description: string; body: string }
): Promise<void> {
  await dotsRpc(machine, 'saveSkill', skill);
}

export async function deleteSkill(machine: MachineConnectionTarget, skillId: string): Promise<void> {
  await dotsRpc(machine, 'deleteSkill', { skillId });
}

export async function addRoutine(
  machine: MachineConnectionTarget,
  routine: { dotId: string; name: string; instruction: string; schedule: string }
): Promise<DotRoutine | null> {
  return parseRoutine(record(record(await dotsRpc(machine, 'addRoutine', routine)).routine));
}

export async function updateRoutine(
  machine: MachineConnectionTarget,
  routineId: string,
  fields: { name?: string; instruction?: string; schedule?: string; enabled?: boolean }
): Promise<void> {
  await dotsRpc(machine, 'updateRoutine', { routineId, ...fields });
}

export async function deleteRoutine(machine: MachineConnectionTarget, routineId: string): Promise<void> {
  await dotsRpc(machine, 'deleteRoutine', { routineId });
}

export async function runRoutineNow(machine: MachineConnectionTarget, routineId: string): Promise<ChatTarget> {
  return chatTargetFrom(await dotsRpc(machine, 'runRoutineNow', { routineId }, LAUNCH_TIMEOUT_MS));
}

export async function addPassword(
  machine: MachineConnectionTarget,
  login: { site: string; username: string; password: string }
): Promise<void> {
  await dotsRpc(machine, 'addPassword', login);
}

export async function deletePassword(machine: MachineConnectionTarget, passwordId: string): Promise<void> {
  await dotsRpc(machine, 'deletePassword', { passwordId });
}

export type ApprovalChoice = 'approve' | 'deny' | 'always' | 'answer';

export async function resolveApproval(
  machine: MachineConnectionTarget,
  approvalId: string,
  choice: ApprovalChoice,
  answer?: string
): Promise<DotApproval | null> {
  const params: Record<string, unknown> = { approvalId, choice };
  if (answer !== undefined) params.answer = answer;
  return parseApproval(record(record(await dotsRpc(machine, 'resolveApproval', params)).approval));
}

export async function markUpdatesRead(
  machine: MachineConnectionTarget,
  scope?: { dotId?: string; updateIds?: string[] }
): Promise<void> {
  await dotsRpc(machine, 'markUpdatesRead', scope ?? {});
}

export async function listFiles(machine: MachineConnectionTarget, dotId: string): Promise<DotFileEntry[]> {
  return parseFileEntries(record(await dotsRpc(machine, 'listFiles', { dotId })).files);
}

export async function browserScreenshot(
  machine: MachineConnectionTarget,
  dotId: string,
  wake = false
): Promise<BrowserScreenshot> {
  return parseBrowserScreenshot(
    await dotsRpc(machine, 'browserScreenshot', { dotId, wake }, wake ? LAUNCH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)
  );
}

export async function browserInput(
  machine: MachineConnectionTarget,
  dotId: string,
  input: BrowserInput
): Promise<void> {
  await dotsRpc(machine, 'browserInput', { dotId, ...input });
}

export async function browserTakeOver(machine: MachineConnectionTarget, dotId: string): Promise<boolean> {
  return record(await dotsRpc(machine, 'browserTakeOver', { dotId })).takenOver === true;
}

export async function browserHandBack(machine: MachineConnectionTarget, dotId: string): Promise<boolean> {
  return record(await dotsRpc(machine, 'browserHandBack', { dotId })).takenOver === true;
}

export async function browserReset(machine: MachineConnectionTarget, dotId: string): Promise<void> {
  await dotsRpc(machine, 'browserReset', { dotId }, LAUNCH_TIMEOUT_MS);
}

export async function composioRefresh(machine: MachineConnectionTarget): Promise<void> {
  await dotsRpc(machine, 'composioRefresh');
}

/** `{ url }` to open, or null when gxserver is already signed in. */
export async function composioSignIn(machine: MachineConnectionTarget): Promise<string | null> {
  const url = record(await dotsRpc(machine, 'composioSignIn')).url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

export async function composioSignOut(machine: MachineConnectionTarget): Promise<void> {
  await dotsRpc(machine, 'composioSignOut');
}

/** An empty key removes it. Answers gxserver's own validation error, or null. */
export async function setTriggersKey(machine: MachineConnectionTarget, key: string): Promise<string | null> {
  const error = record(await dotsRpc(machine, 'setTriggersKey', { key })).error;
  return typeof error === 'string' && error.length > 0 ? error : null;
}

export type TriggerApp = { slug: string; name: string; connected: boolean };

export async function triggerApps(machine: MachineConnectionTarget): Promise<TriggerApp[]> {
  const apps = record(await dotsRpc(machine, 'triggerApps')).apps;
  if (!Array.isArray(apps)) return [];
  return apps.flatMap((app) => {
    const entry = record(app);
    const slug = typeof entry.slug === 'string' ? entry.slug : '';
    if (slug.length === 0) return [];
    return [{ slug, name: typeof entry.name === 'string' ? entry.name : slug, connected: entry.connected === true }];
  });
}

export async function connectTriggerApp(machine: MachineConnectionTarget, toolkit: string): Promise<string | null> {
  const url = record(await dotsRpc(machine, 'connectTriggerApp', { toolkit })).url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

export type TriggerField = {
  name: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
};
export type TriggerType = { slug: string; name: string; description: string; fields: TriggerField[] };

export async function triggerTypes(machine: MachineConnectionTarget, toolkit: string): Promise<TriggerType[]> {
  const types = record(await dotsRpc(machine, 'triggerTypes', { toolkit })).types;
  if (!Array.isArray(types)) return [];
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return types.flatMap((type) => {
    const entry = record(type);
    const slug = text(entry.slug);
    if (slug.length === 0) return [];
    const fields = Array.isArray(entry.fields) ? entry.fields : [];
    return [
      {
        slug,
        name: text(entry.name) || slug,
        description: text(entry.description),
        fields: fields.flatMap((field) => {
          const value = record(field);
          const name = text(value.name);
          if (name.length === 0) return [];
          return [
            {
              name,
              type: text(value.type),
              title: text(value.title) || name,
              description: text(value.description),
              required: value.required === true,
              ...(Array.isArray(value.enum)
                ? { enum: value.enum.filter((option): option is string => typeof option === 'string') }
                : {}),
              ...('default' in value ? { default: value.default } : {}),
            },
          ];
        }),
      },
    ];
  });
}

export async function addTrigger(
  machine: MachineConnectionTarget,
  trigger: { dotId: string; toolkit: string; slug: string; config: Record<string, unknown>; instruction: string }
): Promise<void> {
  await dotsRpc(machine, 'addTrigger', trigger);
}

export async function setTriggerEnabled(
  machine: MachineConnectionTarget,
  triggerId: string,
  enabled: boolean
): Promise<void> {
  await dotsRpc(machine, 'setTriggerEnabled', { triggerId, enabled });
}

export async function deleteTrigger(machine: MachineConnectionTarget, triggerId: string): Promise<void> {
  await dotsRpc(machine, 'deleteTrigger', { triggerId });
}

/** The MCP tool list a dot's sessions see (`ghostex dots mcp`); the phone reads it only to show it. */
export async function toolList(machine: MachineConnectionTarget, dotId: string): Promise<unknown[]> {
  const tools = record(await dotsRpc(machine, 'toolList', { dotId })).tools;
  return Array.isArray(tools) ? tools : [];
}
