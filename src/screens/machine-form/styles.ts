/**
 * Styles shared by the machine form sections (docs/2026-09-03/mobile-setup/
 * mobile-04-tailscale.html, mobile-08-edit-machine.html): `.field` label +
 * input + hint, `.section-label`, and the `.rows-panel` rows under Advanced.
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { StyleSheet } from 'react-native';

import { SETUP_MONOSPACE } from '../../components/onboarding/SetupPrimitives';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';

const createFormStyles = (appearance: Appearance) => StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: appearance.background,
  },
  keyboardArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  stack: {
    gap: 12,
  },
  sectionLabel: {
    color: appearance.muted,
    fontSize: 11.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: appearance.muted,
    fontSize: 13,
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: GhostexRadii.control,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.card,
    color: appearance.foreground,
    fontSize: 15,
  },
  inputMono: {
    fontFamily: SETUP_MONOSPACE,
    fontSize: 14,
  },
  inputMultiline: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: appearance.danger,
  },
  fieldHint: {
    color: appearance.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  fieldError: {
    color: appearance.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: GhostexStrokeWidth,
    borderTopColor: appearance.border,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    color: appearance.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  rowDetail: {
    color: appearance.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  rowDetailMono: {
    fontFamily: SETUP_MONOSPACE,
  },
  rowValue: {
    color: appearance.muted,
    fontSize: 13,
  },
  rowsCard: {
    borderRadius: GhostexRadii.section,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    backgroundColor: appearance.card,
    paddingHorizontal: 14,
  },
  errorCallout: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: GhostexRadii.section,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.danger,
    backgroundColor: 'rgba(255,107,107,0.08)',
  },
  errorCalloutText: {
    flex: 1,
    color: appearance.foreground,
    fontSize: 13,
    lineHeight: 19,
  },
  okCallout: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: GhostexRadii.section,
    borderWidth: GhostexStrokeWidth,
    borderColor: 'rgba(99,209,122,0.4)',
    backgroundColor: 'rgba(99,209,122,0.08)',
  },
  okCalloutText: {
    color: appearance.foreground,
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    color: appearance.accent,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: GhostexStrokeWidth,
    borderTopColor: appearance.border,
    backgroundColor: appearance.background,
  },
  divider: {
    height: GhostexStrokeWidth,
    backgroundColor: appearance.border,
    marginTop: 12,
  },
  danger: {
    color: appearance.danger,
  },
});

/** Cached styles of the existing colour model for this shared surface. */
export function useFormStyles() {
  const appearance = useAppearance();
  return useMemo(() => createFormStyles(appearance), [appearance]);
}
