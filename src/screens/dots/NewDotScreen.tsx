/**
 * Make a dot (Open Dot's NewDot): name and job, a starter to begin from, its look, and the agent
 * and model it runs on. Creating it makes its folder and project on the computer and opens it.
 */

import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createDot } from '../../dots/client';
import { DotFace } from '../../dots/DotFace';
import { DEFAULT_DOT_LOOK, DOT_NAME_IDEAS, DOT_STARTERS } from '../../dots/look';
import { useDotsAction } from '../../dots/store';
import type { DotLook } from '../../dots/types';
import type { RootStackParamList } from '../../navigation/types';
import { useAppearance } from '../../theme/useAppearance';
import AgentPicker from './AgentPicker';
import LookEditor from './LookEditor';
import { Card, DotsButton, DotsPage, ErrorLine, Field, Labeled, ListCard, Section, useDotsStyles } from './kit';
import { useDotsScreen } from './useDotsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'NewDot'>;

export default function NewDotScreen({ navigation, route }: Props) {
  const { machineId } = route.params;
  const { machine, snapshot, gate } = useDotsScreen(machineId);
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const placeholder = useMemo(() => DOT_NAME_IDEAS[Math.floor(Math.random() * DOT_NAME_IDEAS.length)], []);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [look, setLook] = useState<DotLook>(DEFAULT_DOT_LOOK);
  const [agentChoice, setAgentChoice] = useState<{ agentId: string; model: string | null } | null>(null);
  const creator = useDotsAction(machine);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'New dot' });
  }, [navigation]);

  if (gate !== null) return gate;
  const settings = snapshot?.settings;
  const agentId = agentChoice?.agentId ?? settings?.defaultAgentId ?? 'claude';
  const model = agentChoice?.model ?? null;
  const shownName = name.trim().length > 0 ? name.trim() : placeholder;

  const create = (): void => {
    void creator
      .run(
        (target) =>
          createDot(target, {
            name: shownName,
            purpose: purpose.trim(),
            look,
            agentId,
            model,
          }),
        { refreshInventory: true }
      )
      .then((dot) => {
        if (dot !== undefined) navigation.replace('DotDetail', { machineId, dotId: dot.id });
      });
  };

  return (
    <DotsPage>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 6 }}>
        <DotFace look={look} size={150} />
        <Text style={[styles.sectionTitle, { fontSize: 22 }]}>{shownName}</Text>
        <Text style={[styles.description, { textAlign: 'center', maxWidth: 320 }]}>
          {purpose.trim().length > 0 ? purpose.trim() : 'Works on its own, in its own folder on your computer.'}
        </Text>
      </View>

      <Section
        eyebrow='New dot'
        title='Meet a new teammate'
        description='Give it a name and a job. It gets its own folder, browser, memory, and rules.'
      >
        <Card>
          <Labeled label='Name'>
            <Field placeholder={placeholder} value={name} onChangeText={setName} />
          </Labeled>
          <Labeled label='Job'>
            <Field multiline placeholder='What should it help with?' value={purpose} onChangeText={setPurpose} />
          </Labeled>
        </Card>
      </Section>

      <Section eyebrow='Or start from'>
        <ListCard>
          {DOT_STARTERS.map((starter) => (
            <Pressable
              key={starter.name}
              accessibilityRole='button'
              onPress={() => {
                setName(starter.name);
                setPurpose(starter.purpose);
                setLook(starter.look);
              }}
              style={({ pressed }) => [styles.listRow, pressed ? { backgroundColor: appearance.cardActive } : null]}
            >
              <DotFace look={starter.look} size={30} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.text}>{starter.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {starter.purpose}
                </Text>
              </View>
              <Text style={[styles.muted, { fontSize: 20 }]}>›</Text>
            </Pressable>
          ))}
        </ListCard>
      </Section>

      <Section eyebrow='Appearance'>
        <Card>
          <LookEditor look={look} onChange={setLook} />
        </Card>
      </Section>

      {settings !== undefined && settings.agents.length > 0 ? (
        <Section eyebrow='Runs on' description="The agent your dot's chats use. You can change it later.">
          <Card>
            <AgentPicker
              agents={settings.agents}
              agentId={agentId}
              model={model}
              onChange={(nextAgent, nextModel) => setAgentChoice({ agentId: nextAgent, model: nextModel })}
            />
          </Card>
        </Section>
      ) : null}

      <ErrorLine message={creator.error} />
      <DotsButton
        label={creator.pending ? 'Waking up…' : `Create ${shownName}`}
        variant='primary'
        busy={creator.pending}
        onPress={create}
      />
    </DotsPage>
  );
}
