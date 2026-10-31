/**
 * The lists' fold gap (the laptop pose only: the iPhone Duo half folded like a laptop). No row is drawn on the fold's
 * band, at rest or while scrolling, in one of two ways:
 *
 * - **Across the fold** (a `FlatList`): the list runs on below the band. The list itself fills the frame down to the
 *   band's top; a copy of it fills the frame below the band's bottom and follows its scroll, so content that leaves
 *   the upper part at the band appears at once below it, and the other way round; the band adds no scroll distance
 *   (`foldListAcross` and the offsets in `verticalBar/layout.ts`). A drag on either part scrolls both; whichever is
 *   dragged leads and the other follows it (`scrollToOffset`, not animated, from `onScroll`, with the native
 *   `scrollToOverflowEnabled` on both, so an offset past a part's own range stands), on the JS thread, so
 *   during a fast fling the lower part trails the upper one by a frame or two. The copy is hidden from VoiceOver, so
 *   each row is read once; VoiceOver scrolls the list and the copy follows (exploring the lower part by touch finds
 *   nothing). The copy has no pull to refresh, no indicator and none of the list's ref and list-state callbacks
 *   (`onScroll`, `onEndReached`, `onStartReached`, `onRefresh`, `onViewableItemsChanged`, `onLayout`,
 *   `onContentSizeChange`), and its list header takes no touches, so a search field there exists once. Its rows are
 *   rendered a second time: a row that keeps state of its own would keep it twice, separately, so a list whose rows do
 *   (the Sessions screen's Unified cards hold their swipe) passes `endAboveFold`. While the keyboard is up (it lies in
 *   the lower half) or while the content fits above the fold there is no copy, and the list ends as below.
 * - **Above the fold** (a `ScrollView` page, whose sections may keep state of their own, or `endAboveFold`): the
 *   scroll view ends `FOLD_CLEARANCE` above the fold (`foldUpperHalfInset`, as the web preview and the chat's page
 *   sheet do), and the lower half below it stays empty, or holds the keyboard.
 *
 * A list that starts below the fold's top is left as it is. In every other pose (flat, the book pose), on every other
 * iPhone and in a pane (its screen passes no fold) the frame adds nothing and nothing is measured.
 *
 * Adopting it in a list (done here: Settings pages, the Sessions screen's classic and Unified lists, the work-link
 * picker, the Files browser and the attention list): wrap the list's scroll view in
 * `<FoldListFrame fold={useLaptopFold()}>`. The frame takes the room the scroll view took (it grows and shrinks as a
 * scroll view does), so the scroll view keeps its own style. This file
 * takes the fold as an argument and imports no chrome, so a screen that shows a list in a pane passes null.
 */

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type FlatListProps,
  type Insets,
  type ScrollEvent,
  type ViewInstance,
} from 'react-native';

import { useKeyboardTop } from './keyboard/keyboardFrame';
import {
  foldCopyOffset,
  foldListAcross,
  foldListInsets,
  foldListOffset,
  foldUpperHalfInset,
  type LaptopFold,
} from './verticalBar/layout';

/** What the frame calls on the list and its copy: `FlatList`'s own scroll method. */
type ListInstance = { scrollToOffset: (params: { offset: number; animated?: boolean }) => void };
/** A `FlatList` element as an adopter wraps it; React 19 hands an element's ref over as a prop. */
type ListElement = ReactElement<FlatListProps<unknown> & { ref?: Ref<ListInstance> }>;

