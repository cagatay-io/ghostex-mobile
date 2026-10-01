/**
 * OpenDots wire types on the phone, exactly the JSON gxserver's `/api/openDotsRpc` answers
 * (docs/2026-10-01/opendots/CONTRACT.md §1 and §2 in the Ghostex repo), plus a defensive
 * `parseDotsSnapshot` so a half-written or older daemon answer never crashes a screen.
 */

import { normalizeLook } from './look';

export const DOT_SHAPES = ['round', 'chubby', 'tall'] as const;
export const DOT_MATERIALS = ['soft', 'glossy', 'velvet', 'toon'] as const;
export const DOT_EYES = ['classic', 'happy', 'wide', 'wink'] as const;
export const DOT_ACCESSORIES = ['none', 'bow', 'cap', 'antenna', 'halo', 'sprout', 'headphones'] as const;

export type DotShape = (typeof DOT_SHAPES)[number];
export type DotMaterial = (typeof DOT_MATERIALS)[number];
export type DotEyes = (typeof DOT_EYES)[number];
export type DotAccessory = (typeof DOT_ACCESSORIES)[number];

/** The flat dot character (Open Dot's DotOrb look). */
export type DotLook = {
  shape: DotShape;
  color: string;
  accent: string;
  eyeColor: string;
  material: DotMaterial;
  eyes: DotEyes;
  accessory: DotAccessory;
};

export type DotStatus = 'idle' | 'working' | 'waiting' | 'paused';

export type Dot = {
  id: string;
  name: string;
  purpose: string;
  instructions: string;
  look: DotLook;
  agentId: string;
  model: string | null;
  paused: boolean;
  status: DotStatus;
  activity: string | null;
  projectId: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
};

export type RuleDecision = 'allow' | 'ask' | 'never';

export type DotRule = { id: string; dotId: string | null; action: string; decision: RuleDecision; createdAt: number };
export type DotMemory = { id: string; dotId: string; text: string; createdAt: number };
export type DotSkill = {
  id: string;
  dotId: string;
  name: string;
  description: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};
export type DotRoutine = {
  id: string;
  dotId: string;
  name: string;
  instruction: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  sessionId: string | null;
  createdAt: number;
};
export type DotTrigger = {
  id: string;
  dotId: string;
  composioId: string;
  slug: string;
  toolkit: string;
  name: string;
  instruction: string;
  enabled: boolean;
  lastFiredAt: number | null;
  lastError: string | null;
  sessionId: string | null;
  createdAt: number;
};
export type DotPassword = { id: string; site: string; username: string; createdAt: number };

export type ApprovalKind = 'approval' | 'question' | 'connect';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'answered' | 'expired';
export type DotApproval = {
  id: string;
  dotId: string;
  projectId: string;
  sessionId: string | null;
  kind: ApprovalKind;
  status: ApprovalStatus;
  title: string;
  detail: string | null;
  tool: string | null;
  options: string[];
  ruleAction: string | null;
  toolkit: string | null;
  url: string | null;
  answer: string | null;
  createdAt: number;
  resolvedAt: number | null;
};

export type DotUpdateFile = { name: string; path: string; size: number };
export type DotUpdate = {
  id: string;
  dotId: string;
  projectId: string;
  sessionId: string | null;
  title: string | null;
  text: string;
  files: DotUpdateFile[];
  read: boolean;
  createdAt: number;
};

export type DotHandoff = {
  id: string;
  fromDotId: string;
  toDotId: string;
  message: string;
  status: 'sent' | 'working' | 'replied' | 'failed';
  reply: string | null;
  createdAt: number;
  repliedAt: number | null;
};

export type DotTeam = {
  id: string;
  name: string;
  leadId: string;
  memberIds: string[];
  projectId: string;
  sessionId: string;
  createdAt: number;
};

export type DotAgentModel = { id: string; label: string };
export type DotAgentOption = { id: string; name: string; models: DotAgentModel[] };
export type DotApp = { slug: string; name: string; logo: string; connected: boolean };

export type DotsSettingsInfo = {
  composio: { signedIn: boolean; apps: DotApp[] };
  triggersKey: 'settings' | 'env' | null;
  vault: 'keychain' | 'file';
  chrome: string | null;
  agents: DotAgentOption[];
  defaultAgentId: string;
};

export type DotsSnapshot = {
  enabled: boolean;
  dots: Dot[];
  rules: DotRule[];
  memories: DotMemory[];
  skills: DotSkill[];
  routines: DotRoutine[];
  triggers: DotTrigger[];
  passwords: DotPassword[];
  approvals: DotApproval[];
  updates: DotUpdate[];
  handoffs: DotHandoff[];
  teams: DotTeam[];
  settings: DotsSettingsInfo;
};

export type DotFileEntry = { path: string; size: number; isDir: boolean; modifiedAt: number };

