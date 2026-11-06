/**
 * Where the chat view stands: the terminal screen's whole content area (the default), or one of the iPhone Duo's two
 * pane slots, whose size the chat measures itself. In a pane the pane already ends at the
 * keyboard or above the fold, so the composer lifts nothing itself, and what the chat sized by the window (the cards
 * band above the composer, a table's width, a lone picture) is sized by the chat instead. Outside a pane every reader
 * gets the window, as before.
 */

import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

export type ChatPlacement = {
  readonly inPane: boolean;
  /** The chat's own size in a pane once laid out, else null. */
  readonly size: { readonly width: number; readonly height: number } | null;
};

const ChatPlacementContext = createContext<ChatPlacement>({ inPane: false, size: null });

export const ChatPlacementProvider = ChatPlacementContext.Provider;

export function useChatPlacement(): ChatPlacement {
  return useContext(ChatPlacementContext);
}

/** The size the chat's cards, tables and pictures are measured against: the chat in a pane once laid out, else the window. */
export function useChatViewSize(): { width: number; height: number } {
  const window = useWindowDimensions();
  const { inPane, size } = useContext(ChatPlacementContext);
  return inPane && size !== null ? size : window;
}
