/**
 * The rows the Android persistent notification lists, built from each machine's mobile summary
 * (pure, so it can be tested without the native module; persistentNotification.ts feeds them to
 * GhostexForegroundService.kt, which also derives the "N working" summary line from them).
 */

import type { NotificationSessionRow } from '../../modules/ghostex-native/src/GhostexNative.types';
import { displayStatus, type GhostexMobileSummary } from '../contract/mobileSummary';

/**
 * CDXC:Coordinators 2026-11-02 DECISION: The phone's notification leaves out every coordinator thread; the coordinator itself still shows. User: "please in the android app notification we shouldn't show the sub threads of a coordinator listed there." A session is a thread when it carries its coordinator's ids, the same link the drawer nests it by (coordinatorTree.ts), and since the summary line counts these rows, threads drop out of "N working" too.
 */
function isCoordinatorThread(session: GhostexMobileSummary['sessions'][number]): boolean {
  return session.coordinatorProjectId.length > 0 && session.coordinatorSessionId.length > 0;
}

export function notificationRowsFromSummary(machineId: string, summary: GhostexMobileSummary): NotificationSessionRow[] {
  const projectNameById = new Map<string, string>();
  for (const project of summary.projects) {
    projectNameById.set(project.projectId, project.name ?? project.path ?? '');
  }
  return summary.sessions
    .filter((session) => (session.isLive || session.isSleeping) && !isCoordinatorThread(session))
    .map((session) => ({
      title: session.displayTitle.length > 0 ? session.displayTitle : session.sessionId,
      status: displayStatus(session),
      project: projectNameById.get(session.projectId) ?? '',
      machineId,
      sessionId: session.sessionId,
    }));
}
