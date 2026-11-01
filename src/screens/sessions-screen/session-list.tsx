/**
 * The Sessions screen's list: the Unified list when the computer's sidebar setting asks for it, else the classic
 * project list. A switch between them mounts the other list, as it always has (each has its own key). Each list's
 * fold gap (`components/common/foldGap.tsx`) is mounted with the list, so half folded like a laptop a list measures
 * from its own top, never from where the other list or its own earlier mount was scrolled.
 */

import type { ReactElement } from 'react';
import { FlatList, type FlatListProps } from 'react-native';

import { FoldGapProvider, useFoldGapList } from '../../components/common/foldGap';
import { useLaptopFold } from '../../components/common/verticalBar/laptopFold';

/** A list's props; the fold gap owns `onScroll` and `scrollEventThrottle`. */
export type SessionListProps<T> = Omit<FlatListProps<T>, 'onScroll' | 'scrollEventThrottle'>;

export function SessionList<U, C>({
  unified,
  classic,
}: {
  /** The Unified list's props while it is on, else null. */
  unified: SessionListProps<U> | null;
  classic: SessionListProps<C>;
}): ReactElement {
  return unified !== null ? (
    <FoldGapFlatList key="unified" {...unified} />
  ) : (
    <FoldGapFlatList key="classic" {...classic} />
  );
}

function FoldGapFlatList<T>(props: SessionListProps<T>): ReactElement {
  const foldGap = useFoldGapList(useLaptopFold());
  return (
    <FoldGapProvider value={foldGap}>
      <FlatList {...props} onScroll={foldGap.onScroll} scrollEventThrottle={16} />
    </FoldGapProvider>
  );
}
