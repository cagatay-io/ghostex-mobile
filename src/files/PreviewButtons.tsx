/**
 * A file preview's buttons (`previewActions` in `rowMenu.ts`) as the source and document previews show them: the
 * entries their header and, on the iPhone Duo, the side bar draw, and the header's row of them.
 */

import { StyleSheet, View } from 'react-native';

import HeaderButton from '../components/common/HeaderButton';
import type { RailEntry } from '../components/common/verticalBar/VerticalBarArea';
import { CopyGlyph, MessagePlusGlyph, ShareGlyph } from '../components/sessions/icons';
import { RefreshIcon } from '../components/terminal/icons';
import { DocsCopy } from '../copy';
import { GhostexPalette } from '../theme/palette';
import type { PreviewAction } from './rowMenu';

/** What each button does; null where the preview does not offer it. */
export type PreviewHandlers = {
  copyPath: () => void;
  addToSessionContext: (() => void) | null;
  share: (() => void) | null;
  reload: () => void;
};

/** The entries for `actions`, in their order. Share… is dimmed while `sharing`. */
export function previewEntries(
  actions: readonly PreviewAction[],
  handlers: PreviewHandlers,
  { copyPathLabel, sharing }: { copyPathLabel: string; sharing: boolean },
): RailEntry[] {
  return actions.flatMap((action): RailEntry[] => {
    switch (action) {
      case 'copyPath':
        return [
          {
            key: 'copy-path',
            label: copyPathLabel,
            icon: (size: number) => <CopyGlyph size={size} color={GhostexPalette.FOREGROUND} />,
            onPress: handlers.copyPath,
          },
        ];
      case 'addToSessionContext':
        return handlers.addToSessionContext === null
          ? []
          : [
              {
                key: 'context',
                label: DocsCopy.addToSessionContext,
                icon: (size: number) => <MessagePlusGlyph size={size} color={GhostexPalette.FOREGROUND} />,
                onPress: handlers.addToSessionContext,
              },
            ];
      case 'share':
        return handlers.share === null
          ? []
          : [
              {
                key: 'share',
                label: DocsCopy.shareButton,
                icon: (size: number) => <ShareGlyph size={size} color={GhostexPalette.FOREGROUND} />,
                onPress: handlers.share,
                // One share at a time for the whole app: dimmed while any share runs, this screen's or another's.
                disabled: sharing,
              },
            ];
      case 'reload':
        return [
          {
            key: 'reload',
            label: DocsCopy.reload,
            icon: (size: number) => <RefreshIcon size={size} color={GhostexPalette.FOREGROUND} />,
            onPress: handlers.reload,
          },
        ];
    }
  });
}

/** The entries as the navigation header's buttons (`headerRight`); the Reload glyph is drawn a point larger. */
export function PreviewHeaderButtons({ entries }: { entries: readonly RailEntry[] }) {
  return (
    <View style={styles.row}>
      {entries.map((entry) => (
        <HeaderButton
          key={entry.key}
          label={entry.label}
          onPress={entry.onPress}
          active={entry.selected}
          disabled={entry.disabled}
          icon={entry.icon(entry.key === 'reload' ? 18 : 17)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
