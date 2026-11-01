/**
 * The project file browser's actions in the approved mockup's order. A row's long-press menu (`rowMenu`): a file has
 * Open, Copy Full Path, Add to Session Context (only in a browser opened from an agent session) and Share… (where the
 * phone can hand a file to the share sheet); a folder has Copy Full Path only. A text preview's header
 * (`previewButtons`, rendered Markdown and source): Copy Full Path, Add to Session Context (again only from an agent
 * session), Share and Reload. Nothing that changes the project.
 */

export type RowAction = 'open' | 'copyPath' | 'addToSessionContext' | 'share';

export type PreviewAction = 'copyPath' | 'addToSessionContext' | 'share' | 'reload';

export type ActionOffers = { sessionContext: boolean; share: boolean };

export function rowMenuActions(row: 'file' | 'folder', offers: ActionOffers): RowAction[] {
  if (row === 'folder') return ['copyPath'];
  const actions: RowAction[] = ['open', 'copyPath'];
  if (offers.sessionContext) actions.push('addToSessionContext');
  if (offers.share) actions.push('share');
  return actions;
}

export function previewActions(offers: ActionOffers): PreviewAction[] {
  const actions: PreviewAction[] = ['copyPath'];
  if (offers.sessionContext) actions.push('addToSessionContext');
  if (offers.share) actions.push('share');
  actions.push('reload');
  return actions;
}
