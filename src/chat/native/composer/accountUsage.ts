/**
 * The Accounts & limits panel's compact usage row, read from the core's `PanelUsageBar`s the way
 * desktop's `option_menu/accounts.rs` reads them: each limit is a column with its label ("5h",
 * "7d", "Fable") and percent over a thin bar, three columns to a line.
 */

import { arr, num, str } from './json';

export type UsageColumn = {
  name: string;
  value: string;
  percent: number;
  /** The bare countdown ("2h 36m", "due"), empty without a reset time. */
  resetIn: string;
};

/** Columns per line. */
export const USAGE_COLUMNS = 3;

export function usageColumns(windows: unknown): UsageColumn[] {
  return arr(windows).map((window) => ({
    name: str(window, 'name'),
    value: str(window, 'value'),
    percent: Math.min(100, Math.max(0, num(window, 'percent') ?? 0)),
    resetIn: str(window, 'resetIn'),
  }));
}

/** The columns split into lines of three; the last line is padded with nulls so its columns stay as wide. */
export function usageLines(columns: UsageColumn[]): (UsageColumn | null)[][] {
  const lines: (UsageColumn | null)[][] = [];
  for (let start = 0; start < columns.length; start += USAGE_COLUMNS) {
    const line: (UsageColumn | null)[] = columns.slice(start, start + USAGE_COLUMNS);
    while (line.length < USAGE_COLUMNS) line.push(null);
    lines.push(line);
  }
  return lines;
}

/** The context line's text: "38% · 380k / 1m". */
export function contextText(context: unknown): string {
  return [str(context, 'value'), str(context, 'tokens')].filter((part) => part.length > 0).join(' · ');
}
