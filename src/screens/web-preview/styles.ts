/**
 * Shared styles for the Web preview port picker and preview screens, built from
 * the same design tokens as the rest of the app (GhostexPalette surfaces,
 * GhostexRadii, 1dp strokes).
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { Platform, StyleSheet } from 'react-native';

import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';

export const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Square toolbar button edge, also its minimum touch target. */
export const TOOLBAR_BUTTON_SIZE = 40;
/** The toolbar buttons' row in the iPhone Duo's status band, centred on the band's bar region. */
export const BAND_ROW_HEIGHT = 44;
/** The side padding of that row. */
export const BAND_ROW_PADDING = 8;
/** The toolbar's side padding. */
export const TOOLBAR_PADDING = 8;

const createStyles = (appearance: Appearance) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appearance.background,
  },

  // Port picker -------------------------------------------------------------
  pickerContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  intro: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    color: appearance.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
  },
  /** Same leading gap as a standalone section title, with a trailing action. */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  sectionHeaderTitle: {
    color: appearance.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  portEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  portInput: {
    flex: 1,
    backgroundColor: appearance.input,
    borderRadius: GhostexRadii.input,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    color: appearance.foreground,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 15,
    fontFamily: MONOSPACE,
  },
  openButton: {
    height: 48,
    minWidth: 92,
    paddingHorizontal: 18,
    borderRadius: GhostexRadii.card,
    backgroundColor: appearance.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButtonDisabled: {
    opacity: 0.45,
  },
  openButtonLabel: {
    color: appearance.accentForeground,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  pillButton: {
    paddingHorizontal: 14,
    minHeight: 32,
    borderRadius: GhostexRadii.pill,
    backgroundColor: appearance.neutralFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButtonPressed: {
    backgroundColor: appearance.neutralFillPressed,
  },
  pillButtonLabel: {
    color: appearance.foreground,
    fontSize: 12,
    fontWeight: '600',
  },
  listSection: {
    overflow: 'hidden',
    borderRadius: GhostexRadii.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.card,
  },
  portSections: { gap: 12 },
  portSearch: {
    minHeight: 44,
    paddingHorizontal: 12,
    color: appearance.foreground,
    backgroundColor: appearance.input,
    borderRadius: GhostexRadii.input,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    fontSize: 14,
  },
  portSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    minHeight: 56,
  },
  portSectionTitle: { color: appearance.foreground, fontSize: 15, fontWeight: '600' },
  portSectionCount: { color: appearance.muted, fontSize: 13 },
  sectionChevron: { color: appearance.muted, fontSize: 16 },
  portPageTitle: { color: appearance.foreground, fontSize: 15, fontWeight: '600' },
  portAddress: { color: appearance.accent, fontSize: 12, fontFamily: MONOSPACE },
  portFavicon: { width: 22, height: 22, resizeMode: 'contain' },
  storybookIcon: { color: '#ff4785', fontSize: 21, fontWeight: '800' },
  portRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 52,
  },
  portRowDivided: {
    borderTopWidth: GhostexStrokeWidth,
    borderTopColor: appearance.border,
  },
  portRowPressed: {
    backgroundColor: appearance.cardActive,
  },
  portRowIcon: {
    width: 28,
    height: 28,
    borderRadius: GhostexRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appearance.cardActive,
  },
  portRowBody: {
    flex: 1,
    gap: 2,
  },
  portRowTitle: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: MONOSPACE,
  },
  portRowDescription: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  pendingLabel: {
    flex: 1,
    color: appearance.muted,
    fontSize: 12,
  },
  emptyRow: {
    color: appearance.muted,
    fontSize: 12,
    paddingVertical: 10,
  },
  errorBanner: {
    borderRadius: GhostexRadii.card,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.danger,
    backgroundColor: 'rgba(232,92,92,0.08)',
    padding: 12,
    gap: 6,
  },
  errorBannerTitle: {
    color: appearance.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  errorBannerBody: {
    color: appearance.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  errorBannerHint: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  // Preview -----------------------------------------------------------------
  toolbar: {
    backgroundColor: appearance.background,
    borderBottomWidth: GhostexStrokeWidth,
    borderBottomColor: appearance.border,
    paddingHorizontal: TOOLBAR_PADDING,
    paddingBottom: 8,
    gap: 6,
  },
  toolbarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** In the iPhone Duo's status band (VerticalBarArea): the row floats there, out of the toolbar's flow. */
  bandToolbarButtons: {
    position: 'absolute',
    height: BAND_ROW_HEIGHT,
    paddingHorizontal: BAND_ROW_PADDING,
  },
  toolbarNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarButton: {
    width: TOOLBAR_BUTTON_SIZE,
    height: TOOLBAR_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GhostexRadii.card,
  },
  toolbarButtonPressed: {
    backgroundColor: appearance.cardActive,
  },
  toolbarButtonDisabled: {
    opacity: 0.3,
  },
  addressBar: {
    borderRadius: GhostexRadii.input,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.input,
    paddingHorizontal: 10,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  addressText: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    color: appearance.foreground,
    fontSize: 12,
    fontFamily: MONOSPACE,
  },
  /** A browser pane's toolbar: one row under the pane's title bar, the address error below it. */
  paneToolbar: {
    backgroundColor: appearance.background,
    borderBottomWidth: GhostexStrokeWidth,
    borderBottomColor: appearance.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  paneToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** The address field between the pane's buttons: it takes the room they leave. */
  paneAddressBar: {
    flex: 1,
    minWidth: 0,
    minHeight: TOOLBAR_BUTTON_SIZE,
    paddingHorizontal: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: appearance.background,
  },
  stateSurface: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  stateTitle: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  stateBody: {
    color: appearance.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stateActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  /** Everything below the toolbar: the WebView and anything drawn over it. */
  contentArea: {
    flex: 1,
  },
  /**
   * The failure surface when it covers a WebView that is still mounted: the
   * page keeps its history and its scroll position behind an opaque sheet, so
   * Retry can put the same document back rather than rebuild it.
   */
  failureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: appearance.background,
  },
  /** Spinner over the page already on screen while the next forward opens. */
  /** The page's load progress, a thin bar along the top edge of the page. */
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
  progressFill: {
    height: 3,
    backgroundColor: appearance.accent,
  },
});

/** Cached styles of the existing colour model for this shared surface. */
export function useWebPreviewStyles() {
  const appearance = useAppearance();
  return useMemo(() => createStyles(appearance), [appearance]);
}
