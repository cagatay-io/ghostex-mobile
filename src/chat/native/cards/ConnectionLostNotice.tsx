/**
 * "Reconnecting to <computer>…": a one-line card in its own row above the working card and the
 * cards, while the chat has heard nothing from its computer for `NOTICE_AFTER_MS`
 * (`silentSince` on the chat link, `rust/machine-link.ts`). It goes away as soon as the computer
 * answers again.
 *
 * Phone only: the phone reaches its computer through an SSH tunnel that can stall without closing,
 * so the link checks that the computer still answers. The desktop chat has no such check yet.
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MachineConnectionTarget } from '../../../machines/credentials';
import { useMachinesStore } from '../../../machines/store';
import { chatMachineLink } from '../../rust/machine-link';
import { SINGLE_LINE_CARD, SINGLE_LINE_TITLE, SingleLineTileBox, singleLineShell } from '../transcript/singleLineCard';
import { useTranscriptTheme } from '../transcript/theme';
import { Glyph } from './icons';
import { toneLook } from './ToneCard';

/** A quick reconnect stays quiet; Voice mode waits as long before its "Reconnecting to …" line (`voice/readAloud.ts`). */
const NOTICE_AFTER_MS = 5_000;

export function ConnectionLostNotice({ machine, active }: { machine: MachineConnectionTarget; active: boolean }) {
  const theme = useTranscriptTheme();
  const lost = useConnectionLost(machine, active);
  const computer = useMachinesStore((state) => {
    const record = state.machines.find((entry) => entry.id === machine.id);
    return record !== undefined && record.name.length > 0 ? record.name : machine.username;
  });
  if (!lost) return null;
  const title = `Reconnecting to ${computer}…`;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <View style={[singleLineShell(theme), styles.card]} accessible accessibilityLabel={title}>
        <SingleLineTileBox>
          <Glyph
            name="wifi-off"
            size={SINGLE_LINE_CARD.tile.glyphSize}
            color={toneLook('warning', theme.light).hue ?? theme.muted}
          />
        </SingleLineTileBox>
        <Text style={[SINGLE_LINE_TITLE, styles.title, { color: theme.foreground }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/** Whether `machine`'s chat link has been silent for `NOTICE_AFTER_MS`. Watches it only while `active`. */
function useConnectionLost(machine: MachineConnectionTarget, active: boolean): boolean {
  const latest = useRef(machine);
  latest.current = machine;
  const [since, setSince] = useState<number | null>(null);
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!active) {
      setSince(null);
      return;
    }
    const link = chatMachineLink(latest.current);
    const update = () => setSince(link.silentSince());
    update();
    return link.watchSilence(update);
  }, [active, machine.id]);
  useEffect(() => {
    if (since === null) {
      setDue(false);
      return;
    }
    const wait = since + NOTICE_AFTER_MS - Date.now();
    setDue(wait <= 0);
    if (wait <= 0) return;
    const timer = setTimeout(() => setDue(true), wait);
    return () => clearTimeout(timer);
  }, [since]);
  return due;
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  card: {
    height: SINGLE_LINE_CARD.height,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
});
