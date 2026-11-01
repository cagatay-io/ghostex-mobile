/**
 * Nothing on the knick in lists, half folded like a laptop (the approved mockups: "half folded, nothing on the fold
 * in lists"; the laptop pose only, the book pose has no layout of its own). The approved form (the mockups' "fold in
 * lists" rule and the design kit's fold-free rule): at rest, the first item of a list
 * that would cross the fold's band starts 4 pt below it; a heading moves with the rows it introduces, a short group
 * moves as a whole, a taller one is entered and the row inside it that would cross moves;
 * while scrolling the content passes under the band. Pure geometry; `foldGap.tsx` measures and applies it.
 * Frames are window points of the list's units as they stand with the list scrolled to its top and no gap.
 */

import type { LaptopFold } from './verticalBar/layout';

/**
 * - `row`: moves as a whole (a list row, a settings row, a caption).
 * - `heading`: moves together with the unit right below it when that one moves.
 * - `group`: a column of units (a project card with its rows); moved as a whole when it is short, otherwise entered.
 */
export type FoldGapUnitKind = 'row' | 'heading' | 'group';

export type FoldGapUnitFrame = {
  readonly id: string;
  /** The group it stands in; null for the list's own units. */
  readonly parent: string | null;
  readonly kind: FoldGapUnitKind;
  readonly top: number;
  readonly bottom: number;
};

/** The unit that gets the gap above it, and how tall the gap is. */
export type FoldGap = { readonly id: string; readonly shift: number };

/** Below the fold's band, so a moved unit never touches the knick. */
export const FOLD_GAP_CLEARANCE = 4;
/** A group taller than this is entered rather than moved. */
const MOVE_WHOLE_MAX = 120;
/** A heading moves with the unit below it when that one starts at most this far below the heading's top. */
const HEADING_REACH = 120;
/** ...and the heading's bottom is at most this far above it. */
const HEADING_GAP = 24;
const MAX_DEPTH = 8;

function crosses(unit: FoldGapUnitFrame, fold: LaptopFold): boolean {
  return unit.bottom > unit.top && unit.bottom > fold.top && unit.top < fold.bottom;
}

function childrenOf(units: readonly FoldGapUnitFrame[], parent: string | null): FoldGapUnitFrame[] {
  return units.filter((unit) => unit.parent === parent).sort((a, b) => a.top - b.top);
}

/** Where the gap goes at rest: null when no unit crosses the fold. */
export function foldGapFor(units: readonly FoldGapUnitFrame[], fold: LaptopFold): FoldGap | null {
  let level: string | null = null;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const siblings = childrenOf(units, level);
    const hit = siblings.find((unit) => crosses(unit, fold));
    if (hit === undefined) return null;
    const height = hit.bottom - hit.top;
    if (hit.kind === 'group' && height > MOVE_WHOLE_MAX && childrenOf(units, hit.id).length > 0) {
      level = hit.id;
      continue;
    }
    let target = hit;
    for (let step = 0; step < MAX_DEPTH; step += 1) {
      // The first unit of a group takes its group along when the group starts close above it.
      const parent = target.parent === null ? undefined : units.find((unit) => unit.id === target.parent);
      if (parent !== undefined && childrenOf(units, parent.id)[0]?.id === target.id) {
        if (hit.top - parent.top <= HEADING_REACH) {
          target = parent;
          continue;
        }
        break;
      }
      const row = childrenOf(units, target.parent);
      const previous = row[row.findIndex((unit) => unit.id === target.id) - 1];
      if (
        previous !== undefined &&
        previous.kind === 'heading' &&
        target.top - previous.bottom <= HEADING_GAP &&
        hit.top - previous.top <= HEADING_REACH
      ) {
        target = previous;
        continue;
      }
      break;
    }
    return { id: target.id, shift: fold.bottom + FOLD_GAP_CLEARANCE - target.top };
  }
  return null;
}

/**
 * The frames as they would stand without `gap`, from frames measured with it in place: the gap's unit and
 * everything below its top moved down by the gap, and the groups holding it grew by it.
 */
export function framesWithoutGap(units: readonly FoldGapUnitFrame[], gap: FoldGap | null): FoldGapUnitFrame[] {
  if (gap === null) return [...units];
  const target = units.find((unit) => unit.id === gap.id);
  if (target === undefined) return [...units];
  const holders = new Set<string>();
  for (let parent = target.parent; parent !== null;) {
    holders.add(parent);
    parent = units.find((unit) => unit.id === parent)?.parent ?? null;
  }
  return units.map((unit) => {
    if (holders.has(unit.id)) return { ...unit, bottom: unit.bottom - gap.shift };
    if (unit.id === gap.id || unit.top >= target.top - 0.5) {
      return { ...unit, top: unit.top - gap.shift, bottom: unit.bottom - gap.shift };
    }
    return unit;
  });
}
