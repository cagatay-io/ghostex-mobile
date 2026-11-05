/**
 * The Sessions screen's list: the Unified list when the computer's sidebar setting asks for it, else the classic
 * project list. A switch between them mounts the other list, as it always has (each has its own key). Half folded
 * like a laptop either list ends above the fold (`components/common/foldGap.tsx`).
 */

import type { ReactElement } from 'react';
import { FlatList, type FlatListProps } from 'react-native';

import { FoldListFrame } from '../../components/common/foldGap';
import { useLaptopFold } from '../../components/common/verticalBar/laptopFold';

export function SessionList<U, C>({
  unified,
  classic,
}: {
  /** The Unified list's props while it is on, else null. */
  unified: FlatListProps<U> | null;
  classic: FlatListProps<C>;
}): ReactElement {
  return (
    <FoldListFrame fold={useLaptopFold()}>
      {unified !== null ? <FlatList key="unified" {...unified} /> : <FlatList key="classic" {...classic} />}
    </FoldListFrame>
  );
}
