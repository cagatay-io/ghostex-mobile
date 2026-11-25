/**
 * The GitHub repository picker on Add Project's Repository step: grouping by
 * owner, type-to-filter, the "time since last push" label, and the in-memory
 * last answer per machine.
 *
 * Groups: the signed-in account first ("Personal"), then each organisation
 * ordered by its most recently pushed repository, then "Shared with you" for
 * repositories other users own. Inside a group the server's order (most
 * recently pushed first) is kept; while filtering, names that start with the
 * typed text come before those that only contain it.
 */

import type { AddProjectListedRepository, AddProjectRepositoryList } from './client';

export type RepositoryGroupKind = 'personal' | 'organization' | 'shared';

export type RepositoryGroup = {
  key: string;
  kind: RepositoryGroupKind;
  /** Owner login, or empty for the Shared with you group. */
  owner: string;
  data: AddProjectListedRepository[];
};

/** The last answer per machine id, so reopening the screen shows it at once. */
const lastAnswers = new Map<string, AddProjectRepositoryList>();

export function cachedRepositoryList(machineId: string): AddProjectRepositoryList | null {
  return lastAnswers.get(machineId) ?? null;
}

export function rememberRepositoryList(machineId: string, answer: AddProjectRepositoryList): void {
  lastAnswers.set(machineId, answer);
}

export function repositoryFullName(repository: AddProjectListedRepository): string {
  return `${repository.owner}/${repository.name}`;
}

function pushedTime(repository: AddProjectListedRepository): number {
  if (repository.pushedAt === undefined) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(repository.pushedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * The login whose repositories form the Personal group: `viewer` when the
 * server sent it, otherwise the user-kind owner with the most repositories.
 */
function personalOwner(repositories: readonly AddProjectListedRepository[], viewer: string | undefined): string | null {
  if (viewer !== undefined && viewer.length > 0) return viewer.toLowerCase();
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const repository of repositories) {
    if (repository.ownerKind !== 'user') continue;
    const key = repository.owner.toLowerCase();
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/** Filter matches (case-insensitive substring of `owner/name`), prefix matches first, order otherwise kept. */
function filterGroup(
  repositories: readonly AddProjectListedRepository[],
  query: string,
): AddProjectListedRepository[] {
  if (query.length === 0) return [...repositories];
  const prefix: AddProjectListedRepository[] = [];
  const contains: AddProjectListedRepository[] = [];
  for (const repository of repositories) {
    const full = repositoryFullName(repository).toLowerCase();
    if (!full.includes(query)) continue;
    if (full.startsWith(query) || repository.name.toLowerCase().startsWith(query)) prefix.push(repository);
    else contains.push(repository);
  }
  return [...prefix, ...contains];
}

export function normalizeRepositoryQuery(text: string): string {
  return text.trim().toLowerCase();
}

/** Owner groups for the list, filtered by `text`; empty groups are left out. */
export function groupRepositories(
  repositories: readonly AddProjectListedRepository[],
  viewer: string | undefined,
  text: string,
): RepositoryGroup[] {
  const personal = personalOwner(repositories, viewer);
  const query = normalizeRepositoryQuery(text);
  const personalRepos: AddProjectListedRepository[] = [];
  const shared: AddProjectListedRepository[] = [];
  const organisations = new Map<string, { owner: string; latest: number; first: number; data: AddProjectListedRepository[] }>();
  repositories.forEach((repository, index) => {
    const key = repository.owner.toLowerCase();
    if (personal !== null && key === personal) {
      personalRepos.push(repository);
    } else if (repository.ownerKind === 'organization') {
      const group = organisations.get(key);
      if (group === undefined) {
        organisations.set(key, { owner: repository.owner, latest: pushedTime(repository), first: index, data: [repository] });
      } else {
        group.latest = Math.max(group.latest, pushedTime(repository));
        group.data.push(repository);
      }
    } else {
      shared.push(repository);
    }
  });

  const groups: RepositoryGroup[] = [];
  const add = (kind: RepositoryGroupKind, owner: string, data: AddProjectListedRepository[]): void => {
    const filtered = filterGroup(data, query);
    if (filtered.length === 0) return;
    groups.push({ key: `${kind}:${owner.toLowerCase()}`, kind, owner, data: filtered });
  };
  if (personalRepos.length > 0) add('personal', personalRepos[0]?.owner ?? '', personalRepos);
  const orderedOrganisations = [...organisations.values()].sort(
    (left, right) => right.latest - left.latest || left.first - right.first,
  );
  for (const organisation of orderedOrganisations) add('organization', organisation.owner, organisation.data);
  add('shared', '', shared);
  return groups;
}

/** The listed repository `text` names exactly (`owner/name`, any case). */
export function exactListedRepository(
  repositories: readonly AddProjectListedRepository[],
  text: string,
): AddProjectListedRepository | null {
  const query = normalizeRepositoryQuery(text);
  if (query.length === 0) return null;
  return repositories.find((repository) => repositoryFullName(repository).toLowerCase() === query) ?? null;
}

/** The single listed repository the filter leaves, if exactly one is left. */
export function singleFilteredRepository(groups: readonly RepositoryGroup[]): AddProjectListedRepository | null {
  let found: AddProjectListedRepository | null = null;
  for (const group of groups) {
    for (const repository of group.data) {
      if (found !== null) return null;
      found = repository;
    }
  }
  return found;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short "time since last push": `now`, `12m`, `5h`, `4d`, `3w`, `2mo`, `1y`; empty when unknown. */
export function formatSincePush(pushedAt: string | undefined, now: number): string {
  if (pushedAt === undefined) return '';
  const time = Date.parse(pushedAt);
  if (Number.isNaN(time)) return '';
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))}mo`;
  return `${Math.floor(days / 365)}y`;
}
