/** What a Befehlspad key shows: its glyph (arrows, Enter, New line, Tab, Upload) or its short face text. */

import { StyleSheet, Text } from 'react-native';

import { ArrowIcon, HourglassIcon, PaperclipIcon, ReturnIcon, TabKeyIcon } from './icons';
import type { CommandPadKey } from './commandPadKeys';

export type CommandPadKeyFaceProps = {
  padKey: CommandPadKey;
  color: string;
  /** Glyph size in points. */
  size: number;
  /** Upload in progress: the hourglass, as the upload button showed. */
  busy?: boolean;
};

export default function CommandPadKeyFace({ padKey, color, size, busy = false }: CommandPadKeyFaceProps) {
  switch (padKey.glyph) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return <ArrowIcon direction={padKey.glyph} size={size} color={color} />;
    case 'enter':
    case 'newLine':
      return <ReturnIcon size={size} color={color} />;
    case 'tab':
      return <TabKeyIcon size={size} color={color} />;
    case 'upload':
      return busy ? <HourglassIcon size={size} color={color} /> : <PaperclipIcon size={size} color={color} />;
    case undefined:
      // "Not available" (a deleted custom action or hotkey) takes two small lines.
      return padKey.action.kind === 'unavailable' ? (
        <Text style={[styles.unavailable, { color }]} numberOfLines={2}>
          {padKey.face}
        </Text>
      ) : (
        <Text style={[styles.face, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {padKey.face}
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  face: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
    paddingHorizontal: 4,
  },
  unavailable: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
