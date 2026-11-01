/**
 * The Sessions header's list/tiles switch on the unfolded iPhone Duo (approved session wall mockup): two buttons in
 * one segment, the chosen one filled. In the side bar the same two stand as its switch entries (`SessionsScreen`).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { ListGlyph, TilesGlyph } from '../../components/sessions/icons';
import { WallCopy } from '../../copy';
import type { SessionListView } from '../../settings/store';
import { GhostexPalette, GhostexRadii } from '../../theme/palette';
import type { SidebarAppearance } from '../../theme/sidebarAppearance';

const OPTIONS = [
  { view: 'list', label: WallCopy.showList, Glyph: ListGlyph },
  { view: 'tiles', label: WallCopy.showTiles, Glyph: TilesGlyph },
] as const;

export default function WallSwitch({
  view,
  appearance,
  onChange,
}: {
  view: SessionListView;
  appearance: SidebarAppearance;
  onChange: (view: SessionListView) => void;
}) {
  return (
    <View style={[styles.segment, { backgroundColor: appearance.cardActive }]}>
      {OPTIONS.map(({ view: option, label, Glyph }) => {
        const selected = view === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[styles.button, selected ? styles.selected : null]}
            onPress={() => onChange(option)}
          >
            <Glyph size={20} color={selected ? appearance.foreground : appearance.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: GhostexRadii.section,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: GhostexRadii.card + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: GhostexPalette.NEUTRAL_FILL_PRESSED,
  },
});
