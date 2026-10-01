/**
 * Team chats (Open Dot's channels, NewChannel): a conversation with a lead dot that hands parts of
 * the job to the other members and brings you the combined result. Reopen or delete a team chat,
 * or start one with a name, members, the lead and what the team should do.
 */

import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { deleteTeam, startTeamChat } from '../../dots/client';
import { DotFace } from '../../dots/DotFace';
import { openDotSession, openStartedChat } from '../../dots/openChat';
import { timeAgo } from '../../dots/status';
import { useDotsAction } from '../../dots/store';
import type { RootStackParamList } from '../../navigation/types';
import { GhostexPalette } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import {
  Card,
  DotsButton,
  DotsPage,
  Empty,
  ErrorLine,
  Field,
  Labeled,
  ListCard,
  RemoveButton,
  Section,
  useDotsStyles,
} from './kit';
import { useDotsScreen } from './useDotsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DotsTeamChat'>;

export default function DotsTeamChatScreen({ navigation, route }: Props) {
  const { machineId } = route.params;
  const { machine, snapshot, loading, refresh, gate } = useDotsScreen(machineId);
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [lead, setLead] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const starter = useDotsAction(machine);
  const remover = useDotsAction(machine);
  const dots = snapshot?.dots ?? [];
  const dotById = useMemo(() => new Map(dots.map((dot) => [dot.id, dot])), [dots]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Team chats' });
  }, [navigation]);

  if (gate !== null || snapshot === null) return gate;
  const leadId = lead !== null && members.includes(lead) ? lead : (members[0] ?? null);
  const teamName = name.trim().length > 0 ? name.trim() : 'team';
  const ready = leadId !== null && members.length >= 2 && message.trim().length > 0;

  const toggle = (dotId: string): void => {
    setMembers((current) => (current.includes(dotId) ? current.filter((id) => id !== dotId) : [...current, dotId]));
  };

  const start = (): void => {
    if (!ready || leadId === null) return;
    const leadDot = dotById.get(leadId);
    void starter
      .run(async (target) => {
        const started = await startTeamChat(target, {
          name: teamName,
          leadId,
          memberIds: members,
          message: message.trim(),
        });
        openStartedChat(navigation, target, started, {
          name: `Team · ${teamName}`,
          agentId: leadDot?.agentId,
        });
        return true;
      })
      .then((done) => {
        if (done !== true) return;
        setName('');
        setMembers([]);
        setLead(null);
        setMessage('');
      });
  };

  return (
    <DotsPage refreshing={loading} onRefresh={refresh}>
      <Section eyebrow={`Team chats · ${snapshot.teams.length}`}>
        {snapshot.teams.length === 0 ? (
          <Empty>No team chats yet.</Empty>
        ) : (
          <ListCard>
            {snapshot.teams.map((team) => {
              const teamLead = dotById.get(team.leadId);
              return (
                <View key={team.id} style={styles.listRow}>
                  <Pressable
                    accessibilityRole='button'
                    accessibilityLabel={`Open the ${team.name} team chat`}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => {
                      if (machine === null) return;
                      openDotSession(navigation, machine, {
                        sessionId: team.sessionId,
                        projectId: team.projectId,
                        title: `Team · ${team.name}`,
                        agentId: teamLead?.agentId,
                      });
                    }}
                  >
                    <View style={{ flexDirection: 'row' }}>
                      {team.memberIds.slice(0, 4).map((memberId, index) => {
                        const member = dotById.get(memberId);
                        return member === undefined ? null : (
                          <View key={memberId} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                            <DotFace look={member.look} status={member.status} size={26} />
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.text} numberOfLines={1}>
                        #{team.name}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {teamLead !== undefined ? `Led by ${teamLead.name} · ` : ''}
                        {timeAgo(team.createdAt)}
                      </Text>
                    </View>
                  </Pressable>
                  <RemoveButton
                    label={`Delete the ${team.name} team chat`}
                    onPress={() => void remover.run((target) => deleteTeam(target, team.id))}
                  />
                </View>
              );
            })}
          </ListCard>
        )}
        <ErrorLine message={remover.error} />
      </Section>

      <Section
        eyebrow='New team chat'
        title='Put a team on it'
        description='A group chat with several dots. The lead coordinates: it hands parts of the job to the members and brings you the combined result.'
      >
        <Card>
          <Labeled label='Name'>
            <Field
              placeholder='launch-plan'
              autoCapitalize='none'
              autoCorrect={false}
              value={name}
              onChangeText={(value) => setName(value.replace(/\s+/gu, '-').toLowerCase())}
            />
          </Labeled>
          <Labeled label='Members · pick the lead'>
            {dots.length < 2 ? (
              <Text style={styles.muted}>A team needs at least two dots.</Text>
            ) : (
              <ListCard>
                {dots.map((dot) => {
                  const on = members.includes(dot.id);
                  return (
                    <View key={dot.id} style={styles.listRow}>
                      <Pressable
                        accessibilityRole='checkbox'
                        accessibilityState={{ checked: on }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                        onPress={() => toggle(dot.id)}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 1.5,
                            borderColor: on ? appearance.foreground : appearance.border,
                            backgroundColor: on ? appearance.foreground : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {on ? (
                            <Text style={{ color: appearance.background, fontSize: 12, fontWeight: '800' }}>✓</Text>
                          ) : null}
                        </View>
                        <DotFace look={dot.look} status={dot.status} size={28} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.text}>{dot.name}</Text>
                          {dot.purpose.length > 0 ? (
                            <Text style={styles.muted} numberOfLines={1}>
                              {dot.purpose}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {on ? (
                        <DotsButton
                          label={leadId === dot.id ? 'Lead' : 'Make lead'}
                          variant={leadId === dot.id ? 'secondary' : 'quiet'}
                          small
                          style={leadId === dot.id ? { borderColor: GhostexPalette.STATUS_WORKING } : undefined}
                          onPress={() => setLead(dot.id)}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </ListCard>
            )}
          </Labeled>
          <Labeled label='What should the team do?'>
            <Field
              multiline
              placeholder='Plan the launch: research, a post, and a checklist'
              value={message}
              onChangeText={setMessage}
            />
          </Labeled>
          <ErrorLine message={starter.error} />
          <DotsButton
            label={members.length < 2 ? 'Pick at least two dots' : `Start #${teamName}`}
            variant='primary'
            busy={starter.pending}
            disabled={!ready}
            onPress={start}
          />
        </Card>
      </Section>
    </DotsPage>
  );
}
