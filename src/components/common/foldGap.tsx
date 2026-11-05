/**
 * The lists' fold gap (the designs: "half folded, nothing on the fold in lists"; the laptop pose only): while the
 * iPhone Duo is half folded like a laptop, a list's scroll view ends `FOLD_CLEARANCE` above the fold
 * (`foldUpperHalfInset`, as the web preview and the chat's page sheet do), so no row is drawn on the fold, at rest or
 * while scrolling; the lower half below the list stays empty, or holds the keyboard. A list that starts below the
 * fold's top is left as it is. In every other pose (flat, the book pose), on every other iPhone and in a pane (its
 * screen passes no fold) there is no gap and nothing is measured.
 *
 * Adopting it in a list (done here: Settings pages, the Sessions screen's classic and Unified lists, the work-link
 * picker): wrap the list's scroll view in `<FoldListFrame fold={useLaptopFold()}>`. The frame takes the room the
 * scroll view took (it grows and shrinks as a scroll view does), so the scroll view keeps its own style; outside the
 * laptop pose the frame adds nothing. This file takes the fold as an argument and imports no chrome, so a screen
 * that shows a list in a pane passes null.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewInstance } from 'react-native';

import { foldUpperHalfInset, type LaptopFold } from './verticalBar/layout';

export function FoldListFrame({ fold, children }: { fold: LaptopFold | null; children: ReactNode }) {
  const { height: windowHeight } = useWindowDimensions();
  const frame = useRef<ViewInstance | null>(null);
  // The frame's top and bottom edge in window points, measured only in the laptop pose.
  const [edges, setEdges] = useState<{ top: number; bottom: number } | null>(null);

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

  const inset =
    fold === null || edges === null || edges.top >= fold.top
      ? 0
      : Math.min(edges.bottom - edges.top, foldUpperHalfInset(fold, edges.bottom));
  return (
    <View
      ref={frame}
      collapsable={false}
      style={inset > 0 ? [styles.frame, { paddingBottom: inset }] : styles.frame}
      onLayout={measure}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // A scroll view's own flex (React Native's `ScrollView` grows and shrinks in its parent): the frame stands in its
  // place.
  frame: { flexGrow: 1, flexShrink: 1 },
});
