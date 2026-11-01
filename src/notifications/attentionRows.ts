/**
 * The attention list's rows: the computer's notification feed, the same list as
 * the desktop bell, newest first, each row with agent and project, the session's title
 * and the event. Account rows (banked usage resets) are rows like any other.
 * A needsInput row of a session that waits on a question (an open question card the computer announces, or a
 * counted pending question) says "has a question" instead of "waiting": the row is joined to its session
 * in the computer's session list by machine and session id.
 * The feed's message text is never part of a row. Kept free of React Native so it is
 * testable under `bun test`.
 */

import { NotificationsCopy } from '../copy';
import { resolveAgentIconId, type AgentIconId } from '../contract/mobileSummary';
import { waitsOnQuestion, type AttentionKind, type SessionFacts } from './events';
import { isAccountRow, type FeedRow } from './feedContract';

export type ListKind = AttentionKind | 'bell' | 'custom' | 'resetExpiring' | 'resetRedeemed';

export type AttentionRow = {
  /** Unique across computers. */
  key: string;
  machineId: string;
  notificationId: string;
  sessionId: string;
  projectId: string;
  kind: ListKind;
  /** The event in words ("finished", "has a question", ...). */
  label: string;
  /** "agent · project"; for an account row the account. */
  who: string;
  /** The session's title; for an account row the computer's one-line notice. */
  detail: string;
  agentIconId: AgentIconId;
  createdAt: string;
  read: boolean;
  /** An account row: no session to open; a tap only marks it read. */
  account: boolean;
  /** The computer's name, only while more than one computer feeds the list. */
  machineLabel: string | null;
};

export type MachineFeed = { machineId: string; machineLabel: string; rows: readonly FeedRow[] };

export function listKindFor(row: FeedRow, facts: SessionFacts | undefined): ListKind {
  if (row.kind === 'needsInput') return waitsOnQuestion(facts) ? 'question' : 'waiting';
  return row.kind;
}

function rowFor(machine: MachineFeed, row: FeedRow, facts: SessionFacts | undefined, many: boolean): AttentionRow {
  const kind = listKindFor(row, facts);
  const account = isAccountRow(row);
  const agent =
    facts !== undefined && facts.agentLabel.length > 0
      ? facts.agentLabel
      : row.agentName.length > 0
        ? row.agentName
        : NotificationsCopy.unknownAgent;
  const project = facts !== undefined && facts.projectName.length > 0 ? facts.projectName : row.subtitle;
  return {
    key: `${machine.machineId}\n${row.id}`,
    machineId: machine.machineId,
    notificationId: row.id,
    sessionId: row.sessionId,
    projectId: row.projectId,
    kind,
    label: NotificationsCopy.rowKind[kind],
    who: account ? row.subtitle : project.length > 0 ? `${agent} · ${project}` : agent,
    detail: account ? row.title : facts !== undefined && facts.title.length > 0 ? facts.title : row.title,
    agentIconId: facts?.agentIconId ?? resolveAgentIconId(undefined, row.agentName),
    createdAt: row.createdAt,
    read: row.read,
    account,
    machineLabel: many ? machine.machineLabel : null,
  };
}

/** Every computer's rows in one list, newest first. */
export function buildAttentionList(
  feeds: readonly MachineFeed[],
  facts: (machineId: string, sessionId: string) => SessionFacts | undefined,
): AttentionRow[] {
  const many = feeds.length > 1;
  const rows: AttentionRow[] = [];
  for (const machine of feeds) {
    for (const row of machine.rows) {
      rows.push(rowFor(machine, row, isAccountRow(row) ? undefined : facts(machine.machineId, row.sessionId), many));
    }
  }
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
