/**
 * Holding a message on the phone (CDXC:SessionChat 2026-10-21 DECISION in `MessageActions.tsx`).
 * On Android the words take the platform's own selection, whose bar offers Copy, Add to Chat (the
 * selected words, quoted by the core as the menu's row does) and More (the message's menu); a hold
 * anywhere else in the message opens that menu straight away. The native view decides which hold
 * is which (`GhostexSelectionMenuView.kt`), so no JS long press races the selection.
 *
 * CDXC:SessionChat 2026-10-21 WHY: iOS keeps the hold that opens the menu over unselectable prose.
 * React Native's iOS Text can only copy a whole block from the system menu, never part of it, so
 * selecting there needs a text-view renderer of its own.
 */
import type { ReactNode } from 'react';
import { Platform, type AccessibilityActionEvent, type StyleProp, type ViewStyle } from 'react-native';

import GhostexSelectionMenuView from '../../../../modules/ghostex-native/src/GhostexSelectionMenuView';
import { addSelectionToChat } from './transcriptMenuStore';

/** Whether holding a message's words selects them (Android) instead of opening its menu (iOS). */
export const HOLD_SELECTS_TEXT = Platform.OS === 'android';

/**
 * The `nativeID` of an element inside a message whose own long press owns the hold (a picture with
 * a file behind it opens its file rows), so the message's menu does not open over it.
 */
export const OWNS_HOLD = 'ghostexOwnsHold';

/** What a screen reader says a message's hold does. */
export const MESSAGE_MENU_HINT = HOLD_SELECTS_TEXT
  ? 'Hold the words to select them, or hold beside them for Copy, Add to Chat and the message actions'
  : 'Long press for Copy, Add to Chat and the message actions';

const MENU_ACTIONS = [{ name: 'longpress', label: 'Message options' }];

/** A screen reader's way to the message's menu, which it cannot reach by selecting words. */
export function messageMenuAccessibility(openMenu: () => void) {
  return {
    accessibilityActions: MENU_ACTIONS,
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'longpress') openMenu();
    },
  };
}

/** A JS press around message words takes no hold: the hold belongs to the selection (a release after it is no tap). */
export function ignoreHold(): void {}

/**
 * A message's words and what surrounds them (Android only, see `HOLD_SELECTS_TEXT`).
 * `accessible` is false where an outer press already speaks for the message.
 */
export function MessageSelection({
  openMenu,
  style,
  accessible = true,
  children,
}: {
  openMenu: () => void;
  style?: StyleProp<ViewStyle>;
  accessible?: boolean;
  children: ReactNode;
}) {
  return (
    <GhostexSelectionMenuView
      style={style}
      onHold={openMenu}
      onSelectionAction={({ nativeEvent }) => {
        if (nativeEvent.action === 'more') openMenu();
        else addSelectionToChat(nativeEvent.text);
      }}
      {...(accessible
        ? { accessible: true, accessibilityHint: MESSAGE_MENU_HINT, ...messageMenuAccessibility(openMenu) }
        : {})}
    >
      {children}
    </GhostexSelectionMenuView>
  );
}
