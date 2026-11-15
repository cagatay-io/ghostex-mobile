/**
 * The two "Can't reach" checklists (docs/2026-09-03/mobile-setup/
 * mobile-09-cant-reach.html), one per transport, ordered by how often each
 * cause is the real one; a plain SSH computer gets the Tailscale one without the phone's Tailscale check. A step the phone can verify itself carries a `verify`
 * key and is ticked from live state; a step with a fix inside the app carries
 * an `action` the screen turns into a button.
 */

import { CantReachCopy } from '../../copy';
import { isTailscaleSshMachine, type MachineRecord } from '../../machines/store';

export type ChecklistVerify = 'tailscaleOnPhone';
export type ChecklistAction = 'scanNewCode' | 'editAddress';

export type ChecklistStep = {
  id: string;
  title: string;
  detail: string;
  verify?: ChecklistVerify;
  action?: { kind: ChecklistAction; label: string };
};

const easyConnect = CantReachCopy.easyConnect;
const tailscale = CantReachCopy.tailscale;

export const EASY_CONNECT_CHECKLIST: readonly ChecklistStep[] = [
  { id: 'awake', title: easyConnect.awake.title, detail: easyConnect.awake.detail },
  { id: 'ghostexOpen', title: easyConnect.ghostexOpen.title, detail: easyConnect.ghostexOpen.detail },
  { id: 'easyConnectOn', title: easyConnect.easyConnectOn.title, detail: easyConnect.easyConnectOn.detail },
  {
    id: 'unpaired',
    title: easyConnect.unpaired.title,
    detail: easyConnect.unpaired.detail,
    action: { kind: 'scanNewCode', label: easyConnect.unpaired.button },
  },
];

export const TAILSCALE_CHECKLIST: readonly ChecklistStep[] = [
  {
    id: 'tailscaleOnPhone',
    title: tailscale.tailscaleOnPhone.title,
    detail: tailscale.tailscaleOnPhone.detailChecking,
    verify: 'tailscaleOnPhone',
  },
  {
    id: 'tailscaleOnComputer',
    title: tailscale.tailscaleOnComputer.title,
    detail: tailscale.tailscaleOnComputer.detail,
  },
  { id: 'awake', title: tailscale.awake.title, detail: tailscale.awake.detail },
  {
    id: 'address',
    title: tailscale.address.title,
    detail: tailscale.address.detail,
    action: { kind: 'editAddress', label: tailscale.address.button },
  },
];

/**
 * CDXC:RemotePairing 2026-11-16 DECISION:
 * User (yes to the suggestion after "SSH · <address>" labels landed): a computer reached by plain SSH, not through
 * a tailnet (`isTailscaleSshMachine`), skips "Tailscale is connected on this phone"; Tailscale computers keep it.
 */
export function checklistFor(
  machine: Pick<MachineRecord, 'transport' | 'host' | 'tailscaleSsh'>,
): readonly ChecklistStep[] {
  if (machine.transport === 'tailcat') return EASY_CONNECT_CHECKLIST;
  if (isTailscaleSshMachine(machine)) return TAILSCALE_CHECKLIST;
  return TAILSCALE_CHECKLIST.filter((step) => step.verify !== 'tailscaleOnPhone');
}
