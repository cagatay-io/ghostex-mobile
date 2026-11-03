/**
 * The project list's rows (the agent menu's and the tray's project sheet): Recent and All projects
 * headings while nothing is typed and a project is recent, as the desktop New thread picker lists
 * them (`new_thread_picker_place.rs`).
 */

import { filterProjectChoices, type UnifiedProjectChoice } from './choices';

export type ProjectListRow =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'project'; key: string; choice: UnifiedProjectChoice };

export function projectPickerRows(choices: readonly UnifiedProjectChoice[], query: string): ProjectListRow[] {
  const found = filterProjectChoices(choices, query);
  const rows: ProjectListRow[] = [];
  const sections = query.trim().length === 0 && found.some((choice) => choice.recent);
  let heading: 'recent' | 'all' | null = null;
  for (const choice of found) {
    const section = choice.recent ? 'recent' : 'all';
    if (sections && section !== heading) {
      heading = section;
      rows.push({ kind: 'heading', key: `heading:${section}`, label: section === 'recent' ? 'Recent' : 'All projects' });
    }
    rows.push({ kind: 'project', key: choice.repoKey, choice });
  }
  return rows;
}
