/**
 * Where the new chat's breadcrumb puts its parts: one row while they fit, else two rows on a grid
 * (project and computer over where and detail, the columns lined up), centred while the bar is
 * narrow, with the widest column cut short first. The same rule as desktop's
 * `apps/desktop/src/app/native_chat/tray_layout.rs` (its tests are the same cases as this file's);
 * `WorktreeTray.tsx` measures the parts and draws what this decides.
 *
 * CDXC:Worktrees 2026-11-04 DECISION: User (Q1227 note): on a narrow screen the breadcrumb goes on
 * two levels, "aligned well please like a grid", and is centred when it does not fill the bar.
 */

/** One part's width with all of its words, and the least it may be cut to. */
export type PartSize = { natural: number; min: number };

export type TrayLayout = {
  /** The where row sits under the place row instead of after it. */
  twoRows: boolean;
  /** The parts sit in the middle of the bar instead of at its start. */
  centered: boolean;
  /** Each part's width, row by row as given: the place row, then the where row. */
  widths: [number[], number[]];
  /** Two rows: each column's width, which every part of that column is drawn in. */
  columns: number[];
};

/** Below this width the bar counts as narrow: what fits is centred. */
export const NARROW_WIDTH = 520;

const sum = (widths: number[]): number => widths.reduce((total, width) => total + width, 0);

/** Cuts the widest down first, to one common level, until they fit in `room`, never below each one's `min`. */
function shrink(widths: number[], mins: number[], room: number): number[] {
  const at = (level: number): number[] => widths.map((width, index) => Math.min(width, Math.max(level, mins[index]!)));
  let low = 0;
  let high = Math.max(0, ...widths);
  if (sum(at(low)) > room) return at(low);
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (sum(at(middle)) > room) high = middle;
    else low = middle;
  }
  return at(low);
}

/**
 * Places the place row (project, computer) and the where row (where, detail) in `available` points
 * with `separator` between neighbours. `available` of zero or less is a bar not measured yet: one
 * row, every part whole.
 */
export function trayLayout(
  rows: [PartSize[], PartSize[]],
  separator: number,
  available: number,
  narrow: number = NARROW_WIDTH,
): TrayLayout {
  const all = [...rows[0], ...rows[1]];
  const natural = (parts: PartSize[]): number[] => parts.map((part) => part.natural);
  const oneRow = sum(natural(all)) + separator * Math.max(0, all.length - 1);
  const measured = available > 0;
  if (!measured || oneRow <= available || rows[0].length === 0 || rows[1].length === 0) {
    const widths =
      measured && oneRow > available
        ? shrink(
            natural(all),
            all.map((part) => part.min),
            available - separator * Math.max(0, all.length - 1),
          )
        : natural(all);
    const first = rows[0].length;
    return {
      twoRows: false,
      centered: measured && available < narrow,
      widths: [widths.slice(0, first), widths.slice(first)],
      columns: [],
    };
  }
  const count = Math.max(rows[0].length, rows[1].length);
  const column = (index: number, value: (part: PartSize) => number): number =>
    Math.max(0, ...rows.flatMap((row) => (row[index] !== undefined ? [value(row[index]!)] : [])));
  const wanted = Array.from({ length: count }, (_, index) => column(index, (part) => part.natural));
  const mins = Array.from({ length: count }, (_, index) => column(index, (part) => part.min));
  const room = available - separator * (count - 1);
  const columns = sum(wanted) > room ? shrink(wanted, mins, room) : wanted;
  const fit = (row: PartSize[]): number[] => row.map((part, index) => Math.min(part.natural, columns[index]!));
  return { twoRows: true, centered: true, widths: [fit(rows[0]), fit(rows[1])], columns };
}
