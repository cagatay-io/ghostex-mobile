/**
 * A dot's Chats: start a new conversation (optionally with a first message), what this dot is
 * waiting on you for, and its conversations as the ordinary session rows of the phone's list
 * (from the session inventory, since every conversation is a session in the dot's project).
 */

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import ActionSheet from '../../../components/common/ActionSheet';
import SessionRow from '../../../components/sessions/SessionRow';
import { compareForSidebarOrder } from '../../../contract/grouping';
import type { GhostexSession } from '../../../contract/mobileSummary';
import { openDotSession, startDotChat, type DotsNavigation } from '../../../dots/openChat';
import { timeAgo } from '../../../dots/status';
import { useDotsAction } from '../../../dots/store';
import type { Dot, DotsSnapshot } from '../../../dots/types';
import { useInventoryStore } from '../../../inventory/store';
import type { MachineRecord } from '../../../machines/store';
import { attachSessionKey, useTerminalStore } from '../../../terminal/sessions';
import { useAppearance } from '../../../theme/useAppearance';
import ApprovalCard from '../ApprovalCard';
import { Card, DotsButton, Empty, ErrorLine, Field, ListCard, Section, useDotsStyles } from '../kit';

export default function ChatsPane({
  machine,
  dot,
  snapshot,
  navigation,
}: {
  machine: MachineRecord | null;
  dot: Dot;
  snapshot: DotsSnapshot;
  navigation: DotsNavigation;
}) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const [message, setMessage] = useState('');
  const [menuSession, setMenuSession] = useState<GhostexSession | null>(null);
  const starter = useDotsAction(machine);
  const summary = useInventoryStore((state) =>
    machine === null ? null : (state.inventoriesByMachineId[machine.id]?.summary ?? null)
  );
  const selectedSessionKey = useTerminalStore((state) => state.selectedSessionKey);
  const sessions = useMemo(() => {
    const own = (summary?.sessions ?? []).filter((session) => session.projectId === dot.projectId);
    const now = Date.now();
    return own.slice().sort((left, right) => compareForSidebarOrder(left, right, now));
  }, [summary, dot.projectId]);
  const pending = snapshot.approvals.filter((approval) => approval.dotId === dot.id && approval.status === 'pending');
  const updates = snapshot.updates
    .filter((update) => update.dotId === dot.id)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 5);

  const start = (): void => {
    const text = message.trim();
    void starter
      .run(async (computer) => {
        await startDotChat(navigation, computer, { dotId: dot.id, name: dot.name, agentId: dot.agentId }, text);
        return true;
      })
      .then((started) => {
        if (started === true) setMessage('');
      });
  };

  const open = (session: GhostexSession, mode?: 'chat' | 'terminal'): void => {
    if (machine === null) return;
    if (mode !== undefined) {
      useTerminalStore.getState().setSessionViewMode(attachSessionKey(machine.id, session.sessionId), mode);
    }
    openDotSession(navigation, machine, {
      sessionId: session.sessionId,
      projectId: session.projectId,
      title: session.displayTitle.length > 0 ? session.displayTitle : dot.name,
      agentId: dot.agentId,
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Field
          multiline
          placeholder={`Ask ${dot.name} to research, browse, plan, or build something…`}
          value={message}
          onChangeText={setMessage}
        />
        <ErrorLine message={starter.error} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <DotsButton
            label={message.trim().length > 0 ? 'Send' : 'New chat'}
            variant='primary'
            busy={starter.pending}
            disabled={machine === null}
            onPress={start}
          />
        </View>
      </Card>

      {pending.length > 0 ? (
        <Section eyebrow={`Needs you · ${pending.length}`}>
          {pending.map((approval) => {
            const sessionId = approval.sessionId;
            return (
              <ApprovalCard
                key={approval.id}
                machine={machine}
                approval={approval}
                dot={dot}
                onOpenChat={
                  machine !== null && sessionId !== null
                    ? () =>
                        openDotSession(navigation, machine, {
                          sessionId,
                          projectId: approval.projectId,
                          title: dot.name,
                          agentId: dot.agentId,
                        })
                    : undefined
                }
              />
            );
          })}
        </Section>
      ) : null}

      <Section eyebrow={`Chats · ${sessions.length}`}>
        {sessions.length === 0 ? (
          <Empty>No chats yet. Start one above, or hand {dot.name} a task from Home.</Empty>
        ) : (
          <View style={{ gap: 2 }}>
            {sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                active={machine !== null && selectedSessionKey === attachSessionKey(machine.id, session.sessionId)}
                expandedGroupSurface={appearance.cardActive}
                sidebarBackground={appearance.background}
                sidebarForeground={appearance.foreground}
                inCard={false}
                customSessionTags={summary?.customSessionTags}
                onPress={() => open(session)}
                onMenu={() => setMenuSession(session)}
              />
            ))}
          </View>
        )}
      </Section>

      {updates.length > 0 ? (
        <Section eyebrow='Latest updates'>
          <ListCard>
            {updates.map((update) => (
              <View key={update.id} style={[styles.listRow, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Text style={[styles.text, { fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
                      {update.title ?? 'Update'}
                    </Text>
                    <Text style={styles.mono}>{timeAgo(update.createdAt).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.muted} numberOfLines={4}>
                    {update.text.replace(/[#*_`>|]/gu, '').slice(0, 400)}
                  </Text>
                </View>
              </View>
            ))}
          </ListCard>
        </Section>
      ) : null}

      {menuSession !== null ? (
        <ActionSheet
          visible
          title={menuSession.displayTitle.length > 0 ? menuSession.displayTitle : dot.name}
          items={[
            {
              key: 'chat',
              label: 'Open in chat',
              onPress: () => {
                const session = menuSession;
                setMenuSession(null);
                open(session, 'chat');
              },
            },
            {
              key: 'terminal',
              label: 'Open in terminal',
              onPress: () => {
                const session = menuSession;
                setMenuSession(null);
                open(session, 'terminal');
              },
            },
          ]}
          onClose={() => setMenuSession(null)}
        />
      ) : null}
    </View>
  );
}
