/**
 * The Attach sheet's Paste row on iOS 16 and later: Apple's Paste control (`UIPasteControl`, from
 * expo-clipboard), the one way an app reads a copied screenshot there without the "Allow Paste"
 * prompt, which iOS answers with nothing when the user has turned pasting off for the app. The
 * text field's own long-press Paste offers only text, so without this a copied image cannot reach
 * the chat.
 */

import * as Clipboard from 'expo-clipboard';
import { Text, View } from 'react-native';

import { colorOver } from '../../../theme/palette';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** Whether the sheet can show Apple's Paste control (iOS 16 and later). */
export const pasteControlAvailable = Clipboard.isPasteButtonAvailable;

export function PasteImageRow({ onImage }: { onImage: (dataUri: string) => void }) {
  const styles = useStyles();
  const theme = useTranscriptTheme();
  return (
    <View style={styles.row}>
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={['image']}
        imageOptions={{ format: 'png' }}
        displayMode="iconAndLabel"
        cornerStyle="capsule"
        // The chat's secondary button on its sheet, as the chat's theme and appearance give it: the neutral fill as it
        // shows over the sheet, as one opaque colour, and the sheet's ink; never black.
        backgroundColor={colorOver(theme.neutralFill, theme.menu)}
        foregroundColor={theme.menuForeground}
        style={styles.button}
        onPress={(data) => {
          if (data.type === 'image') onImage(data.data);
        }}
      />
      <Text style={styles.label} numberOfLines={2}>
        The image you copied
      </Text>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  button: { width: 104, height: 34 },
  label: { flex: 1, color: P.muted, fontSize: 15 },
}));
