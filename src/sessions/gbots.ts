/**
 * GBots on the phone: a GBots conversation's session carries its bot (`gbot` on the session row,
 * server/src/presentation/session_projection.rs), and the Bots sheet lists every computer's bots
 * with their conversations from it.
 *
 * CDXC:GBots 2026-11-07 DECISION:
 * Coordinator brief (phase 2): "the phone" gets GBots, reading the same server. The phone has no
 * Bots space of its own, so a Bots button in the bottom bar (only while some computer has GBots)
 * opens a sheet of bots, each with its status dot (green waiting, blue working, grey offline) and
 * its conversations; a conversation opens in the chat like any session (the `gbots` chat agent).
 * SEE-ALSO: src/components/sessions/GbotsSheet.tsx, apps/desktop/src/app/native_sidebar/bots.rs.
 */

export type GbotActivity = 'working' | 'idle' | 'offline';

export type GhostexGbot = {
  botId: string;
  name: string;
  activity: GbotActivity;
};

export function parseGbot(value: unknown): GhostexGbot | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const botId = typeof record.botId === 'string' ? record.botId.trim() : '';
  if (!botId) return undefined;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Bot';
  const activity: GbotActivity =
    record.activity === 'working' ? 'working' : record.activity === 'idle' ? 'idle' : 'offline';
  return { botId, name, activity };
}

/** One bot with its conversations, on one computer. */
export type GbotGroup<Machine, Session> = {
  key: string;
  machine: Machine;
  bot: GhostexGbot;
  sessions: Session[];
};

/** Every computer's bots, in name order, each with its conversations newest first. */
export function groupGbots<
  Machine extends { id: string },
  Session extends { gbot?: GhostexGbot; lastActiveAt?: string },
>(entries: readonly { machine: Machine; sessions: readonly Session[] }[]): GbotGroup<Machine, Session>[] {
  const groups = new Map<string, GbotGroup<Machine, Session>>();
  for (const { machine, sessions } of entries) {
    for (const session of sessions) {
      if (!session.gbot) continue;
      const key = `${machine.id}:${session.gbot.botId}`;
      const group = groups.get(key) ?? { key, machine, bot: session.gbot, sessions: [] };
      group.sessions.push(session);
      groups.set(key, group);
    }
  }
  const list = [...groups.values()];
  for (const group of list) {
    group.sessions.sort((left, right) => (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? ''));
  }
  return list.sort((left, right) => left.bot.name.localeCompare(right.bot.name));
}

/** The dot's color for a bot's status, as the desktop's bot row draws it. */
export function gbotDotColor(activity: GbotActivity): string {
  return activity === 'working' ? '#60a5fa' : activity === 'idle' ? '#4ade80' : '#64748b';
}
