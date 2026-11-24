/**
 * Confirmation bottom sheet for switching a Terminal chat to Native mode (`Q4769`, `Q4771`).
 *
 * Explains the brief restart (or mid-reply queueing) and includes a checked-by-default
 * "Use Native for new chats with <agent>" checkbox when Native is not yet that agent's default.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BottomSheet from '../../../components/common/BottomSheet';
import { useAppearance, type Appearance } from '../../../theme/useAppearance';
import type { NativeSwitchOffer } from '../../rust/document';
import { Glyph as ComposerGlyph } from '../composer/icons';

export function SwitchToNativeSheet({
  offer,
  working,
  busy,
  onCancel,
  onConfirm,
}: {
  offer: NativeSwitchOffer | null;
  working: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (offer: NativeSwitchOffer, useAsDefault: boolean) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const [useAsDefault, setUseAsDefault] = useState(true);

  useEffect(() => {
    if (offer !== null) {
      setUseAsDefault(!offer.nativeDefault);
    }
  }, [offer]);

  const agentName = offer?.agentName ?? 'this agent';
  const body = working
    ? `${agentName} is replying now. Ghostex will switch to Native mode automatically as soon as this reply finishes, keeping your chat history.`
    : `Ghostex will reopen ${agentName} in Native mode. Your chat history stays, and you can switch back to Terminal-based anytime.`;

  return (
    <BottomSheet visible={offer !== null} onClose={busy ? () => undefined : onCancel}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Switch to Native?</Text>
          <Text style={styles.body}>{body}</Text>
        </View>

        {offer !== null && !offer.nativeDefault ? (
          <Pressable
            onPress={() => setUseAsDefault((prev) => !prev)}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: useAsDefault }}
            accessibilityLabel={`Use Native for new chats with ${agentName}`}
            style={({ pressed }) => [styles.checkRow, pressed ? styles.checkRowPressed : null]}
          >
            <View style={[styles.checkbox, useAsDefault ? styles.checkboxChecked : null]}>
              {useAsDefault ? <ComposerGlyph name="check" size={12} color={appearance.background} /> : null}
            </View>
            <Text style={styles.checkLabel}>{`Use Native for new chats with ${agentName}`}</Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed ? styles.btnPressed : null]}
          >
            <Text style={styles.btnNeutralLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (offer !== null) onConfirm(offer, useAsDefault);
            }}
            disabled={busy || offer === null}
            accessibilityRole="button"
            accessibilityLabel="Switch to Native"
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              busy ? styles.btnDisabled : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={styles.btnPrimaryLabel}>{busy ? 'Switching…' : 'Switch to Native'}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    wrap: {
      gap: 14,
      paddingTop: 2,
    },
    header: {
      gap: 6,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: appearance.foreground,
    },
    body: {
      fontSize: 13.5,
      lineHeight: 19.5,
      color: appearance.muted,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: appearance.border,
      backgroundColor: appearance.card,
    },
    checkRowPressed: {
      opacity: 0.8,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: appearance.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      borderColor: appearance.foreground,
      backgroundColor: appearance.foreground,
    },
    checkLabel: {
      flex: 1,
      fontSize: 13.5,
      lineHeight: 18,
      color: appearance.foreground,
    },
    footer: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 2,
    },
    btn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    btnNeutral: {
      backgroundColor: appearance.neutralFill,
      borderWidth: 1,
      borderColor: appearance.border,
    },
    btnPrimary: {
      backgroundColor: appearance.foreground,
    },
    btnNeutralLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.foreground,
    },
    btnPrimaryLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.background,
    },
    btnPressed: {
      opacity: 0.8,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  });
