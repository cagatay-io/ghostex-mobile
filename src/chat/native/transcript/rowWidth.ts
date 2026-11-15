/**
 * The width of the transcript's column (its rows, its status line, the working card and its lone
 * scroll-to-bottom pill), as a share of the pane, or null for the 768pt column.
 *
 * CDXC:SessionChat 2026-11-14 DECISION:
 * User: on a tablet the chat transcript uses the full width by default (iPad landscape left blank bands beside the 768pt column while the composer spanned the screen). A tablet is an iPad, or an Android device whose screen's shortest side is at least 600 dp. With Settings > Advanced > Custom Transcript Width on, its percentage applies on every device as before; phones keep the 768pt column. The desktop has no tablet form, so its native_chat keeps the 768px column (transcript.rs); this is the one width rule the phone chat has on its own.
 */

import { Dimensions, Platform, useWindowDimensions } from 'react-native';

import { useSettingsStore } from '../../../settings/store';

/** An Android screen whose shortest side is at least this many dp is a tablet. */
const TABLET_SHORTEST_SIDE_DP = 600;

/** Whether this device is a tablet: an iPad, or an Android screen at least 600 dp on its shortest side. */
export function useIsTablet(): boolean {
  // Re-read on a window change, so an Android foldable that opens up counts its screen again.
  useWindowDimensions();
  if (Platform.OS === 'ios') return Platform.isPad;
  if (Platform.OS !== 'android') return false;
  const screen = Dimensions.get('screen');
  return Math.min(screen.width, screen.height) >= TABLET_SHORTEST_SIDE_DP;
}

/** The main transcript's column width: the custom width, else full width on a tablet, else null (768pt). */
export function useTranscriptColumnPercent(main = true): number | null {
  const customWidth = useSettingsStore((store) => store.settings.sessionChatCustomTranscriptWidthEnabled);
  const widthPercent = useSettingsStore((store) => store.settings.sessionChatTranscriptWidthPercent);
  const tablet = useIsTablet();
  if (!main) return null;
  if (customWidth) return widthPercent;
  return tablet ? 100 : null;
}

/** The style that widens a 768pt column to `percent` of its pane. */
export function columnPercentStyle(percent: number | null): { width: `${number}%`; maxWidth: '100%' } | null {
  return percent === null ? null : { width: `${percent}%`, maxWidth: '100%' };
}
