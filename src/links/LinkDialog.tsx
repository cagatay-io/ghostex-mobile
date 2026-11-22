/**
 * The Add link and Edit link dialog (the desktop's, apps/desktop/src/app/window/custom_link_modal.rs in the Ghostex
 * main repo): an address, which takes `localhost:8317` as well as a full address, an optional name, and an optional
 * icon from the shared desktop icon set (`COMMAND_ICONS`). Drawn in the Rename dialog's look
 * (src/components/common/PromptDialog.tsx). Return in the address moves to the name; Return in the name saves.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { COMMAND_ICONS } from '../assets/tablerIcons.generated';
import { createPromptDialogStyles } from '../components/common/PromptDialog';
import { useFoldCardPlacement } from '../components/common/foldAvoidance';
import KeyboardAvoidingContainer from '../components/common/keyboard/KeyboardAvoidingContainer';
import KeyboardAwareScrollView from '../components/common/keyboard/KeyboardAwareScrollView';
import { WorldGlyph } from '../components/sessions/icons';
import { LinksCopy } from '../copy';
import { GhostexRadii, GhostexStrokeWidth } from '../theme/palette';
import { useAppearance } from '../theme/useAppearance';
import { isKnownLinkIcon, LINK_ICON_CHOICES, LinkIcon, linkIconLabel } from './linkIcons';
import { isComputerLink, normalizeLinkUrl } from './links';

export type LinkDialogProps = {
  visible: boolean;
  /** Edit link (Save) rather than Add link (Add). */
  editing: boolean;
  initialName: string;
  initialUrl: string;
  /** Existing chosen icon id, or undefined for the site favicon / globe default. */
  initialIcon?: string;
  /** The computer a loopback address would open on, by its short name; `null` when none is selected. */
  computerName: string | null;
  /** `url` is already a whole page address (`normalizeLinkUrl`). */
  onSubmit: (name: string, url: string, icon?: string) => void;
  onCancel: () => void;
};

