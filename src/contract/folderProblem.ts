/**
 * The mark a project whose folder is missing wears on its header, and the words of the sheet it
 * opens: the cause the computer's gxserver found (`pathProblem`) and the fixes.
 *
 * CDXC:Projects 2026-11-20 DECISION: User picked (Q4244) a computer with a slash through it on the
 * header of a project whose folder is missing, "only on the project header, not on the actual
 * sessions", fixed one project at a time, never a pop-up. The phone draws the same mark after the
 * project's name; tapping it opens a sheet for that one project with Use <the folder found>, Ask AI
 * to fix and Remove project. Locate Folder… stays on the computer (it needs its folder picker).
 * SEE-ALSO: packages/gx-core/src/sidebar_view/folder_problem.rs (the desktop's words, which these
 * follow), server/src/project_folder_problem.rs (the diagnosis).
 */

/** Why the folder is missing, as the computer read it from its disk. */
export type GhostexPathProblem = {
  /** `renamed`, `link`, `drive` or `gone`. */
  cause: string;
  /** The folder most likely to be the missing one now (offered as Use). */
  found?: string;
  /** The folder along the path that is gone, and the folder that took its place. */
  missing?: string;
  renamedTo?: string;
  /** The link along the path whose target is gone, and that target. */
  link?: string;
  linkTarget?: string;
  /** The drive that isn't connected. */
  drive?: string;
};

export type FolderProblemCause = 'renamed' | 'link' | 'drive' | 'gone';

export type FolderProblemView = {
  cause: FolderProblemCause;
  /** The project's folder as stored. */
  folder: string;
  /** Grey, not amber: the folder's drive is away and the project comes back by itself. */
  quiet: boolean;
  title: string;
  line: string;
  /** The folder offered as the fix, and its row's label (`Use shortpoint-repos/app`). */
  useFolder?: string;
  useLabel?: string;
};

function baseName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

/** `found` from the folder that holds `renamedTo` on (`shortpoint-repos/app`); just its name without one. */
function useLabelPath(found: string, renamedTo: string | undefined): string {
  if (renamedTo === undefined) return baseName(found);
  const holder = renamedTo.slice(0, renamedTo.length - baseName(renamedTo).length);
  return found.startsWith(holder) && found.length > holder.length ? found.slice(holder.length) : baseName(found);
}

/** Reads `pathProblem` off a summary project entry. */
export function parsePathProblem(value: unknown): GhostexPathProblem | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  const text = (key: string): string | undefined => {
    const field = entry[key];
    return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined;
  };
  return {
    cause: text('cause') ?? 'gone',
    found: text('found'),
    missing: text('missing'),
    renamedTo: text('renamedTo'),
    link: text('link'),
    linkTarget: text('linkTarget'),
    drive: text('drive'),
  };
}

/** The mark and sheet of `title`'s project, whose folder `path` is in `pathState`; undefined while it is there. */
export function folderProblemOf(
  title: string,
  path: string,
  pathState: string | undefined,
  problem: GhostexPathProblem | undefined,
): FolderProblemView | undefined {
  if (pathState !== 'missing' && pathState !== 'notDirectory') return undefined;
  const folder = path.trim();
  if (folder.length === 0) return undefined;
  const name = title.trim().length > 0 ? title.trim() : baseName(folder);
  const cause: FolderProblemCause =
    problem?.cause === 'renamed' || problem?.cause === 'link' || problem?.cause === 'drive' ? problem.cause : 'gone';
  const found = cause === 'drive' ? undefined : problem?.found;
  const renamedTo = problem?.renamedTo;
  const missing = problem?.missing;
  let viewTitle: string;
  let line: string;
  switch (cause) {
    case 'renamed':
      viewTitle = `${name}'s folder was renamed`;
      if (
        missing !== undefined &&
        renamedTo !== undefined &&
        missing.replace(/[/\\]+$/, '') !== folder.replace(/[/\\]+$/, '')
      ) {
        line = `The folder it was in, ${baseName(missing)}, is now ${baseName(renamedTo)}, and ${name} is inside it.`;
      } else if (renamedTo !== undefined) {
        line = `Ghostex found a folder with a close name where it was: ${baseName(renamedTo)}.`;
      } else {
        line = 'Ghostex found a folder with a close name where it was.';
      }
      break;
    case 'link':
      viewTitle = `${name}'s folder link points nowhere`;
      line =
        renamedTo !== undefined && found !== undefined
          ? `Its folder is a link to a folder that was renamed to ${baseName(renamedTo)}.`
          : 'Its folder is a link to a folder that no longer exists, and nothing with a close name is next to it.';
      break;
    case 'drive': {
      const drive = problem?.drive ?? '';
      const driveName = baseName(drive).replace(/:$/, '');
      viewTitle = drive.endsWith(':')
        ? `Drive ${drive} isn't connected`
        : driveName.length > 0
          ? `The ${driveName} drive isn't connected`
          : "Its drive isn't connected";
      line = `${name} lives on it. Connect the drive and the project comes back by itself; nothing needs fixing.`;
      break;
    }
    default:
      viewTitle = `${name}'s folder is missing`;
      line =
        "It isn't where it was, and no folder with a close name is nearby. It may have been moved, renamed or deleted.";
  }
  return {
    cause,
    folder,
    quiet: cause === 'drive',
    title: viewTitle,
    line,
    useFolder: found,
    useLabel: found !== undefined ? `Use ${useLabelPath(found, renamedTo)}` : undefined,
  };
}

/** What the phone says after `folder` became the project's folder. */
export function folderFixedWords(title: string, folder: string): string {
  const trimmed = folder.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/).filter((part) => part.length > 0);
  const shown = parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : baseName(trimmed);
  return `${title.trim()} now uses ${shown}. Its sessions moved with it.`;
}

/** What Ask AI to fix stages in the new chat. */
export function folderAskAiPrompt(title: string, problem: FolderProblemView): string {
  return (
    `Fix my missing project folder. The Ghostex project "${title.trim()}" can't find its folder ${problem.folder}. ` +
    `Ghostex says: ${problem.title}. ${problem.line}` +
    (problem.useFolder !== undefined ? `\n- Found: ${problem.useFolder}` : '') +
    '\nFind out what happened and fix it. Ask me before you change anything on disk or in Ghostex.'
  );
}
