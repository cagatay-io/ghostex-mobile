/**
 * The Add link and Edit link dialog (the desktop's, apps/desktop/src/app/window/custom_link_modal.rs in the Ghostex
 * main repo): an address, which takes `localhost:8317` as well as a full address, and an optional name. Drawn in the
 * Rename dialog's look (src/components/common/PromptDialog.tsx). Return in the address moves to the name; Return in
 * the name saves.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { createPromptDialogStyles } from '../components/common/PromptDialog';
import { useFoldCardPlacement } from '../components/common/foldAvoidance';
import KeyboardAvoidingContainer from '../components/common/keyboard/KeyboardAvoidingContainer';
import KeyboardAwareScrollView from '../components/common/keyboard/KeyboardAwareScrollView';
import { LinksCopy } from '../copy';
import { useAppearance } from '../theme/useAppearance';
import { isComputerLink, normalizeLinkUrl } from './links';

export type LinkDialogProps = {
  visible: boolean;
  /** Edit link (Save) rather than Add link (Add). */
  editing: boolean;
  initialName: string;
  initialUrl: string;
  /** The computer a loopback address would open on, by its short name; `null` when none is selected. */
  computerName: string | null;
  /** `url` is already a whole page address (`normalizeLinkUrl`). */
  onSubmit: (name: string, url: string) => void;
  onCancel: () => void;
};

export default function LinkDialog({
  visible,
  editing,
  initialName,
  initialUrl,
  computerName,
  onSubmit,
  onCancel,
}: LinkDialogProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createPromptDialogStyles(appearance), [appearance]);
  const placement = useFoldCardPlacement({ avoidsKeyboard: true, belowSafeAreaTop: true });
  const [address, setAddress] = useState(initialUrl);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!visible) return;
    setAddress(initialUrl);
    setName(initialName);
    setError(null);
  }, [visible, initialUrl, initialName]);

  const normalized = normalizeLinkUrl(address);
  const where =
    normalized !== null && isComputerLink(normalized)
      ? computerName !== null
        ? LinksCopy.opensOn(computerName)
        : LinksCopy.needsComputer
      : null;

  const submit = (): void => {
    if (normalized === null) {
      setError(LinksCopy.badAddress);
      return;
    }
    onSubmit(name.trim(), normalized);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingContainer safeAreaTop style={styles.keyboardFill}>
        <Pressable style={[styles.backdrop, placement.style]} onPress={onCancel}>
          <Pressable style={styles.card} onLayout={placement.onCardLayout} onPress={(event) => event.stopPropagation()}>
            <KeyboardAwareScrollView bounces={false} contentContainerStyle={styles.cardContent}>
              <Text style={styles.title}>{editing ? LinksCopy.editTitle : LinksCopy.addTitle}</Text>
              <Text style={styles.body}>{editing ? LinksCopy.editBody : LinksCopy.addBody}</Text>
              <Text style={[styles.body, { color: appearance.foreground, fontWeight: '600', marginTop: 14 }]}>
                {LinksCopy.addressLabel}
              </Text>
              <TextInput
                accessibilityLabel={LinksCopy.addressLabel}
                keyboardAppearance={appearance.light ? 'light' : 'dark'}
                style={[styles.input, { marginTop: 6 }]}
                placeholder={LinksCopy.addressPlaceholder}
                placeholderTextColor={appearance.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="next"
                autoFocus
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  setError(null);
                }}
                onSubmitEditing={() => nameRef.current?.focus()}
                submitBehavior="submit"
              />
              {where !== null ? <Text style={styles.body}>{where}</Text> : null}
              <Text style={[styles.body, { color: appearance.foreground, fontWeight: '600', marginTop: 14 }]}>
                {LinksCopy.nameLabel}
              </Text>
              <TextInput
                ref={nameRef}
                accessibilityLabel={LinksCopy.nameLabel}
                keyboardAppearance={appearance.light ? 'light' : 'dark'}
                style={[styles.input, { marginTop: 6 }]}
                placeholder={LinksCopy.namePlaceholder}
                placeholderTextColor={appearance.muted}
                autoCapitalize="sentences"
                returnKeyType="done"
                value={name}
                onChangeText={setName}
                onSubmitEditing={submit}
              />
              {error !== null ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.buttonRow}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                  onPress={onCancel}
                >
                  <Text style={styles.cancelLabel}>{LinksCopy.cancelButton}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.confirmButton} onPress={submit}>
                  <Text style={styles.confirmLabel}>{editing ? LinksCopy.saveButton : LinksCopy.addButton}</Text>
                </Pressable>
              </View>
            </KeyboardAwareScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingContainer>
    </Modal>
  );
}
