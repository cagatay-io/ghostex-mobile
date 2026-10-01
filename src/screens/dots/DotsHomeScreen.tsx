/**
 * OpenDots home on the phone (Open Dot's Home): hand a task to a picked dot (it starts a chat with
 * the task as its first message and opens it), what needs you (approvals, questions, apps to
 * connect), your dots, team chats, and the latest updates your dots posted.
 */

import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SettingsGlyph } from '../../components/sessions/icons';
import { markUpdatesRead } from '../../dots/client';
import { DotFace, DotStatusDot } from '../../dots/DotFace';
import { DEFAULT_DOT_LOOK } from '../../dots/look';
import { openDotSession, startDotChat } from '../../dots/openChat';
import { dotStatusLine, timeAgo } from '../../dots/status';
import { useDotsAction } from '../../dots/store';
import type { Dot, DotUpdate } from '../../dots/types';
import type { MachineRecord } from '../../machines/store';
import type { RootStackParamList } from '../../navigation/types';
import { GhostexPalette } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import ApprovalCard from './ApprovalCard';
import {
  Card,
  Chip,
  ChipRow,
  DotsButton,
  DotsPage,
  Empty,
  ErrorLine,
  Field,
  ListCard,
  Section,
  useDotsStyles,
} from './kit';
import { isDocFile, remoteFilePath } from './files';
import { useDotsScreen } from './useDotsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DotsHome'>;

const LATEST_LIMIT = 8;

