/**
 * The card a failed API call becomes: the tone card with the failure's glyph, the agent's own words,
 * and the retry gxserver runs for it. Port of desktop `apps/desktop/src/app/native_chat/api_error_card.rs`;
 * which rows get it, the titles, the status and the buttons come from the chat core
 * (`packages/gx-chat-core/src/transcript/api_errors.rs`, the 2026-10-15 decision there).
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import { Glyph, type GlyphName } from './icons';
import { arr, obj, str } from './json';
import { ToneButton, ToneCard } from './ToneCard';
import { useTranscriptTheme } from '../transcript/theme';

const GLYPHS: ReadonlySet<string> = new Set(['wifi-off', 'server', 'clock']);

function glyph(name: string): GlyphName {
  return (GLYPHS.has(name) ? name : 'server') as GlyphName;
}

/** "12s", "2m", "1m 30s". */
function countdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Re-renders once a second while `until` is ahead. */
function useNow(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return now;
}

export function ApiErrorCard({ card, dispatch }: { card: unknown; dispatch: (action: UserAction) => void }) {
  const P = useTranscriptTheme();
  const value = obj(card);
  const status = obj(value?.status);
  const countdownTo = typeof status?.countdownTo === 'number' ? status.countdownTo : null;
  const now = useNow(countdownTo);
  if (value === null) return null;
  let label = str(status, 'label');
  if (countdownTo !== null) {
    const remaining = Math.ceil((countdownTo - now) / 1000);
    label = remaining > 0 ? `${label} ${countdown(remaining)}` : 'Retrying now…';
  }
  const note = str(status, 'note');
  const actions = arr(value.actions)
    .map((action) => obj(action))
    .filter((action) => action !== null);
  return (
    <ToneCard
      tone={str(value, 'tone') || 'warning'}
      icon={glyph(str(value, 'icon'))}
      title={str(value, 'title')}
      accessibilityLabel={str(value, 'title')}
      body={[
        <Text key="detail" style={[styles.detail, { color: P.muted }]}>
          {str(value, 'detail')}
        </Text>,
      ]}
      footerStart={
        label === ''
          ? []
          : [
              <View key="status" style={styles.status}>
                <Text style={[styles.statusLabel, { color: P.foreground }]} numberOfLines={1}>
                  {label}
                </Text>
                {note !== '' ? <Text style={[styles.statusLabel, { color: P.muted }]}>{`· ${note}`}</Text> : null}
              </View>,
            ]
      }
      footerEnd={actions.map((action, index) => (
        <ToneButton
          key={str(action, 'id')}
          label={str(action, 'label')}
          kind={index === 0 ? 'primary' : 'secondary'}
          {...(action.id === 'retryNow' ? { icon: 'refresh' as GlyphName } : {})}
          onPress={() => dispatch(action.command as UserAction)}
        />
      ))}
    />
  );
}

/** A failure something already answered: one quiet line. */
export function ApiErrorNote({ error, time }: { error: unknown; time: unknown }) {
  const P = useTranscriptTheme();
  const value = obj(error);
  const label = str(time, 'label');
  return (
    <View style={styles.note}>
      <Glyph name={glyph(str(value, 'icon'))} size={13} color={P.muted} />
      <Text style={[styles.noteText, { color: P.muted }]} numberOfLines={1}>
        {label === '' ? str(value, 'title') : `${str(value, 'title')} · ${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { fontSize: 12, lineHeight: 17 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statusLabel: { fontSize: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  noteText: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
