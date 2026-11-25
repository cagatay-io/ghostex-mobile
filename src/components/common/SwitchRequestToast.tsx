/**
 * Clickable switch-request toast (`Q4705`-`Q4711`) floating above the bottom safe area.
 *
 * Latest request wins in place, auto-dismisses after 8 seconds with a hairline countdown bar,
 * and shows an extra "Open external" button for browser-open requests. JS-only so it ships
 * over the air without changing native runtimes.
 *
 * CDXC:SwitchRequests 2026-11-26 DECISION: User (Q5021-Q5022, #762): a page-open toast also has
 * Always, after Open. It opens the page as Open does and turns on that computer's "Let agents
 * open and switch pages without asking" (Settings > Browser), so its agents' page opens show on
 * the computer's screen from then on without a toast. The phone is an owner device, so gxserver
 * takes this setting from it; agents can't set it.
 */
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { navigationRef, openDeepLink, tapOpens } from '../../app/deepLinks';
import { chatMachineLink } from '../../chat/rust/machine-link';
import { machineDisplayLabel, useMachinesStore } from '../../machines/store';
import {
  dismissSwitchRequest,
  SWITCH_REQUEST_DURATION_MS,
  useSwitchRequestStore,
} from '../../notifications/switchRequestStore';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { useReduceTransparency } from './reduceTransparency';

export default function SwitchRequestToast() {
  const active = useSwitchRequestStore((state) => state.active);
  const machines = useMachinesStore((state) => state.machines);
  const insets = useSafeAreaInsets();
  const appearance = useAppearance();
  const opaque = useReduceTransparency();
  const styles = useMemo(() => createStyles(appearance, opaque), [appearance, opaque]);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active === null) return undefined;
    progress.setValue(1);
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: SWITCH_REQUEST_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [active, progress]);

  if (active === null) return null;

  const { machineId, request } = active;
  const record = machines.find((machine) => machine.id === machineId);
  const computer = record !== undefined ? machineDisplayLabel(record) : undefined;
  const subtitle =
    request.subtitle !== undefined && computer !== undefined && !request.subtitle.includes(computer)
      ? `${request.subtitle} · ${computer}`
      : (request.subtitle ?? computer);

  const accept = () => {
    dismissSwitchRequest(request.id);
    if (request.sessionId !== undefined) {
      tapOpens(machineId, request.sessionId);
      const url = `ghostex://session?machineId=${encodeURIComponent(machineId)}&sessionId=${encodeURIComponent(request.sessionId)}`;
      openDeepLink(url);
      return;
    }
    if (request.externalUrl !== undefined) {
      void Linking.openURL(request.externalUrl);
      return;
    }
    if (request.action === 'openSettings' && navigationRef.isReady()) {
      navigationRef.navigate('Settings');
      return;
    }
    if (navigationRef.isReady()) {
      navigationRef.navigate('Sessions');
    }
  };

  const openExternal = () => {
    const url = request.externalUrl;
    dismissSwitchRequest(request.id);
    if (url !== undefined) {
      void Linking.openURL(url);
    }
  };

  const pageOpen = request.action === 'openBrowser' || request.action === 'openBrowserPane';

  const alwaysAccept = () => {
    if (record !== undefined) {
      const link = chatMachineLink(record);
      void link
        .route()
        .then(() =>
          link.rpc(
            'dispatchRendererCommand',
            {
              action: 'updateSettingsPatch',
              payload: { patch: { agentPagesOpenWithoutAsking: true }, source: 'mobile:toast-always' },
            },
            15_000,
          ),
        )
        .catch(() => undefined);
    }
    accept();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: insets.bottom + 14 }]}>
      <View style={styles.card} accessibilityRole="alert" testID="switch-request-toast">
        {opaque ? null : (
          <BlurView
            tint={appearance.light ? 'light' : 'dark'}
            intensity={65}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.frost]}
          />
        )}
        <View style={styles.row}>
          <View style={styles.textColumn}>
            <Text style={styles.title} numberOfLines={2}>
              {request.title}
            </Text>
            {subtitle !== undefined ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => dismissSwitchRequest(request.id)}
            hitSlop={8}
            style={({ pressed }) => [styles.dismissButton, pressed && styles.buttonPressed]}
            testID="switch-request-dismiss"
          >
            <Text style={styles.dismissGlyph}>×</Text>
          </Pressable>
        </View>
        <View style={styles.buttons}>
          {request.externalUrl !== undefined ? (
            <Pressable
              accessibilityRole="button"
              onPress={openExternal}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              testID="switch-request-open-external"
            >
              <Text style={styles.secondaryLabel}>Open external</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={accept}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            testID="switch-request-accept"
          >
            <Text style={styles.primaryLabel}>{request.primaryLabel}</Text>
          </Pressable>
          {pageOpen && record !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens it, and opens this computer's agent pages without asking from now on"
              onPress={alwaysAccept}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              testID="switch-request-always"
            >
              <Text style={styles.secondaryLabel}>Always</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.progressTrack} pointerEvents="none">
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>
    </View>
  );
}

function createStyles(appearance: Appearance, opaque: boolean) {
  const light = appearance.light;
  return StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 14,
      right: 14,
      alignItems: 'center',
      zIndex: 1001,
      elevation: 14,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingTop: 11,
      paddingBottom: 12,
      gap: 8,
      overflow: 'hidden',
      backgroundColor: opaque
        ? appearance.card
        : light
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(32,33,36,0.78)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    frost: { borderRadius: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    textColumn: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontSize: 13.5,
      lineHeight: 18,
      fontWeight: '600',
      color: appearance.foreground,
    },
    subtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: appearance.muted,
    },
    dismissButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissGlyph: {
      fontSize: 18,
      lineHeight: 20,
      color: appearance.muted,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    secondaryButton: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: appearance.neutralFill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: appearance.border,
    },
    secondaryLabel: {
      fontSize: 12.5,
      fontWeight: '600',
      color: appearance.foreground,
    },
    primaryButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: appearance.primaryFill,
    },
    primaryPressed: {
      backgroundColor: appearance.primaryFillPressed,
    },
    primaryLabel: {
      fontSize: 12.5,
      fontWeight: '600',
      color: appearance.foreground,
    },
    buttonPressed: {
      opacity: 0.72,
    },
    progressTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
    },
    progressFill: {
      height: '100%',
      backgroundColor: light ? '#2563eb' : '#60a5fa',
    },
  });
}