export type BrowserScreenshot = {
  /** Base64 JPEG, or null when no browser runs and `wake` was false. */
  image: string | null;
  mime: string;
  url: string;
  title: string;
  width: number;
  height: number;
  live: boolean;
  takenOver: boolean;
};

export type BrowserInputKind =
  'click' | 'doubleClick' | 'move' | 'type' | 'key' | 'scroll' | 'navigate' | 'back' | 'reload';

export type BrowserInput = {
  kind: BrowserInputKind;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  deltaX?: number;
  deltaY?: number;
  url?: string;
};

// ---------------------------------------------------------------------------
// Parsing (narrowing at the boundary; every list tolerates absence).
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(json: Json, key: string, fallback = ''): string {
  const value = json[key];
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(json: Json, key: string): string | null {
  const value = json[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(json: Json, key: string): number {
  const value = json[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numOrNull(json: Json, key: string): number | null {
  const value = json[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(json: Json, key: string, fallback = false): boolean {
  const value = json[key];
  return typeof value === 'boolean' ? value : fallback;
}

function list<T>(value: unknown, parse: (entry: Json) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const parsed = parse(entry);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseDot(json: Json): Dot | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    name: str(json, 'name', 'Dot'),
    purpose: str(json, 'purpose'),
    instructions: str(json, 'instructions'),
    look: normalizeLook(json.look),
    agentId: str(json, 'agentId'),
    model: strOrNull(json, 'model'),
    paused: bool(json, 'paused'),
    status: oneOf(json.status, ['idle', 'working', 'waiting', 'paused'] as const, 'idle'),
    activity: strOrNull(json, 'activity'),
    projectId: str(json, 'projectId'),
    folder: str(json, 'folder'),
    createdAt: num(json, 'createdAt'),
    updatedAt: num(json, 'updatedAt'),
  };
}

function parseRule(json: Json): DotRule | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: strOrNull(json, 'dotId'),
    action: str(json, 'action'),
    decision: oneOf(json.decision, ['allow', 'ask', 'never'] as const, 'ask'),
    createdAt: num(json, 'createdAt'),
  };
}

function parseMemory(json: Json): DotMemory | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return { id, dotId: str(json, 'dotId'), text: str(json, 'text'), createdAt: num(json, 'createdAt') };
}

function parseSkill(json: Json): DotSkill | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: str(json, 'dotId'),
    name: str(json, 'name'),
    description: str(json, 'description'),
    body: str(json, 'body'),
    createdAt: num(json, 'createdAt'),
    updatedAt: num(json, 'updatedAt'),
  };
}

export function parseRoutine(json: Json): DotRoutine | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: str(json, 'dotId'),
    name: str(json, 'name'),
    instruction: str(json, 'instruction'),
    schedule: str(json, 'schedule'),
    enabled: bool(json, 'enabled', true),
    lastRunAt: numOrNull(json, 'lastRunAt'),
    nextRunAt: numOrNull(json, 'nextRunAt'),
    sessionId: strOrNull(json, 'sessionId'),
    createdAt: num(json, 'createdAt'),
  };
}

function parseTrigger(json: Json): DotTrigger | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: str(json, 'dotId'),
    composioId: str(json, 'composioId'),
    slug: str(json, 'slug'),
    toolkit: str(json, 'toolkit'),
    name: str(json, 'name'),
    instruction: str(json, 'instruction'),
    enabled: bool(json, 'enabled', true),
    lastFiredAt: numOrNull(json, 'lastFiredAt'),
    lastError: strOrNull(json, 'lastError'),
    sessionId: strOrNull(json, 'sessionId'),
    createdAt: num(json, 'createdAt'),
  };
}

function parsePassword(json: Json): DotPassword | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return { id, site: str(json, 'site'), username: str(json, 'username'), createdAt: num(json, 'createdAt') };
}

export function parseApproval(json: Json): DotApproval | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: str(json, 'dotId'),
    projectId: str(json, 'projectId'),
    sessionId: strOrNull(json, 'sessionId'),
    kind: oneOf(json.kind, ['approval', 'question', 'connect'] as const, 'approval'),
    status: oneOf(json.status, ['pending', 'approved', 'denied', 'answered', 'expired'] as const, 'pending'),
    title: str(json, 'title'),
    detail: strOrNull(json, 'detail'),
    tool: strOrNull(json, 'tool'),
    options: Array.isArray(json.options)
      ? json.options.filter((option): option is string => typeof option === 'string' && option.length > 0)
      : [],
    ruleAction: strOrNull(json, 'ruleAction'),
    toolkit: strOrNull(json, 'toolkit'),
    url: strOrNull(json, 'url'),
    answer: strOrNull(json, 'answer'),
    createdAt: num(json, 'createdAt'),
    resolvedAt: numOrNull(json, 'resolvedAt'),
  };
}

