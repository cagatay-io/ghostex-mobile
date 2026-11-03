/**
 * The list fold gap (the designs: "half folded, nothing on the fold in lists"; the laptop pose only): a
 * scroll list gives its units a provider (`useFoldGapList(useLaptopFold())` + `FoldGapProvider`), its units render as
 * `FoldGapView`s (rows, headings, groups that hold rows), and while the iPhone Duo is half folded like a laptop the
 * first unit that would cross the fold at rest gets a top margin that starts it below the band (`foldGapLayout.ts`).
 * The margin is part of the content, so while scrolling the content passes under the band. In every other pose and
 * on every other iPhone there is no gap and nothing is measured; a `FoldGapView` outside a provider is a plain View.
 *
 * Adopting it in a list (done here: Settings, the Sessions screen's classic and Unified lists, the work-link picker;
 * to do when those land: the Files browser and the attention list):
 * 1. In the screen: `const foldGap = useFoldGapList(useLaptopFold());`, wrap the scroll view in
 *    `<FoldGapProvider value={foldGap}>`, and give the scroll view `onScroll={foldGap.onScroll}` (chained with an
 *    existing handler) and `scrollEventThrottle={16}`.
 * 2. Render each row as `<FoldGapView kind="row" style={...}>` (or make the row's own root View one), section
 *    titles as `kind="heading"`, and a card that holds rows as `kind="group"` with its rows as `FoldGapView`s
 *    inside it. Rows of a virtualised list are units the same way: only the first screen matters at rest.
 * This file takes the fold as an argument and imports no chrome, so the row views that use `FoldGapView`
 * (DrawerBlockView) stay renderable on their own.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import {
  foldGapFor,
  framesWithoutGap,
  type FoldGap,
  type FoldGapUnitFrame,
  type FoldGapUnitKind,
} from './foldGapLayout';
import type { LaptopFold } from './verticalBar/layout';

type RegisteredUnit = {
  readonly parent: string | null;
  readonly kind: FoldGapUnitKind;
  readonly ref: { readonly current: ViewInstance | null };
};

export type FoldGapList = {
  /** For the list's scroll view (`scrollEventThrottle={16}`): the gap is measured only with the list at its top. */
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly gap: FoldGap | null;
  readonly register: (id: string, unit: RegisteredUnit) => () => void;
  readonly requestMeasure: () => void;
};

const ListContext = createContext<FoldGapList | null>(null);
/** The group a unit stands in; null for the list's own units. */
const ParentContext = createContext<string | null>(null);

export const FoldGapProvider = ListContext.Provider;

/** Scrolled less than this counts as the list's top, where the gap is measured. */
const AT_REST = 1;

/** One list's fold gap: measured at rest in the laptop pose (`fold`, from `useLaptopFold`), null elsewhere. */
export function useFoldGapList(fold: LaptopFold | null): FoldGapList {
  const { height: windowHeight } = useWindowDimensions();
  const units = useRef(new Map<string, RegisteredUnit>());
  const offset = useRef(0);
  const pending = useRef(false);
  const pass = useRef(0);
  const scheduled = useRef<number | null>(null);
  const [gap, setGap] = useState<FoldGap | null>(null);
  const gapRef = useRef(gap);
  gapRef.current = gap;

  const measure = useCallback((): void => {
    scheduled.current = null;
    if (fold === null) {
      pending.current = false;
      setGap(null);
      return;
    }
    // Only the list at its top shows where things stand at rest; a later return to the top measures again.
    if (Math.abs(offset.current) >= AT_REST) {
      pending.current = true;
      return;
    }
    pending.current = false;
    const current = (pass.current += 1);
    const entries = [...units.current.entries()].filter(([, unit]) => unit.ref.current !== null);
    const frames: FoldGapUnitFrame[] = [];
    let left = entries.length;
    const done = (): void => {
      if (current !== pass.current) return;
      const next = foldGapFor(framesWithoutGap(frames, gapRef.current), fold);
      setGap((previous) =>
        previous?.id === next?.id && Math.abs((previous?.shift ?? 0) - (next?.shift ?? 0)) < 0.5 ? previous : next,
      );
    };
    if (left === 0) {
      done();
      return;
    }
    for (const [id, unit] of entries) {
      unit.ref.current?.measureInWindow((_x, y, _width, height) => {
        frames.push({ id, parent: unit.parent, kind: unit.kind, top: y, bottom: y + height });
        left -= 1;
        if (left === 0) done();
      });
    }
  }, [fold]);
  // A scheduled frame always measures with the fold of the latest render, never the one it was asked under.
  const latestMeasure = useRef(measure);
  latestMeasure.current = measure;

  const requestMeasure = useCallback((): void => {
    if (fold === null || scheduled.current !== null) return;
    // After the layout pass that asked for it, so every unit has its frame.
    scheduled.current = requestAnimationFrame(() => latestMeasure.current());
  }, [fold]);

  // A fold that comes, goes or moves, or a window that changes (which can move the units in the window without a
  // layout of their own), places the gap again (or drops it). The cleanup drops the frame queued under the old fold
  // and window and invalidates a measurement still waiting for native frames, so neither can put back a gap the pose
  // no longer has (the gap belongs to the laptop pose).
  useEffect(() => {
    if (fold === null) setGap(null);
    else requestMeasure();
    return () => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
      pass.current += 1;
    };
  }, [fold, windowHeight, requestMeasure]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      offset.current = event.nativeEvent.contentOffset.y;
      if (pending.current && Math.abs(offset.current) < AT_REST) requestMeasure();
    },
    [requestMeasure],
  );

  const register = useCallback(
    (id: string, unit: RegisteredUnit) => {
      units.current.set(id, unit);
      requestMeasure();
      return () => {
        units.current.delete(id);
        requestMeasure();
      };
    },
    [requestMeasure],
  );

  return useMemo(() => ({ onScroll, gap, register, requestMeasure }), [onScroll, gap, register, requestMeasure]);
}

export type FoldGapViewProps = ViewProps & {
  kind: FoldGapUnitKind;
  children?: ReactNode;
};

/** A unit of a fold-gap list: a View that takes the gap's top margin when it is the unit that moves. */
export function FoldGapView({ kind, style, onLayout, children, ...props }: FoldGapViewProps) {
  const list = useContext(ListContext);
  const parent = useContext(ParentContext);
  const id = useId();
  const ref = useRef<ViewInstance | null>(null);
  const register = list?.register;
  useEffect(() => register?.(id, { parent, kind, ref }), [register, id, parent, kind]);
  const shift = list?.gap?.id === id ? list.gap.shift : 0;
  const content = kind === 'group' ? <ParentContext.Provider value={id}>{children}</ParentContext.Provider> : children;
  return (
    <View
      {...props}
      ref={ref}
      style={shift > 0 ? [style, { marginTop: baseMarginTop(style) + shift }] : style}
      onLayout={(event) => {
        list?.requestMeasure();
        onLayout?.(event);
      }}
    >
      {content}
    </View>
  );
}

function baseMarginTop(style: StyleProp<ViewStyle>): number {
  const flat = StyleSheet.flatten(style);
  const value = flat?.marginTop ?? flat?.marginVertical ?? flat?.margin;
  return typeof value === 'number' ? value : 0;
}
