/**
 * The card above the composer while a model change the agent refused for good holds messages: how
 * many, why, what releases them, and Pick model, which opens the composer's model sheet the way its
 * model pill does. What it says and when it shows come from the chat core
 * (`packages/gx-chat-core/src/menus/picker/hold_card.rs`); this file only lays it out. Port of
 * desktop `apps/desktop/src/app/native_chat/model_hold_card.rs`: the plain sentence wraps to the
 * phone's width, and the diagnostic stays behind the shared Details toggle.
 */

import { StyleSheet, Text } from 'react-native';

import { DetailsToggle } from './DetailsToggle';
import { obj, str } from './json';
import { ToneButton, ToneCard } from './ToneCard';
import type { CardHostAction } from './types';
import { useTranscriptTheme } from '../transcript/theme';

export function ModelHoldCard({ card, onHostAction }: { card: unknown; onHostAction?: CardHostAction }) {
  const P = useTranscriptTheme();
  const value = obj(card);
  if (value === null) return null;
  return (
    <ToneCard
      tone={str(value, 'tone')}
      title={str(value, 'title')}
      body={[
        <Text key="body" style={[styles.body, { color: P.muted }]}>
          {str(value, 'body')}
        </Text>,
        <DetailsToggle key="details" lines={[value.detail]} />,
      ]}
      footerNote={str(value, 'note')}
      footerEnd={
        onHostAction
          ? [
              <ToneButton
                key="pickModel"
                label={str(value.action, 'label')}
                kind="primary"
                onPress={() => onHostAction('pickModel')}
              />,
            ]
          : []
      }
    />
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 12, lineHeight: 17 },
});