export function FoldListFrame({
  fold,
  endAboveFold = false,
  children,
}: {
  fold: LaptopFold | null;
  /** Keep a `FlatList` above the fold instead of running it across: for rows that keep state of their own. */
  endAboveFold?: boolean;
  children: ReactNode;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const keyboardTop = useKeyboardTop();
  const frame = useRef<ViewInstance | null>(null);
  // The frame's top and bottom edge in window points, measured only in the laptop pose.
  const [edges, setEdges] = useState<{ top: number; bottom: number } | null>(null);
  // The list's content height as it last reported it, with the key of the list that reported it.
  const [content, setContent] = useState<{ key: Key | null; height: number } | null>(null);
  const list = useRef<ListInstance | null>(null);
  const copy = useRef<ListInstance | null>(null);
  // The list's last scroll offset (followed in every pose, so a copy that appears starts in step), the list instance
  // it belongs to, and which of the two the user drags (it leads, the other follows).
  const offset = useRef<{ of: ListInstance | null; y: number }>({ of: null, y: 0 });
  const leader = useRef<'list' | 'copy'>('list');

  const measure = useCallback((): void => {
    if (fold === null) return;
    frame.current?.measureInWindow((_x, y, _width, height) => setEdges({ top: y, bottom: y + height }));
  }, [fold]);

  // A fold that comes, goes or moves, or a window that changes (which can move the frame in the window without a
  // layout of its own), measures again; leaving the laptop pose drops the gap.
  useEffect(() => {
    if (fold === null) setEdges(null);
    else measure();
  }, [fold, windowHeight, measure]);

  const element = !endAboveFold && isFlatList(children) ? children : null;
  const across =
    element === null
      ? null
      : foldListAcross(fold, edges, content?.key === element.key ? content.height : null, keyboardTop);
  const upper = across?.upper ?? null;

  // The copy (new, or after the frame moved) starts where the list's upper part ends.
  useEffect(() => {
    if (upper !== null) copy.current?.scrollToOffset({ offset: offset.current.y + upper, animated: false });
  }, [upper]);

  const theirRef = element?.props.ref;
  const listRef = useCallback(
    (instance: ListInstance | null) => {
      list.current = instance;
      // A list mounted in another's place (a switch of lists) starts at its top, led by itself.
      if (instance !== null && instance !== offset.current.of) {
        offset.current = { of: instance, y: 0 };
        leader.current = 'list';
      }
      if (typeof theirRef === 'function') theirRef(instance);
      else if (theirRef != null) theirRef.current = instance;
    },
    [theirRef],
  );

  let inset = 0;
  if (across !== null) inset = across.band + across.lower;
  else if (fold !== null && edges !== null && edges.top < fold.top) {
    inset = Math.min(edges.bottom - edges.top, foldUpperHalfInset(fold, edges.bottom));
  }

  let shown: ReactNode = children;
  let lower: ReactNode = null;
  if (element !== null) {
    const props = element.props;
    const insets = across === null ? null : foldListInsets(across);
    shown = cloneElement(element, {
      ref: listRef,
      contentInset: insets === null ? props.contentInset : withInsets(props.contentInset, insets.list),
      scrollEventThrottle: across === null ? props.scrollEventThrottle : 16,
      // As the follower the list is set to offsets beyond its own range (a pull past the top or the end in the
      // copy), which the native scroll command only takes with this switch on; outside this mode the list's own.
      scrollToOverflowEnabled: across === null ? props.scrollToOverflowEnabled : true,
      onContentSizeChange: (width: number, height: number) => {
        const key = element.key;
        setContent((current) => (current?.key === key && current.height === height ? current : { key, height }));
        props.onContentSizeChange?.(width, height);
      },
      onScrollBeginDrag: (event: ScrollEvent) => {
        leader.current = 'list';
        props.onScrollBeginDrag?.(event);
      },
      onScroll: (event: ScrollEvent) => {
        offset.current.y = event.nativeEvent.contentOffset.y;
        if (across !== null && leader.current === 'list') {
          copy.current?.scrollToOffset({ offset: foldCopyOffset(offset.current.y, across), animated: false });
        }
        props.onScroll?.(event);
      },
    });
    if (across !== null && insets !== null) {
      lower = (
        <View
          style={[styles.copy, { top: across.upper + across.band, height: across.lower }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {cloneElement(element, {
            ref: copy,
            contentInset: withInsets(props.contentInset, insets.copy),
            scrollEventThrottle: 16,
            // The copy's offsets lie past its own range (content shorter than both parts together, a pull past the
            // top or the end); without this switch the native scroll command clamps them and rows would repeat.
            scrollToOverflowEnabled: true,
            showsVerticalScrollIndicator: false,
            scrollsToTop: false,
            refreshControl: undefined,
            onRefresh: undefined,
            refreshing: undefined,
            onEndReached: undefined,
            onStartReached: undefined,
            onViewableItemsChanged: undefined,
            onLayout: undefined,
            onContentSizeChange: undefined,
            ListHeaderComponentStyle: [props.ListHeaderComponentStyle, styles.untouchable],
            onScrollBeginDrag: (event: ScrollEvent) => {
              leader.current = 'copy';
              props.onScrollBeginDrag?.(event);
            },
            // A drag that ends where it will rest hands the lead back; one that flings or bounces on hands it back
            // when that motion ends.
            onScrollEndDrag: (event: ScrollEvent) => {
              const { contentOffset, targetContentOffset } = event.nativeEvent;
              if (targetContentOffset === undefined || Math.abs(targetContentOffset.y - contentOffset.y) < 0.5) {
                leader.current = 'list';
              }
              props.onScrollEndDrag?.(event);
            },
            onMomentumScrollEnd: (event: ScrollEvent) => {
              leader.current = 'list';
              props.onMomentumScrollEnd?.(event);
            },
            onScroll: (event: ScrollEvent) => {
              if (leader.current !== 'copy') return;
              list.current?.scrollToOffset({
                offset: foldListOffset(event.nativeEvent.contentOffset.y, across),
                animated: false,
              });
            },
          })}
        </View>
      );
    }
  }

  return (
    <View
      ref={frame}
      collapsable={false}
      style={inset > 0 ? [styles.frame, { paddingBottom: inset }] : styles.frame}
      onLayout={measure}
    >
      {shown}
      {lower}
    </View>
  );
}

function isFlatList(children: ReactNode): children is ListElement {
  return isValidElement(children) && children.type === FlatList;
}

function withInsets(own: Insets | undefined, added: Insets): Insets {
  return {
    ...own,
    top: (own?.top ?? 0) + (added.top ?? 0),
    bottom: (own?.bottom ?? 0) + (added.bottom ?? 0),
  };
}

const styles = StyleSheet.create({
  // A scroll view's own flex (React Native's `ScrollView` grows and shrinks in its parent): the frame stands in its
  // place.
  frame: { flexGrow: 1, flexShrink: 1 },
  // The lower part, below the fold's band: as wide as the frame, placed from the frame's measured edges.
  copy: { position: 'absolute', left: 0, right: 0 },
  // The copy's list header (a search field, say) takes no touches: the list's own header is the one to use.
  untouchable: { pointerEvents: 'none' },
});