export default function DotsHomeScreen({ navigation, route }: Props) {
  const { machineId } = route.params;
  const { machine, snapshot, loading, refresh, gate } = useDotsScreen(machineId);
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const [picked, setPicked] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const handOff = useDotsAction(machine);
  const marker = useDotsAction(machine);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'OpenDots',
      headerRight: () => (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='OpenDots settings'
          hitSlop={8}
          onPress={() => navigation.navigate('DotsSettings', { machineId })}
        >
          <SettingsGlyph size={22} color={appearance.foreground} />
        </Pressable>
      ),
    });
  }, [navigation, machineId, appearance.foreground]);

  const dots = snapshot?.dots ?? [];
  const dotById = useMemo(() => new Map(dots.map((dot) => [dot.id, dot])), [dots]);
  const pending = (snapshot?.approvals ?? []).filter((approval) => approval.status === 'pending');
  const updates = (snapshot?.updates ?? []).slice().sort((left, right) => right.createdAt - left.createdAt);
  const latest = updates.slice(0, LATEST_LIMIT);
  const unreadByDot = useMemo(() => {
    const counts = new Map<string, number>();
    for (const update of snapshot?.updates ?? []) {
      if (!update.read) counts.set(update.dotId, (counts.get(update.dotId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.updates]);

  if (gate !== null) return gate;
  const target = dots.find((dot) => dot.id === picked) ?? dots[0] ?? null;

  const openDot = (dot: Dot): void => {
    if (machine !== null && (unreadByDot.get(dot.id) ?? 0) > 0)
      void markUpdatesRead(machine, { dotId: dot.id }).catch(() => {});
    navigation.navigate('DotDetail', { machineId, dotId: dot.id });
  };

  const submit = (): void => {
    const message = task.trim();
    if (message.length === 0 || target === null) return;
    void handOff
      .run(async (computer: MachineRecord) => {
        await startDotChat(
          navigation,
          computer,
          { dotId: target.id, name: target.name, agentId: target.agentId },
          message
        );
        return true;
      })
      .then((started) => {
        if (started === true) setTask('');
      });
  };

  const openUpdate = (update: DotUpdate): void => {
    const dot = dotById.get(update.dotId);
    if (machine !== null && !update.read) void markUpdatesRead(machine, { updateIds: [update.id] }).catch(() => {});
    if (machine !== null && update.sessionId !== null && dot !== undefined) {
      openDotSession(navigation, machine, {
        sessionId: update.sessionId,
        projectId: update.projectId,
        title: dot.name,
        agentId: dot.agentId,
      });
      return;
    }
    if (dot !== undefined) navigation.navigate('DotDetail', { machineId, dotId: dot.id });
  };

  if (dots.length === 0) {
    return (
      <DotsPage refreshing={loading} onRefresh={refresh}>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <DotFace look={DEFAULT_DOT_LOOK} size={140} />
          <Text style={styles.eyebrow}>Personal agents</Text>
          <Text style={[styles.sectionTitle, { fontSize: 24 }]}>Meet your dots</Text>
          <Text style={[styles.description, { textAlign: 'center', maxWidth: 320 }]}>
            Dots work on their own. Each one has its own folder and browser, remembers what matters, runs routines on a
            schedule, and knows when to ask for your approval.
          </Text>
          <DotsButton
            label='Create your first dot'
            variant='primary'
            onPress={() => navigation.navigate('NewDot', { machineId })}
          />
        </View>
      </DotsPage>
    );
  }

  const composio = snapshot?.settings.composio;
  const connectedApps = composio?.apps.filter((app) => app.connected) ?? [];

  return (
    <DotsPage refreshing={loading} onRefresh={refresh}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        {target !== null ? <DotFace look={target.look} status={target.status} size={96} /> : null}
        <Text style={styles.eyebrow}>Hand off a task</Text>
        <Text style={[styles.sectionTitle, { fontSize: 22, textAlign: 'center' }]}>
          What should {target?.name ?? 'your dot'} do?
        </Text>
        <Text style={[styles.description, { textAlign: 'center' }]}>
          It works on its own and messages you when it's done.
        </Text>
      </View>
      <Card>
        <Field
          multiline
          placeholder={target !== null ? `Ask ${target.name} to research, browse, plan, or build something…` : ''}
          value={task}
          onChangeText={setTask}
        />
        <ChipRow>
          {dots.map((dot) => (
            <Chip
              key={dot.id}
              label={dot.name}
              selected={dot.id === target?.id}
              leading={<DotFace look={dot.look} status={dot.status} size={18} />}
              onPress={() => setPicked(dot.id)}
            />
          ))}
        </ChipRow>
        <ErrorLine message={handOff.error} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <DotsButton
            label='Send'
            variant='primary'
            busy={handOff.pending}
            disabled={task.trim().length === 0 || target === null}
            onPress={submit}
          />
        </View>
      </Card>

      {pending.length > 0 ? (
        <Section eyebrow={`Needs you · ${pending.length}`}>
          {pending.map((approval) => {
            const dot = dotById.get(approval.dotId) ?? null;
            const sessionId = approval.sessionId;
            return (
              <ApprovalCard
                key={approval.id}
                machine={machine}
                approval={approval}
                dot={dot}
                onOpenChat={
                  machine !== null && sessionId !== null && dot !== null
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

      <Section
        eyebrow={`Your dots · ${dots.length}`}
        right={<DotsButton label='New dot' small onPress={() => navigation.navigate('NewDot', { machineId })} />}
      >
        <ListCard>
          {dots.map((dot) => {
            const unread = unreadByDot.get(dot.id) ?? 0;
            return (
              <Pressable
                key={dot.id}
                accessibilityRole='button'
                accessibilityLabel={`${dot.name}, ${dotStatusLine(dot)}`}
                onPress={() => openDot(dot)}
                style={({ pressed }) => [styles.listRow, pressed ? { backgroundColor: appearance.cardActive } : null]}
              >
                <DotFace look={dot.look} status={dot.status} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.text, { fontWeight: '600' }]}>{dot.name}</Text>
                  <Text style={styles.muted} numberOfLines={2}>
                    {dot.purpose.length > 0 ? dot.purpose : 'General helper'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <DotStatusDot status={dot.status} size={6} />
                    <Text style={styles.mono} numberOfLines={1}>
                      {dotStatusLine({ ...dot, purpose: '' }).toUpperCase()}
                    </Text>
                  </View>
                </View>
                {unread > 0 ? (
                  <View
                    style={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      paddingHorizontal: 6,
                      backgroundColor: GhostexPalette.ACCENT,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: GhostexPalette.ACCENT_FOREGROUND, fontSize: 11, fontWeight: '700' }}>
                      {unread}
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.muted, { fontSize: 20 }]}>›</Text>
              </Pressable>
            );
          })}
        </ListCard>
      </Section>

      <Section eyebrow='Together'>
        <ListCard>
          <Pressable
            accessibilityRole='button'
            onPress={() => navigation.navigate('DotsTeamChat', { machineId })}
            style={({ pressed }) => [styles.listRow, pressed ? { backgroundColor: appearance.cardActive } : null]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.text, { fontWeight: '600' }]}>Team chats</Text>
              <Text style={styles.muted}>
                {(snapshot?.teams.length ?? 0) > 0
                  ? `${snapshot?.teams.length} team chat${snapshot?.teams.length === 1 ? '' : 's'}`
                  : 'A lead dot hands parts of a job to other dots'}
              </Text>
            </View>
            <Text style={[styles.muted, { fontSize: 20 }]}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            onPress={() => navigation.navigate('DotsSettings', { machineId })}
            style={({ pressed }) => [styles.listRow, pressed ? { backgroundColor: appearance.cardActive } : null]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.text, { fontWeight: '600' }]}>
                {composio?.signedIn === true
                  ? `Your dots can use ${connectedApps.length > 0 ? connectedApps.length : 'your'} app${connectedApps.length === 1 ? '' : 's'}`
                  : 'Rules, saved logins and apps'}
              </Text>
              <Text style={styles.muted}>
                {composio?.signedIn === true ? 'Via Composio · rules and saved logins' : 'Settings for every dot'}
              </Text>
            </View>
            <Text style={[styles.muted, { fontSize: 20 }]}>›</Text>
          </Pressable>
        </ListCard>
      </Section>

      <Section
        eyebrow='Latest from your dots'
        right={
          updates.some((update) => !update.read) ? (
            <DotsButton
              label='Mark all read'
              variant='quiet'
              small
              busy={marker.pending}
              onPress={() => void marker.run((computer) => markUpdatesRead(computer))}
            />
          ) : undefined
        }
      >
        {latest.length === 0 ? (
          <Empty>Nothing yet. When a dot finishes something, it posts it here.</Empty>
        ) : (
          <ListCard>
            {latest.map((update) => {
              const dot = dotById.get(update.dotId);
              return (
                <Pressable
                  key={update.id}
                  accessibilityRole='button'
                  onPress={() => openUpdate(update)}
                  style={({ pressed }) => [
                    styles.listRow,
                    { alignItems: 'flex-start' },
                    pressed ? { backgroundColor: appearance.cardActive } : null,
                  ]}
                >
                  <DotFace look={dot?.look ?? DEFAULT_DOT_LOOK} status={dot?.status ?? 'idle'} size={26} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {!update.read ? (
                        <View
                          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GhostexPalette.ACCENT }}
                        />
                      ) : null}
                      <Text style={[styles.text, { fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
                        {update.title ?? dot?.name ?? 'Update'}
                      </Text>
                      <Text style={styles.mono}>{timeAgo(update.createdAt).toUpperCase()}</Text>
                    </View>
                    {update.title !== null && dot !== undefined ? (
                      <Text style={styles.mono}>{dot.name.toUpperCase()}</Text>
                    ) : null}
                    <Text style={styles.muted} numberOfLines={3}>
                      {update.text.replace(/[#*_`>|]/gu, '').slice(0, 280)}
                    </Text>
                    {update.files.map((file) => (
                      <Pressable
                        key={file.path}
                        accessibilityRole='link'
                        disabled={!isDocFile(file.name)}
                        onPress={() =>
                          navigation.navigate('DocViewer', {
                            machineId,
                            path: remoteFilePath(dot?.folder ?? '', file.path),
                          })
                        }
                      >
                        <Text style={[styles.muted, isDocFile(file.name) ? { color: GhostexPalette.ACCENT } : null]}>
                          {file.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </ListCard>
        )}
      </Section>
    </DotsPage>
  );
}