function parseUpdate(json: Json): DotUpdate | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    dotId: str(json, 'dotId'),
    projectId: str(json, 'projectId'),
    sessionId: strOrNull(json, 'sessionId'),
    title: strOrNull(json, 'title'),
    text: str(json, 'text'),
    files: list(json.files, (file) => {
      const path = str(file, 'path');
      return path.length === 0 ? null : { name: str(file, 'name', path), path, size: num(file, 'size') };
    }),
    read: bool(json, 'read'),
    createdAt: num(json, 'createdAt'),
  };
}

function parseHandoff(json: Json): DotHandoff | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    fromDotId: str(json, 'fromDotId'),
    toDotId: str(json, 'toDotId'),
    message: str(json, 'message'),
    status: oneOf(json.status, ['sent', 'working', 'replied', 'failed'] as const, 'sent'),
    reply: strOrNull(json, 'reply'),
    createdAt: num(json, 'createdAt'),
    repliedAt: numOrNull(json, 'repliedAt'),
  };
}

export function parseTeam(json: Json): DotTeam | null {
  const id = str(json, 'id');
  if (id.length === 0) return null;
  return {
    id,
    name: str(json, 'name'),
    leadId: str(json, 'leadId'),
    memberIds: Array.isArray(json.memberIds)
      ? json.memberIds.filter((member): member is string => typeof member === 'string')
      : [],
    projectId: str(json, 'projectId'),
    sessionId: str(json, 'sessionId'),
    createdAt: num(json, 'createdAt'),
  };
}

function parseSettings(value: unknown): DotsSettingsInfo {
  const json = isObject(value) ? value : {};
  const composio = isObject(json.composio) ? json.composio : {};
  return {
    composio: {
      signedIn: bool(composio, 'signedIn'),
      apps: list(composio.apps, (app) => {
        const slug = str(app, 'slug');
        return slug.length === 0
          ? null
          : { slug, name: str(app, 'name', slug), logo: str(app, 'logo'), connected: bool(app, 'connected') };
      }),
    },
    triggersKey: json.triggersKey === 'settings' || json.triggersKey === 'env' ? json.triggersKey : null,
    vault: json.vault === 'file' ? 'file' : 'keychain',
    chrome: strOrNull(json, 'chrome'),
    agents: list(json.agents, (agent) => {
      const id = str(agent, 'id');
      if (id.length === 0) return null;
      return {
        id,
        name: str(agent, 'name', id),
        models: list(agent.models, (model) => {
          const modelId = str(model, 'id');
          return modelId.length === 0 ? null : { id: modelId, label: str(model, 'label', modelId) };
        }),
      };
    }),
    defaultAgentId: str(json, 'defaultAgentId', 'claude'),
  };
}

export const EMPTY_DOTS_SNAPSHOT: DotsSnapshot = {
  enabled: false,
  dots: [],
  rules: [],
  memories: [],
  skills: [],
  routines: [],
  triggers: [],
  passwords: [],
  approvals: [],
  updates: [],
  handoffs: [],
  teams: [],
  settings: parseSettings(null),
};

export function parseDotsSnapshot(value: unknown): DotsSnapshot {
  if (!isObject(value)) return EMPTY_DOTS_SNAPSHOT;
  return {
    enabled: bool(value, 'enabled'),
    dots: list(value.dots, parseDot),
    rules: list(value.rules, parseRule),
    memories: list(value.memories, parseMemory),
    skills: list(value.skills, parseSkill),
    routines: list(value.routines, parseRoutine),
    triggers: list(value.triggers, parseTrigger),
    passwords: list(value.passwords, parsePassword),
    approvals: list(value.approvals, parseApproval),
    updates: list(value.updates, parseUpdate),
    handoffs: list(value.handoffs, parseHandoff),
    teams: list(value.teams, parseTeam),
    settings: parseSettings(value.settings),
  };
}

export function parseFileEntries(value: unknown): DotFileEntry[] {
  return list(value, (entry) => {
    const path = str(entry, 'path');
    return path.length === 0
      ? null
      : { path, size: num(entry, 'size'), isDir: bool(entry, 'isDir'), modifiedAt: num(entry, 'modifiedAt') };
  });
}

export function parseBrowserScreenshot(value: unknown): BrowserScreenshot {
  const json = isObject(value) ? value : {};
  const width = num(json, 'width');
  const height = num(json, 'height');
  return {
    image: strOrNull(json, 'image'),
    mime: str(json, 'mime', 'image/jpeg'),
    url: str(json, 'url'),
    title: str(json, 'title'),
    width: width > 0 ? width : 1280,
    height: height > 0 ? height : 800,
    live: bool(json, 'live'),
    takenOver: bool(json, 'takenOver'),
  };
}
