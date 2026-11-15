/**
 * The terminal screen's buttons as the iPhone Duo's side bar and status band take them (`RailButtons`): Back, Panes,
 * the chat/terminal view toggle and "…". Moved verbatim from src/screens/TerminalScreen.tsx so that file stays under
 * the size limit; its one useMemo runs where it ran.
 */

import { useMemo } from 'react';

import type { RailButtons } from '../../components/common/verticalBar/VerticalBarArea';
import {
  ChatBubbleIcon,
  ChevronLeftIcon,
  EllipsisIcon,
  PanesIcon,
  TerminalPromptIcon,
} from '../../components/terminal/icons';
import { DuoChromeCopy, TerminalHeaderCopy } from '../../copy';
import type { Appearance } from '../../theme/useAppearance';

export type TerminalRailButtonsDeps = {
  appearance: Appearance;
  chatCapable: boolean;
  chatModeActive: boolean;
  toggleChatView: () => void;
  goBack: () => void;
  openMenu: () => void;
  panesAvailable: boolean;
  showsTwoPanes: boolean;
  panesLabel: string;
  panesUpright: boolean;
  pressPanes: () => void;
};

// The same buttons standing in the iPhone Duo's side bar below the status items (rail): Back never
// moves into the menu. The voice button has no rail entry: the rail exists only on iOS, where it does
// not render (VOICE_SUPPORTED). Memoized on the header's inputs, so terminal output and tab updates
// do not republish the side bar. Its capsules and menus take the app appearance; the header row takes `ink`.
export function useTerminalRailButtons({
  appearance,
  chatCapable,
  chatModeActive,
  toggleChatView,
  goBack,
  openMenu,
  panesAvailable,
  showsTwoPanes,
  panesLabel,
  panesUpright,
  pressPanes,
}: TerminalRailButtonsDeps): RailButtons {
  return useMemo<RailButtons>(
    () => ({
      pinned: 1,
      moreMenu: 'always',
      // The terminal and the chat composer both take the keyboard.
      reserveKeyboard: true,
      entries: [
        {
          key: 'back',
          label: DuoChromeCopy.back,
          icon: (size) => <ChevronLeftIcon size={size} color={appearance.foreground} />,
          onPress: goBack,
        },
        ...(panesAvailable
          ? [
              {
                key: 'panes',
                label: panesLabel,
                icon: (size: number) => (
                  <PanesIcon
                    across={!panesUpright}
                    size={size - 2}
                    color={showsTwoPanes ? appearance.accent : appearance.foreground}
                  />
                ),
                onPress: pressPanes,
              },
            ]
          : []),
        ...(chatCapable
          ? [
              {
                key: 'view',
                label: chatModeActive ? TerminalHeaderCopy.terminalView : TerminalHeaderCopy.chatView,
                icon: (size: number) =>
                  chatModeActive ? (
                    <TerminalPromptIcon size={size - 3} color={appearance.foreground} />
                  ) : (
                    <ChatBubbleIcon size={size - 3} color={appearance.foreground} />
                  ),
                onPress: toggleChatView,
              },
            ]
          : []),
        {
          key: 'more',
          label: DuoChromeCopy.more,
          icon: (size) => <EllipsisIcon size={size} color={appearance.foreground} />,
          onPress: openMenu,
        },
      ],
    }),
    [
      appearance,
      chatCapable,
      chatModeActive,
      toggleChatView,
      goBack,
      openMenu,
      panesAvailable,
      showsTwoPanes,
      panesLabel,
      panesUpright,
      pressPanes,
    ],
  );
}
