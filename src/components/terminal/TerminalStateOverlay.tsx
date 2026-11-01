/**
 * Connection-state overlays over the terminal area (terminal-screen.md §1):
 * opening → spinner + "Connecting...", failed → triangle + "Connection
 * Failed" + error caption + Retry, closed → "Disconnected" + Reconnect.
 * Returns null while the tab is open. It uses the terminal's background and readable ink. In the iPhone Duo's
 * laptop pose its content stands above the fold (`contentBottom`), so Retry and Reconnect stay clear of it.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TerminalTab } from '../../terminal/sessions';
import { GhostexPalette, GhostexRadii, neutralButtonFills } from '../../theme/palette';
import { useTerminalColours } from '../../theme/useTerminalColours';
import { WarningTriangleIcon } from './icons';

export type TerminalStateOverlayProps = {
  tab: TerminalTab;
  /** Failure caption already summarized for humans. */
  errorCaption: string | null;
  onRetry: () => void;
  onReconnect: () => void;
  /** Points at the area's bottom the content keeps clear of (the laptop pose's lower half); 0 elsewhere. */
  contentBottom?: number;
};

export default function TerminalStateOverlay({
  tab,
  errorCaption,
  onRetry,
  onReconnect,
  contentBottom = 0,
}: TerminalStateOverlayProps) {
  const { chrome } = useTerminalColours();
  if (tab.state === 'open') return null;
  const fills = neutralButtonFills(chrome.light);
  const muted = { color: chrome.muted };
  const ink = { color: chrome.foreground };

  return (
    <View
      style={[styles.overlay, { backgroundColor: chrome.background }, contentBottom > 0 && { paddingBottom: contentBottom }]}
      pointerEvents="auto"
    >
      {(tab.state === 'opening' || tab.state === 'detached') && (
        <View style={styles.stack}>
          <ActivityIndicator size="small" color={chrome.muted} />
          <Text style={[styles.secondaryText, muted]}>Connecting...</Text>
        </View>
      )}
      {tab.state === 'failed' && (
        <View style={styles.stack}>
          <WarningTriangleIcon size={40} color={GhostexPalette.DANGER} />
          <Text style={[styles.headline, ink]}>Connection Failed</Text>
          {errorCaption !== null && errorCaption.length > 0 && (
            <Text style={[styles.caption, muted]}>{errorCaption}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: pressed ? fills.pressed : fills.rest }]}
            onPress={onRetry}
          >
            <Text style={[styles.buttonLabel, ink]}>Retry</Text>
          </Pressable>
        </View>
      )}
      {tab.state === 'closed' && (
        <View style={styles.stack}>
          <Text style={[styles.headline, ink]}>Disconnected</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: pressed ? fills.pressed : fills.rest }]}
            onPress={onReconnect}
          >
            <Text style={[styles.buttonLabel, ink]}>Reconnect</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  secondaryText: {
    fontSize: 15,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
  },
  caption: {
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: GhostexRadii.card,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
