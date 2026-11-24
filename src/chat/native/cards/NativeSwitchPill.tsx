/**
 * The "Switch to Native" pill chip in the chat box's pill strip (`Q4768`, `Q4770`, `Q4771`).
 *
 * Mirrors desktop `apps/desktop/src/app/native_chat/native_switch_chip.rs`: shown beside the Where
 * pill on Terminal chats of Antigravity, Claude Code, and Codex for chat-first users until dismissed
 * per agent or Native is enabled for that agent. Clicking mid-reply shifts it to a cancelable
 * "Switching when done…" pill.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { NativeSwitchOffer } from '../../rust/document';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

export function NativeSwitchPill({
  offer,
  onPress,
  onDismiss,
}: {
  offer: NativeSwitchOffer;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [bodyPressed, setBodyPressed] = useState(false);
  const queued = offer.queued === true;
  const label = queued ? 'Switches to Native when this reply ends' : 'Switch to Native';
  const accessibilityLabel = queued
    ? `Switches ${offer.agentName} to Native when this reply ends`
    : `Switch ${offer.agentName} to Native mode`;
  const dismissLabel = queued ? 'Cancel Switch to Native' : `Hide Switch to Native for ${offer.agentName}`;

  return (
    <View style={[styles.pill, bodyPressed ? styles.pillPressed : null]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setBodyPressed(true)}
        onPressOut={() => setBodyPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
        style={styles.body}
      >
        <ComposerGlyph name={queued ? 'clock' : 'bolt'} size={13} color={P.foreground} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        style={({ pressed }) => [styles.dismiss, pressed ? styles.dismissPressed : null]}
      >
        <ComposerGlyph name="x" size={11} color={P.cardMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 25,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
    paddingLeft: 8,
    paddingRight: 3,
    gap: 2,
  },
  pillPressed: {
    backgroundColor: P.ink(0.08),
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 2,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
    color: P.foreground,
  },
  dismiss: {
    width: 19,
    height: 19,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissPressed: {
    backgroundColor: P.ink(0.08),
  },
}));
