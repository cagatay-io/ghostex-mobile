/**
 * "Copy links from <computer>": the computer's own links (`customLinks` in its settings file, the desktop's sidebar ⋯
 * menu) read with `ghostex settings get customLinks --json` over the link the phone already has, the way Files reads
 * `manageAdditionalDocsFolders` (src/docs/client.ts). No server change: `settings get` answers any catalog key, and
 * `customLinks` is one from the first Ghostex after 11.13.0 (where the desktop got links). An older computer answers
 * `Unknown setting`.
 */

import { runGhostexCli, GhostexCliFailure } from '../components/sessions/cli';
import type { MachineConnectionTarget } from '../machines/credentials';
import { isComputerLink, linksFromValue } from './links';
import type { PhoneLinkDraft } from './store';

export type ComputerLinksResult =
  | { kind: 'links'; links: PhoneLinkDraft[] }
  /** The computer's Ghostex predates links. */
  | { kind: 'tooOld' }
  | { kind: 'failed'; message: string };

/** The computer's saved links, each loopback one tied to that computer, so it opens there from the phone. */
export async function readComputerLinks(machine: MachineConnectionTarget): Promise<ComputerLinksResult> {
  try {
    const result = await runGhostexCli(machine, 'ghostex settings get customLinks --json');
    const links = linksFromValue(result.json?.current).map(
      (link): PhoneLinkDraft => ({
        name: link.name,
        url: link.url,
        ...(link.icon !== undefined ? { icon: link.icon } : {}),
        ...(isComputerLink(link.url) ? { machineId: machine.id } : {}),
      }),
    );
    return { kind: 'links', links };
  } catch (error) {
    const raw = error instanceof GhostexCliFailure ? error.raw : String(error);
    if (raw.includes('Unknown setting') || raw.includes('Unknown settings command')) return { kind: 'tooOld' };
    return { kind: 'failed', message: error instanceof Error ? error.message : raw };
  }
}
