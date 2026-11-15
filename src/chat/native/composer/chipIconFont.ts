/**
 * The icon a picture's chip in the chat box leads with, as desktop's composer pill does
 * (`replacements` in apps/desktop/src/app/native_chat/composer_references.rs draws
 * `chat-references/image.svg` before the label). A text field can hold only text, so the icon is a
 * character of a one-glyph font: Material Design Icons' `image-outline`, cut from the
 * JetBrainsMono Nerd Font the app already bundles (`assets/fonts/GhostexChipIcons.ttf`, U+E000).
 * Until the font is loaded the chip has no icon, so the field never shows a missing-glyph box.
 */

import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';

export const CHIP_ICON_FAMILY = 'GhostexChipIcons';
/** The picture glyph, in the Private Use Area. */
export const CHIP_IMAGE_ICON = '\uE000';

let loaded = Font.isLoaded(CHIP_ICON_FAMILY);
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || loading !== null) return;
  loading = Font.loadAsync({ [CHIP_ICON_FAMILY]: require('../../../../assets/fonts/GhostexChipIcons.ttf') as number })
    .then(() => {
      loaded = true;
      for (const listener of listeners) listener();
    })
    // A font that cannot load leaves the chips without their icon.
    .catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the chip icon font is ready; asking starts loading it. */
export function useChipIconFont(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}
