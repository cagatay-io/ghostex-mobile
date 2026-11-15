/**
 * Settings › Connection › Crash reports: the row under Logs, the list of the reports kept on this phone, one report
 * with Copy, Share and Delete, and keeping them switched off. Kept apart from src/copy.ts so that file stays under the
 * size limit; the same rules apply (no em dashes, the card rule for notices).
 */

export const CrashReportsSettingsCopy = {
  /** Settings › Connection › Troubleshooting, under Logs, and the page's title. */
  title: 'Crash reports',
  rowDescription: 'Saved when Ghostex closed unexpectedly. Copy, share or delete them.',
  pageIntro: 'What Ghostex saved on this phone when it closed unexpectedly.',
  /** Settings › Connection's one-line intro while the page has the row. */
  connectionIntro: 'Your computers, their routes, reconnecting, memory, logs and crash reports.',
  keep: 'Keep crash reports',
  keepCaption: 'Turning this off deletes the saved reports. While it is off, none are saved.',
  savedHeader: 'Saved reports',
  limitCaption: 'The phone keeps the 5 newest.',
  deleteAll: 'Delete All Reports',
  empty: 'No crash reports saved on this phone. Not every unexpected close leaves a report.',
  keptOff: 'Crash reports are not kept on this phone.',
  /** A report from iOS (MetricKit) has a time range instead of a time. */
  rangeOnly: 'iOS gives only the time range',
  /** A list row's second line: the kind, and for a report from iOS the range note. */
  rowKind: (kind: string, range: boolean) => (range ? `${kind} · iOS gives only the time range` : kind),
  /** A list row for VoiceOver: "Native crash, sometime between Nov 14, 22:10 – Nov 15, 09:41". */
  rowLabel: (kind: string, when: string, range: boolean) => `${kind}, ${range ? 'sometime between ' : ''}${when}`,
  copy: 'Copy',
  copied: 'Copied',
  share: 'Share',
  shareFailed: "Couldn't share",
  delete: 'Delete',
  privacy:
    'Copy and Share replace the computer and user names, IP addresses, emails and keys they recognize. Other names and addresses stay in the text: read it before you share.',
  textLabel: 'Report text',
  /**
   * Failures the approved screens do not draw (a list that cannot be read, a deletion that did not happen): said in
   * the card rule's words until the owner words them.
   */
  readFailed: "Couldn't read the crash reports on this phone.",
  deleteFailed: "Couldn't delete",
  deleteAllFailed: "Couldn't delete every report. The ones listed are still on this phone.",
  confirmDeleteAll: {
    title: 'Delete all crash reports?',
    body: (count: number) => `The ${reportsAre(count)} deleted. This can't be undone.`,
    confirm: 'Delete All',
  },
  confirmKeepOff: {
    title: 'Stop keeping crash reports?',
    body: (count: number) => `The ${reportsAre(count)} deleted, and none are saved until you turn this on again.`,
    confirm: 'Turn Off',
  },
  /** Settings search: other words the rows are found by. */
  searchWords: ['crash', 'crashes', 'crash log', 'closed unexpectedly'],
} as const;

/** "3 reports on this phone are", and for one report "1 report on this phone is". */
function reportsAre(count: number): string {
  return count === 1 ? '1 report on this phone is' : `${count} reports on this phone are`;
}
