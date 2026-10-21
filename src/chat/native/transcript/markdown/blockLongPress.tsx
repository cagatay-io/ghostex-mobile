/**
 * CDXC:Mobile 2026-10-17 WHY: a message's long-press menu (`MessageRow.tsx`) sits on a `Pressable`
 * around the whole message, and that `Pressable` takes the touch before a horizontal `ScrollView`
 * inside it (a wide table, a long code line), so the block would not scroll sideways. A scrolling
 * block therefore carries the long press itself, on a `Pressable` inside its `ScrollView`, where the
 * pan reaches the scroller first. On Android the message's native view owns the hold
 * (`messageSelection.tsx`), so there the inner `Pressable` only keeps the pan with the scroller.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { HOLD_SELECTS_TEXT } from '../messageSelection';

/** The open-the-menu handler of the message being drawn; undefined where a message has no menu. */
export const MessageLongPressContext = createContext<(() => void) | undefined>(undefined);

/** The content of a sideways-scrolling block: a plain `View`, or one that opens the message's menu on a long press. */
export function BlockLongPress({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const openMenu = useContext(MessageLongPressContext);
  if (openMenu === undefined) return <View style={style}>{children}</View>;
  return (
    <Pressable {...(HOLD_SELECTS_TEXT ? {} : { onLongPress: openMenu })} accessible={false} style={style}>
      {children}
    </Pressable>
  );
}
