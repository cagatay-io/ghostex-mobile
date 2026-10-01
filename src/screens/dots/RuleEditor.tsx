/**
 * Open Dot's RuleEditor: "When <dot> wants to <action>, it should Allow automatically / Ask first /
 * Never allow". `dotId` null edits the rules for every dot (DotsSettings); a dot id edits that
 * dot's own rules (its Setup).
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { addRule, deleteRule } from '../../dots/client';
import { useDotsAction } from '../../dots/store';
import type { DotRule, RuleDecision } from '../../dots/types';
import type { MachineRecord } from '../../machines/store';
import { GhostexPalette } from '../../theme/palette';
import {
  Card,
  Chip,
  ChipRow,
  DotsButton,
  ErrorLine,
  Field,
  Labeled,
  ListCard,
  RemoveButton,
  useDotsStyles,
} from './kit';

const DECISIONS: readonly { value: RuleDecision; label: string; tone: string }[] = [
  { value: 'allow', label: 'Allow automatically', tone: GhostexPalette.STATUS_CONNECTED },
  { value: 'ask', label: 'Ask first', tone: GhostexPalette.STATUS_WORKING },
  { value: 'never', label: 'Never allow', tone: GhostexPalette.STATUS_ERROR },
];

export default function RuleEditor({
  machine,
  dotId,
  name,
  rules,
}: {
  machine: MachineRecord | null;
  dotId: string | null;
  /** "Scout", or "a dot" for the rules for every dot. */
  name: string;
  /** Every rule in the snapshot; this editor shows the ones for `dotId`. */
  rules: readonly DotRule[];
}) {
  const styles = useDotsStyles();
  const { run, pending, error } = useDotsAction(machine);
  const [action, setAction] = useState('');
  const [decision, setDecision] = useState<RuleDecision>('ask');
  const own = rules.filter((rule) => rule.dotId === dotId);

  const submit = (): void => {
    const value = action.trim();
    if (value.length === 0) return;
    void run((target) => addRule(target, dotId, value, decision)).then(() => setAction(''));
  };

  return (
    <View style={{ gap: 10 }}>
      {own.length > 0 ? (
        <ListCard>
          {own.map((rule) => {
            const tone = DECISIONS.find((entry) => entry.value === rule.decision) ?? DECISIONS[1];
            return (
              <View key={rule.id} style={styles.listRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.muted}>
                    When {name} wants to <Text style={styles.text}>{rule.action}</Text>
                  </Text>
                  <Text style={[styles.mono, { color: tone.tone }]}>{tone.label.toUpperCase()}</Text>
                </View>
                <RemoveButton label='Delete rule' onPress={() => void run((target) => deleteRule(target, rule.id))} />
              </View>
            );
          })}
        </ListCard>
      ) : null}
      <Card>
        <Labeled label={`When ${name} wants to`}>
          <Field
            placeholder='reply to emails for me'
            value={action}
            onChangeText={setAction}
            onSubmitEditing={submit}
            returnKeyType='done'
          />
        </Labeled>
        <Labeled label='It should'>
          <ChipRow>
            {DECISIONS.map((entry) => (
              <Chip
                key={entry.value}
                label={entry.label}
                selected={decision === entry.value}
                onPress={() => setDecision(entry.value)}
              />
            ))}
          </ChipRow>
        </Labeled>
        <ErrorLine message={error} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <DotsButton
            label='Add rule'
            variant='primary'
            small
            busy={pending}
            disabled={action.trim().length === 0}
            onPress={submit}
          />
        </View>
      </Card>
      <Text style={styles.muted}>
        One short, plain-language rule per action. "Ask first" wins if rules conflict. Built-in safety checks always
        apply.
      </Text>
    </View>
  );
}
