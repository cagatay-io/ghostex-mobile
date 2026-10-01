/**
 * One pending card from a dot (Open Dot's chat CardRow): an approval (Approve / Deny / Always allow),
 * a question (its options or a typed answer) or an app to connect (open the link, then "I've
 * connected" or "Not now"). The same card shows in that session's chat as its question card, so
 * answering in either place retires both.
 */

import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { resolveApproval, type ApprovalChoice } from '../../dots/client';
import { DotFace } from '../../dots/DotFace';
import { DOT_STATUS_COLORS, timeAgo } from '../../dots/status';
import { useDotsAction } from '../../dots/store';
import type { Dot, DotApproval } from '../../dots/types';
import type { MachineRecord } from '../../machines/store';
import { Card, DotsButton, ErrorLine, Field, useDotsStyles } from './kit';

const EYEBROWS: Readonly<Record<DotApproval['kind'], string>> = {
  approval: 'Needs your approval',
  question: 'Question for you',
  connect: 'Connect an app',
};

export default function ApprovalCard({
  machine,
  approval,
  dot,
  onOpenChat,
}: {
  machine: MachineRecord | null;
  approval: DotApproval;
  dot: Dot | null;
  /** Opens the conversation that asked, when there is one. */
  onOpenChat?: () => void;
}) {
  const styles = useDotsStyles();
  const { run, pending, error, setError } = useDotsAction(machine);
  const [answer, setAnswer] = useState('');
  const act = (choice: ApprovalChoice, value?: string): void => {
    void run((target) => resolveApproval(target, approval.id, choice, value), { refreshInventory: true });
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {dot !== null ? <DotFace look={dot.look} status={dot.status} size={24} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.eyebrow, { color: DOT_STATUS_COLORS.waiting }]}>{EYEBROWS[approval.kind]}</Text>
          <Text style={styles.muted} numberOfLines={1}>
            {dot?.name ?? 'A dot'} · {timeAgo(approval.createdAt)}
          </Text>
        </View>
        {onOpenChat !== undefined && approval.sessionId !== null ? (
          <DotsButton label='Open chat' variant='quiet' small onPress={onOpenChat} />
        ) : null}
      </View>
      <Text style={[styles.text, { fontWeight: '600' }]}>{approval.title}</Text>
      {approval.detail !== null ? <Text style={styles.muted}>{approval.detail}</Text> : null}

      {approval.kind === 'approval' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <DotsButton label='Approve' variant='primary' small busy={pending} onPress={() => act('approve')} />
          <DotsButton label='Deny' small disabled={pending} onPress={() => act('deny')} />
          {approval.ruleAction !== null ? (
            <DotsButton
              label='Always allow'
              variant='quiet'
              small
              disabled={pending}
              accessibilityLabel={`Always allow when it wants to ${approval.ruleAction}`}
              onPress={() => act('always')}
            />
          ) : null}
        </View>
      ) : null}

      {approval.kind === 'question' ? (
        <View style={{ gap: 8 }}>
          {approval.options.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {approval.options.map((option) => (
                <DotsButton
                  key={option}
                  label={option}
                  small
                  disabled={pending}
                  onPress={() => act('answer', option)}
                />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Field
              style={{ flex: 1 }}
              placeholder='Type your own answer'
              value={answer}
              onChangeText={setAnswer}
              returnKeyType='send'
              onSubmitEditing={() => {
                if (answer.trim().length > 0) act('answer', answer.trim());
              }}
            />
            <DotsButton
              label='Send'
              variant='primary'
              small
              busy={pending}
              disabled={answer.trim().length === 0}
              onPress={() => act('answer', answer.trim())}
            />
          </View>
        </View>
      ) : null}

      {approval.kind === 'connect' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <DotsButton
            label={approval.toolkit !== null ? `Connect ${approval.toolkit}` : 'Connect'}
            variant='primary'
            small
            disabled={approval.url === null}
            onPress={() => {
              if (approval.url === null) return;
              void Linking.openURL(approval.url).catch(() => setError('Could not open the sign-in page.'));
            }}
          />
          <DotsButton label="I've connected" small busy={pending} onPress={() => act('approve')} />
          <DotsButton label='Not now' variant='quiet' small disabled={pending} onPress={() => act('deny')} />
        </View>
      ) : null}
      <ErrorLine message={error} />
    </Card>
  );
}
