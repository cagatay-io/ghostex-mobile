/**
 * One dot on the phone (Open Dot's DotView): its face, status, Pause / Resume / Stop, the agent
 * and model it runs on, then Chats | Computer | Setup.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { pauseDot, resumeDot, stopDot, updateDot } from '../../dots/client';
import { DotFace, DotStatusDot } from '../../dots/DotFace';
import { dotStatusLabel, dotStatusLine } from '../../dots/status';
import { useDotsAction } from '../../dots/store';
import type { DotDetailTab, RootStackParamList } from '../../navigation/types';
import AgentPicker from './AgentPicker';
import ChatsPane from './dot-detail/ChatsPane';
import ComputerPane from './dot-detail/ComputerPane';
import SetupPane from './dot-detail/SetupPane';
import { Card, DotsButton, DotsMessage, DotsPage, ErrorLine, Segmented, useDotsStyles } from './kit';
import { useDotsScreen } from './useDotsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DotDetail'>;

const TABS: readonly { value: DotDetailTab; label: string }[] = [
  { value: 'chats', label: 'Chats' },
  { value: 'computer', label: 'Computer' },
  { value: 'setup', label: 'Setup' },
];

export default function DotDetailScreen({ navigation, route }: Props) {
  const { machineId, dotId } = route.params;
  const [tab, setTab] = useState<DotDetailTab>(route.params.tab ?? 'chats');
  const [pickerOpen, setPickerOpen] = useState(false);
  const { machine, snapshot, loading, refresh, gate } = useDotsScreen(machineId, { withInventory: true });
  const controls = useDotsAction(machine);
  const styles = useDotsStyles();
  const dot = snapshot?.dots.find((entry) => entry.id === dotId) ?? null;

  useEffect(() => {
    if (route.params.tab !== undefined) setTab(route.params.tab);
  }, [route.params.tab]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: dot?.name ?? 'Dot' });
  }, [navigation, dot?.name]);

  if (gate !== null) return gate;
  if (snapshot === null || dot === null) {
    return (
      <DotsMessage title="This dot isn't here any more." body='It may have been deleted on your computer.'>
        <DotsButton label='Back' onPress={() => navigation.goBack()} />
      </DotsMessage>
    );
  }

  const agents = snapshot.settings.agents;
  const agent = agents.find((entry) => entry.id === dot.agentId) ?? null;
  const modelLabel =
    dot.model === null ? 'Default model' : (agent?.models.find((entry) => entry.id === dot.model)?.label ?? dot.model);

  return (
    <DotsPage refreshing={loading} onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <DotFace look={dot.look} status={dot.status} size={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.sectionTitle, { fontSize: 19 }]} numberOfLines={1}>
              {dot.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DotStatusDot status={dot.status} />
              <Text style={styles.mono}>{dotStatusLabel(dot.status).toUpperCase()}</Text>
            </View>
            <Text style={styles.muted} numberOfLines={2}>
              {dotStatusLine(dot)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {dot.status === 'paused' ? (
            <DotsButton
              label='Resume'
              variant='primary'
              small
              busy={controls.pending}
              onPress={() => void controls.run((target) => resumeDot(target, dot.id))}
            />
          ) : (
            <DotsButton
              label='Pause'
              small
              busy={controls.pending}
              accessibilityLabel={`Pause ${dot.name}. Ongoing work stops and it won't message you until you resume it.`}
              onPress={() => void controls.run((target) => pauseDot(target, dot.id))}
            />
          )}
          {dot.status === 'working' ? (
            <DotsButton
              label='Stop'
              variant='danger'
              small
              disabled={controls.pending}
              onPress={() => void controls.run((target) => stopDot(target, dot.id), { refreshInventory: true })}
            />
          ) : null}
          <DotsButton
            label={pickerOpen ? 'Done' : `${agent?.name ?? dot.agentId} · ${modelLabel}`}
            variant='quiet'
            small
            accessibilityLabel={
              pickerOpen ? 'Done choosing the agent' : `Runs on ${agent?.name ?? dot.agentId}, ${modelLabel}. Change`
            }
            onPress={() => setPickerOpen(!pickerOpen)}
          />
        </View>
        {pickerOpen ? (
          <AgentPicker
            agents={agents}
            agentId={dot.agentId}
            model={dot.model}
            onChange={(agentId, model) =>
              void controls.run((target) => updateDot(target, dot.id, { agentId, model }), { refreshInventory: true })
            }
          />
        ) : null}
        {pickerOpen ? <Text style={styles.muted}>New chats use this agent and model.</Text> : null}
        <ErrorLine message={controls.error} />
      </Card>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'chats' ? (
        <ChatsPane machine={machine} dot={dot} snapshot={snapshot} navigation={navigation} />
      ) : tab === 'computer' ? (
        <ComputerPane key={dot.id} machine={machine} dot={dot} navigation={navigation} />
      ) : (
        <SetupPane key={dot.id} machine={machine} dot={dot} snapshot={snapshot} onDeleted={() => navigation.goBack()} />
      )}
    </DotsPage>
  );
}
