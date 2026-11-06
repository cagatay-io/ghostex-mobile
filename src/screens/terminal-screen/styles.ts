/**
 * TerminalScreen StyleSheet, moved verbatim from src/screens/TerminalScreen.tsx.
 */

import { StyleSheet } from 'react-native';

import { GhostexPalette, SidebarPalette } from '../../theme/palette';
import { HEADER_HEIGHT, HEADER_PADDING } from './session-lookups';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: HEADER_PADDING,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
  },
  /** In the iPhone Duo's status band the header floats there (VerticalBarArea). */
  bandHeader: {
    position: 'absolute',
  },
  headerButton: {
    width: 44,
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalArea: {
    flex: 1,
  },
  /** The iOS terminal slides up with the keyboard: rows moved above this area are cut off, under the header. */
  terminalAreaSliding: {
    overflow: 'hidden',
  },
  chatStartupError: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatStartupErrorText: {
    color: GhostexPalette.STATUS_ERROR,
    fontSize: 13,
  },
  terminal: {
    flex: 1,
  },
  /** iOS: a Befehlspad layer in the software keyboard's place, from the window's bottom edge up. */
  padLayerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  /**
   * The Befehlspad's room over the terminal area (and over the header when the open pad needs it); like the terminal
   * area, it cuts off what is moved out of it.
   */
  padRoom: {
    position: 'absolute',
    overflow: 'hidden',
  },
  /** Before the terminal area is measured (the first layout pass) the pad has no place yet, so it is not seen. */
  padRoomUnmeasured: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
  /** Laptop pose: the terminal area below the fold, keyboard up or not. */
  laptopCover: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
  },
  queuedPill: {
    position: 'absolute',
    top: 8,
    // Clear of the 32dp left edge-swipe strip, which sits above this and would
    // otherwise swallow taps on the pill's left edge. Non-overlapping siblings,
    // not a z-order fight.
    left: 40,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: SidebarPalette.DELAYED_SEND_CLOCK,
  },
  queuedPillPressed: {
    opacity: 0.75,
  },
  queuedPillLabel: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '600',
  },
});
