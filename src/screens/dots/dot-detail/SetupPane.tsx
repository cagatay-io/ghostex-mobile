/**
 * A dot's Setup (Open Dot's SetupPane): its identity and look, its own rules, routines (presets or
 * a 5-field cron, run now, pause, delete), the app triggers that wake it, what it remembers, the
 * skills it saved, and deleting it. The dot also edits most of these itself through its tools.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import ConfirmDialog from '../../../components/common/ConfirmDialog';
import {
  addMemory,
  addRoutine,
  deleteDot,
  deleteMemory,
  deleteRoutine,
  deleteSkill,
  deleteTrigger,
  runRoutineNow,
  setTriggerEnabled,
  updateDot,
  updateRoutine,
} from '../../../dots/client';
import { DotFace } from '../../../dots/DotFace';
import { looksEqual } from '../../../dots/look';
import { shortWhen, timeAgo } from '../../../dots/status';
import { useDotsAction } from '../../../dots/store';
import type { Dot, DotLook, DotsSnapshot } from '../../../dots/types';
import type { MachineRecord } from '../../../machines/store';
import { GhostexPalette } from '../../../theme/palette';
import { useAppearance } from '../../../theme/useAppearance';
import LookEditor from '../LookEditor';
import RuleEditor from '../RuleEditor';
import {
  Card,
  Chip,
  ChipRow,
  DotsButton,
  Empty,
  ErrorLine,
  Field,
  Labeled,
  ListCard,
  RemoveButton,
  Section,
  useDotsStyles,
} from '../kit';

const SCHEDULES: readonly { label: string; cron: string }[] = [
  { label: 'Every morning', cron: '0 8 * * *' },
  { label: 'Weekdays 9am', cron: '0 9 * * 1-5' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Mondays', cron: '0 9 * * 1' },
];

type Identity = { name: string; purpose: string; instructions: string; look: DotLook };

function identityOf(dot: Dot): Identity {
  return { name: dot.name, purpose: dot.purpose, instructions: dot.instructions, look: dot.look };
}

function sameIdentity(left: Identity, right: Identity): boolean {
  return (
    left.name === right.name &&
    left.purpose === right.purpose &&
    left.instructions === right.instructions &&
    looksEqual(left.look, right.look)
  );
}

export default function SetupPane({
  machine,
  dot,
  snapshot,
  onDeleted,
}: {
  machine: MachineRecord | null;
  dot: Dot;
  snapshot: DotsSnapshot;
  onDeleted: () => void;
}) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const [identity, setIdentity] = useState<Identity>(() => identityOf(dot));
  /** The dot as it was when the fields were last filled, so a change the dot made itself shows up unless you are editing. */
  const baseline = useRef<Identity>(identityOf(dot));
  const [memory, setMemory] = useState('');
  const [routine, setRoutine] = useState({ name: '', instruction: '', schedule: '0 8 * * *' });
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const identityAction = useDotsAction(machine);
  const routineAction = useDotsAction(machine);
  const memoryAction = useDotsAction(machine);
  const listAction = useDotsAction(machine);
  const deleteAction = useDotsAction(machine);

  useEffect(() => {
    const server = identityOf(dot);
    if (sameIdentity(identity, baseline.current) && !sameIdentity(server, baseline.current)) {
      baseline.current = server;
      setIdentity(server);
    }
  }, [dot.updatedAt, dot.name, dot.purpose, dot.instructions, dot.look]);

  const dirty = !sameIdentity(identity, baseline.current);
  const routines = snapshot.routines.filter((entry) => entry.dotId === dot.id);
  const triggers = snapshot.triggers.filter((entry) => entry.dotId === dot.id);
  const memories = snapshot.memories.filter((entry) => entry.dotId === dot.id);
  const skills = snapshot.skills.filter((entry) => entry.dotId === dot.id);

  const save = (): void => {
    const fields = { ...identity, name: identity.name.trim().length > 0 ? identity.name.trim() : dot.name };
    void identityAction
      .run((target) => updateDot(target, dot.id, fields), { refreshInventory: true })
      .then((saved) => {
        if (saved === undefined) return;
        const next = identityOf(saved);
        baseline.current = next;
        setIdentity(next);
      });
  };

  const submitRoutine = (): void => {
    if (routine.instruction.trim().length === 0) return;
    void routineAction
      .run((target) =>
        addRoutine(target, {
          dotId: dot.id,
          name: routine.name.trim().length > 0 ? routine.name.trim() : routine.instruction.trim().slice(0, 40),
          instruction: routine.instruction.trim(),
          schedule: routine.schedule.trim(),
        })
      )
      .then((added) => {
        if (added !== undefined) setRoutine({ name: '', instruction: '', schedule: '0 8 * * *' });
      });
  };

  const submitMemory = (): void => {
    const text = memory.trim();
    if (text.length === 0) return;
    void memoryAction.run((target) => addMemory(target, dot.id, text)).then(() => setMemory(''));
  };

  return (
    <View style={{ gap: 18 }}>
      <Section
        eyebrow='Identity'
        title='Personality and appearance'
        description='Its name, job, and how you want it to work. Your dot also updates its setup itself as you work together.'
      >
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <DotFace look={identity.look} status={dot.status} size={120} />
          </View>
          <Labeled label='Name'>
            <Field value={identity.name} onChangeText={(name) => setIdentity({ ...identity, name })} />
          </Labeled>
          <Labeled label='Job'>
            <Field
              value={identity.purpose}
              placeholder='What this dot is for'
              onChangeText={(purpose) => setIdentity({ ...identity, purpose })}
            />
          </Labeled>
          <Labeled label='Instructions'>
            <Field
              multiline
              value={identity.instructions}
              placeholder='Tone, preferences, things to always or never do…'
              onChangeText={(instructions) => setIdentity({ ...identity, instructions })}
            />
          </Labeled>
          <LookEditor look={identity.look} onChange={(look) => setIdentity({ ...identity, look })} />
          <ErrorLine message={identityAction.error} />
          <DotsButton
            label={dirty ? 'Save changes' : 'Saved'}
            variant='primary'
            busy={identityAction.pending}
            disabled={!dirty}
            onPress={save}
          />
        </Card>
      </Section>

      <Section
        eyebrow='Approvals'
        title='Rules'
        description={`${dot.name} knows when to act and when to ask for approval. Add your own rules for more control.`}
      >
        <RuleEditor machine={machine} dotId={dot.id} name={dot.name} rules={snapshot.rules} />
      </Section>

      <Section
        eyebrow='Automation'
        title='Routines'
        description={`Recurring tasks ${dot.name} runs on a schedule. Each routine keeps its own chat. You can also just ask it in chat.`}
      >
        {routines.length > 0 ? (
          <ListCard>
            {routines.map((entry) => (
              <View key={entry.id} style={[styles.listRow, { alignItems: 'flex-start' }]}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    marginTop: 6,
                    backgroundColor: entry.enabled ? GhostexPalette.STATUS_CONNECTED : appearance.muted,
                  }}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.text}>{entry.name}</Text>
                    <Text style={styles.mono}>{entry.schedule}</Text>
                  </View>
                  <Text style={styles.muted} numberOfLines={2}>
                    {entry.instruction}
                  </Text>
                  <Text style={styles.mono}>
                    {(entry.enabled && entry.nextRunAt !== null
                      ? `Next ${shortWhen(entry.nextRunAt)}`
                      : 'Paused'
                    ).toUpperCase()}
                    {entry.lastRunAt !== null ? ` · LAST ${shortWhen(entry.lastRunAt).toUpperCase()}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <DotsButton
                      label='Run'
                      small
                      disabled={listAction.pending}
                      onPress={() =>
                        void listAction.run((target) => runRoutineNow(target, entry.id), { refreshInventory: true })
                      }
                    />
                    <DotsButton
                      label={entry.enabled ? 'Pause' : 'Resume'}
                      variant='quiet'
                      small
                      disabled={listAction.pending}
                      onPress={() =>
                        void listAction.run((target) => updateRoutine(target, entry.id, { enabled: !entry.enabled }))
                      }
                    />
                  </View>
                </View>
                <RemoveButton
                  label='Delete routine'
                  onPress={() => void listAction.run((target) => deleteRoutine(target, entry.id))}
                />
              </View>
            ))}
          </ListCard>
        ) : (
          <Empty>No routines yet. Try "Every weekday at 8am, brief me on AI news" in chat.</Empty>
        )}
        <Card>
          <Field placeholder='Name' value={routine.name} onChangeText={(name) => setRoutine({ ...routine, name })} />
          <Field
            placeholder='What to do each time'
            value={routine.instruction}
            onChangeText={(instruction) => setRoutine({ ...routine, instruction })}
          />
          <ChipRow>
            {SCHEDULES.map((preset) => (
              <Chip
                key={preset.cron}
                label={preset.label}
                selected={routine.schedule === preset.cron}
                onPress={() => setRoutine({ ...routine, schedule: preset.cron })}
              />
            ))}
          </ChipRow>
          <Labeled label="Schedule (cron, this computer's time)">
            <Field
              value={routine.schedule}
              autoCapitalize='none'
              autoCorrect={false}
              style={{ fontFamily: styles.mono.fontFamily }}
              accessibilityLabel='Cron schedule'
              onChangeText={(schedule) => setRoutine({ ...routine, schedule })}
            />
          </Labeled>
          <ErrorLine message={routineAction.error} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <DotsButton
              label='Add routine'
              variant='primary'
              small
              busy={routineAction.pending}
              disabled={routine.instruction.trim().length === 0}
              onPress={submitRoutine}
            />
          </View>
        </Card>
      </Section>

      <Section
        eyebrow='Automation'
        title='Triggers'
        description={`Wake ${dot.name} when something happens in your apps, like a new email. Add triggers from OpenDots in Ghostex on your computer.`}
      >
        {triggers.length > 0 ? (
          <ListCard>
            {triggers.map((trigger) => (
              <View key={trigger.id} style={[styles.listRow, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.text}>{trigger.name}</Text>
                  {trigger.instruction.length > 0 ? (
                    <Text style={styles.muted} numberOfLines={2}>
                      {trigger.instruction}
                    </Text>
                  ) : null}
                  <Text style={styles.mono}>
                    {trigger.toolkit.toUpperCase()}
                    {trigger.lastFiredAt !== null ? ` · FIRED ${timeAgo(trigger.lastFiredAt).toUpperCase()}` : ''}
                  </Text>
                  {trigger.lastError !== null ? <ErrorLine message={trigger.lastError} /> : null}
                </View>
                <Switch
                  value={trigger.enabled}
                  onValueChange={(enabled) =>
                    void listAction.run((target) => setTriggerEnabled(target, trigger.id, enabled))
                  }
                  trackColor={{ false: appearance.control, true: GhostexPalette.ACCENT }}
                  thumbColor={trigger.enabled ? appearance.foreground : appearance.controlThumb}
                  ios_backgroundColor={appearance.control}
                />
                <RemoveButton
                  label='Delete trigger'
                  onPress={() => void listAction.run((target) => deleteTrigger(target, trigger.id))}
                />
              </View>
            ))}
          </ListCard>
        ) : (
          <Empty>No triggers yet.</Empty>
        )}
      </Section>
      <ErrorLine message={listAction.error} />

      <Section
        eyebrow='Memory'
        title='What it knows about you'
        description={`${dot.name} adds to this as you work together. Remove anything that's wrong.`}
      >
        {memories.length > 0 ? (
          <ListCard>
            {memories.map((entry) => (
              <View key={entry.id} style={styles.listRow}>
                <Text style={[styles.text, { flex: 1, fontSize: 13 }]}>{entry.text}</Text>
                <RemoveButton
                  label='Forget'
                  onPress={() => void memoryAction.run((target) => deleteMemory(target, entry.id))}
                />
              </View>
            ))}
          </ListCard>
        ) : (
          <Empty>Nothing yet.</Empty>
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Field
            style={{ flex: 1 }}
            placeholder='Add something it should remember'
            value={memory}
            onChangeText={setMemory}
            returnKeyType='done'
            onSubmitEditing={submitMemory}
          />
          <DotsButton
            label='Add'
            small
            busy={memoryAction.pending}
            disabled={memory.trim().length === 0}
            onPress={submitMemory}
          />
        </View>
        <ErrorLine message={memoryAction.error} />
      </Section>

      <Section
        eyebrow='Skills'
        title='Repeatable know-how'
        description='Instructions it follows for tasks it repeats. Ask your dot to save one after it figures something out.'
      >
        {skills.length > 0 ? (
          <ListCard>
            {skills.map((skill) => (
              <View key={skill.id} style={{ paddingVertical: 4 }}>
                <View style={styles.listRow}>
                  <Pressable
                    style={{ flex: 1, gap: 2 }}
                    accessibilityRole='button'
                    accessibilityState={{ expanded: openSkill === skill.id }}
                    onPress={() => setOpenSkill(openSkill === skill.id ? null : skill.id)}
                  >
                    <Text style={styles.text}>{skill.name}</Text>
                    <Text style={styles.muted} numberOfLines={openSkill === skill.id ? undefined : 1}>
                      {skill.description}
                    </Text>
                  </Pressable>
                  <RemoveButton
                    label='Delete skill'
                    onPress={() => void listAction.run((target) => deleteSkill(target, skill.id))}
                  />
                </View>
                {openSkill === skill.id ? (
                  <Text
                    selectable
                    style={[
                      styles.mono,
                      {
                        color: appearance.foreground,
                        backgroundColor: appearance.input,
                        marginHorizontal: 12,
                        marginBottom: 8,
                        padding: 10,
                        borderRadius: 8,
                        fontSize: 12,
                      },
                    ]}
                  >
                    {skill.body}
                  </Text>
                ) : null}
              </View>
            ))}
          </ListCard>
        ) : (
          <Empty>No skills yet.</Empty>
        )}
      </Section>

      <Section
        eyebrow='Danger zone'
        title={`Delete ${dot.name}`}
        description='Removes its rules, memory, routines, triggers and browser, and closes its project. Its folder stays on your computer.'
      >
        <View style={{ flexDirection: 'row' }}>
          <DotsButton
            label={`Delete ${dot.name}…`}
            variant='danger'
            small
            busy={deleteAction.pending}
            onPress={() => setConfirmDelete(true)}
          />
        </View>
        <ErrorLine message={deleteAction.error} />
      </Section>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${dot.name}?`}
        body="This can't be undone."
        confirmLabel={`Delete ${dot.name}`}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteAction
            .run(
              async (target) => {
                await deleteDot(target, dot.id);
                return true;
              },
              { refreshInventory: true }
            )
            .then((deleted) => {
              if (deleted === true) onDeleted();
            });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}