export default function LinkDialog({
  visible,
  editing,
  initialName,
  initialUrl,
  initialIcon,
  computerName,
  onSubmit,
  onCancel,
}: LinkDialogProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createPromptDialogStyles(appearance), [appearance]);
  const placement = useFoldCardPlacement({ avoidsKeyboard: true, belowSafeAreaTop: true });
  const [address, setAddress] = useState(initialUrl);
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string | undefined>(initialIcon);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!visible) return;
    setAddress(initialUrl);
    setName(initialName);
    setIcon(initialIcon);
    setPickerOpen(false);
    setIconQuery('');
    setError(null);
  }, [visible, initialUrl, initialName, initialIcon]);

  const normalized = normalizeLinkUrl(address);
  const where =
    normalized !== null && isComputerLink(normalized)
      ? computerName !== null
        ? LinksCopy.opensOn(computerName)
        : LinksCopy.needsComputer
      : null;

  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (q.length === 0) return LINK_ICON_CHOICES;
    return LINK_ICON_CHOICES.filter(
      (entry) => entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
    );
  }, [iconQuery]);

  const submit = (): void => {
    if (normalized === null) {
      setError(LinksCopy.badAddress);
      return;
    }
    onSubmit(name.trim(), normalized, icon);
  };

  const chosenLabel = linkIconLabel(icon) ?? (isKnownLinkIcon(icon) ? icon : LinksCopy.iconDefault);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingContainer safeAreaTop style={styles.keyboardFill}>
        <Pressable style={[styles.backdrop, placement.style]} onPress={onCancel}>
          <Pressable style={styles.card} onLayout={placement.onCardLayout} onPress={(event) => event.stopPropagation()}>
            <KeyboardAwareScrollView bounces={false} contentContainerStyle={styles.cardContent}>
              <Text style={styles.title}>{editing ? LinksCopy.editTitle : LinksCopy.addTitle}</Text>
              <Text style={styles.body}>{editing ? LinksCopy.editBody : LinksCopy.addBody}</Text>
              <Text style={[styles.body, { color: appearance.foreground, fontWeight: '600', marginTop: 10 }]}>
                {LinksCopy.addressLabel}
              </Text>
              <TextInput
                accessibilityLabel={LinksCopy.addressLabel}
                keyboardAppearance={appearance.light ? 'light' : 'dark'}
                style={[styles.input, { marginTop: 4 }]}
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
              {error !== null ? (
                <Text style={styles.error}>{error}</Text>
              ) : where !== null ? (
                <Text style={styles.body}>{where}</Text>
              ) : null}
              <Text style={[styles.body, { color: appearance.foreground, fontWeight: '600', marginTop: 10 }]}>
                {LinksCopy.nameLabel}
              </Text>
              <TextInput
                ref={nameRef}
                accessibilityLabel={LinksCopy.nameLabel}
                keyboardAppearance={appearance.light ? 'light' : 'dark'}
                style={[styles.input, { marginTop: 4 }]}
                placeholder={LinksCopy.namePlaceholder}
                placeholderTextColor={appearance.muted}
                autoCapitalize="sentences"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                value={name}
                onChangeText={setName}
                onSubmitEditing={submit}
              />

              <Text style={[styles.body, { color: appearance.foreground, fontWeight: '600', marginTop: 10 }]}>
                {LinksCopy.iconLabel}
              </Text>
              <View
                style={[
                  local.iconRow,
                  { backgroundColor: appearance.input, borderColor: appearance.border },
                ]}
              >
                <View style={local.iconPreview}>
                  <LinkIcon icon={icon} url={normalized ?? initialUrl} size={16} color={appearance.foreground} />
                  <Text style={[local.iconName, { color: appearance.foreground }]} numberOfLines={1}>
                    {chosenLabel}
                  </Text>
                </View>
                <View style={local.iconActions}>
                  {icon !== undefined ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={LinksCopy.iconReset}
                      onPress={() => {
                        setIcon(undefined);
                        setPickerOpen(false);
                      }}
                      style={({ pressed }) => [
                        local.iconActionBtn,
                        { backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill },
                      ]}
                    >
                      <Text style={[local.iconActionText, { color: appearance.muted }]}>{LinksCopy.iconReset}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: pickerOpen }}
                    onPress={() => setPickerOpen((prev) => !prev)}
                    style={({ pressed }) => [
                      local.iconActionBtn,
                      { backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill },
                    ]}
                  >
                    <Text style={[local.iconActionText, { color: appearance.foreground }]}>
                      {pickerOpen ? LinksCopy.cancelButton : icon !== undefined ? LinksCopy.iconChange : LinksCopy.iconChoose}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {pickerOpen ? (
                <View style={[local.pickerBox, { borderColor: appearance.border, backgroundColor: appearance.card }]}>
                  <TextInput
                    accessibilityLabel={LinksCopy.iconSearchPlaceholder}
                    keyboardAppearance={appearance.light ? 'light' : 'dark'}
                    style={[styles.input, local.searchInput]}
                    placeholder={LinksCopy.iconSearchPlaceholder}
                    placeholderTextColor={appearance.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    value={iconQuery}
                    onChangeText={setIconQuery}
                  />
                  <ScrollView style={local.gridScroll} contentContainerStyle={local.grid} nestedScrollEnabled>
                    {iconQuery.trim().length === 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={LinksCopy.iconDefault}
                        accessibilityState={{ selected: icon === undefined }}
                        onPress={() => {
                          setIcon(undefined);
                          setPickerOpen(false);
                        }}
                        style={[
                          local.gridCell,
                          {
                            borderColor: icon === undefined ? appearance.accent : appearance.border,
                            backgroundColor: icon === undefined ? appearance.cardActive : 'transparent',
                          },
                        ]}
                      >
                        <WorldGlyph size={16} color={appearance.foreground} />
                      </Pressable>
                    ) : null}
                    {filteredIcons.map((entry) => {
                      const Glyph = COMMAND_ICONS[entry.id];
                      if (Glyph === undefined) return null;
                      const selected = icon === entry.id;
                      return (
                        <Pressable
                          key={entry.id}
                          accessibilityRole="button"
                          accessibilityLabel={entry.label}
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setIcon(entry.id);
                            setPickerOpen(false);
                          }}
                          style={[
                            local.gridCell,
                            {
                              borderColor: selected ? appearance.accent : appearance.border,
                              backgroundColor: selected ? appearance.cardActive : 'transparent',
                            },
                          ]}
                        >
                          <Glyph size={16} color={appearance.foreground} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={[styles.buttonRow, { marginTop: 12 }]}>
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

const local = StyleSheet.create({
  iconRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: GhostexRadii.row,
    borderWidth: GhostexStrokeWidth,
  },
  iconPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconName: {
    fontSize: 13,
    flexShrink: 1,
  },
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  iconActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pickerBox: {
    marginTop: 8,
    borderRadius: GhostexRadii.row,
    borderWidth: GhostexStrokeWidth,
    padding: 8,
    gap: 8,
  },
  searchInput: {
    minHeight: 34,
    paddingVertical: 6,
    fontSize: 13,
  },
  gridScroll: {
    maxHeight: 168,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridCell: {
    width: 34,
    height: 34,
    borderRadius: 7,
    borderWidth: GhostexStrokeWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
