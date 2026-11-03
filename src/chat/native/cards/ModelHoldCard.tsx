/**
 * The card above the composer while a model change the agent refused for good holds messages: how
 * many, why, what releases them, and Pick model, which opens the composer's model sheet the way its
 * model pill does. What it says and when it shows come from the chat core
 * (`packages/gx-chat-core/src/menus/picker/hold_card.rs`); this file only lays it out. Port of
 * desktop `apps/desktop/src/app/native_chat/model_hold_card.rs`, with the reason wrapping to the
 * phone's width where desktop keeps it to one line.
 */

import { obj, str } from './json';
import { ToneButton, ToneCard } from './ToneCard';
import type { CardHostAction } from './types';

export function ModelHoldCard({ card, onHostAction }: { card: unknown; onHostAction?: CardHostAction }) {
  const value = obj(card);
  if (value === null) return null;
  return (
    <ToneCard
      tone={str(value, 'tone')}
      title={str(value, 'title')}
      detail={str(value, 'detail')}
      detailWraps
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
