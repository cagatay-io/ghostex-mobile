/**
 * Dedicated notice card shown when launching or switching to an agent fails because its CLI is
 * not installed on that computer (`src/agents/missingAgent.ts`).
 *
 * Rendered as a full-screen overlay inside `VerticalBarArea` rather than a React Native `Modal` so
 * it never collides with a closing `ProgressOverlay` or sheet modal on iOS.
 */

import { useEffect, useMemo } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  dismissMissingAgentNotice,
  missingAgentNoticeCopy,
  openAgentClisScreen,
  useMissingAgentNotice,
} from '../../agents/missingAgent';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { AlertTriangleGlyph } from '../onboarding/SetupIcons';
import { useFoldCardPlacement } from './foldAvoidance';
import { barPadding, type HorizontalInsets } from './verticalBar/layout';

const WARNING_ICON_DARK = '#fbbf24';
const WARNING_ICON_LIGHT = '#b45309';

export default function MissingAgentNotice({ bar }: { bar: HorizontalInsets }) {
  const notice = useMissingAgentNotice((state) => state.notice);
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const placement = useFoldCardPlacement({ avoidsKeyboard: false });

  useEffect(() => {
    if (notice === null) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissMissingAgentNotice();
      return true;
    });
    return () => subscription.remove();
  }, [notice]);

  if (notice === null) return null;

  const copy = missingAgentNoticeCopy(notice.agentName, notice.machineId);
  const warningColor = appearance.light ? WARNING_ICON_LIGHT : WARNING_ICON_DARK;

  return (
    <View
      style={styles.layer}
      accessibilityViewIsModal
      accessibilityRole="alert"
      testID="missing-agent-notice"
    >
      <Pressable
        style={[styles.backdrop, barPadding(bar, 24), placement.style]}
        onPress={dismissMissingAgentNotice}
      >
        <Pressable
          style={[styles.card, placement.maxHeight !== null && { maxHeight: placement.maxHeight }]}
          onLayout={placement.onCardLayout}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={styles.iconTile}>
              <AlertTriangleGlyph size={18} color={warningColor} strokeWidth={2} />
            </View>
            <Text style={styles.title}>{copy.title}</Text>
          </View>
          <ScrollView style={styles.content} bounces={false}>
            <Text style={styles.body}>{copy.body}</Text>
          </ScrollView>
          <View style={styles.buttonRow}>
            {copy.openLabel !== null ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                  onPress={dismissMissingAgentNotice}
                  testID="missing-agent-notice-close"
                >
                  <Text style={styles.secondaryLabel}>Close</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
                  onPress={() => openAgentClisScreen(notice.machineId)}
                  testID="missing-agent-notice-open-agents"
                >
                  <Text style={styles.primaryLabel}>{copy.openLabel}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
                onPress={dismissMissingAgentNotice}
                testID="missing-agent-notice-close"
              >
                <Text style={styles.primaryLabel}>Close</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </View>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 1100,
      elevation: 20,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: appearance.card,
      borderRadius: 14,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      padding: 16,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconTile: {
      width: 32,
      height: 32,
      borderRadius: 9,
      backgroundColor: appearance.neutralFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      color: appearance.foreground,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
    },
    content: {
      flexGrow: 0,
      flexShrink: 1,
    },
    body: {
      color: appearance.muted,
      fontSize: 13.5,
      lineHeight: 19.5,
      marginTop: 10,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 16,
    },
    secondaryButton: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: GhostexRadii.card,
      backgroundColor: appearance.neutralFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonPressed: {
      backgroundColor: appearance.neutralFillPressed,
    },
    secondaryLabel: {
      color: appearance.foreground,
      fontSize: 13.5,
      fontWeight: '600',
    },
    primaryButton: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: GhostexRadii.card,
      backgroundColor: appearance.primaryFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonPressed: {
      backgroundColor: appearance.primaryFillPressed,
    },
    primaryLabel: {
      color: appearance.foreground,
      fontSize: 13.5,
      fontWeight: '600',
    },
  });
