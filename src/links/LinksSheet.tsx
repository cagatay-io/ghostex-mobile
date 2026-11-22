/**
 * The ☰ menu's Links page: the phone's saved links (a tap opens the page in the Web Preview), each row's ⋯ with Edit…
 * and Remove (the desktop's row menu), Add link…, and "Copy links from <computer>" for the selected computer. One
 * component owns the three steps (the list, a row's menu, the dialog), so the Sessions screen only opens and closes it.
 *
 * The links themselves: CDXC:Sidebar 2026-11-22 DECISION in ./links.ts.
 */

import { useEffect, useState } from 'react';

import ContextMenu, { type ContextMenuItem } from '../components/sessions/ContextMenu';
import { CopyGlyph, DotsGlyph, PencilGlyph, PlusGlyph, TrashGlyph } from '../components/sessions/icons';
import { machineShortName } from '../components/sessions/machineNotice';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { LinksCopy } from '../copy';
import { isDemoMachine } from '../demo/identity';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { useAppearance } from '../theme/useAppearance';
import { readComputerLinks } from './copyFromComputer';
import LinkDialog from './LinkDialog';
import { LinkIcon } from './linkIcons';
import { isComputerLink, linkLabel, type PhoneLink } from './links';
import { usePhoneLinksStore } from './store';

type Step = { kind: 'list' } | { kind: 'row'; id: string } | { kind: 'dialog'; id: string | null };

export type LinksSheetProps = {
  visible: boolean;
  /** The computer selected on the Sessions screen: where a new loopback link opens, and what Copy reads. */
  machine: MachineRecord | null;
  onClose: () => void;
  /** Open `url` in the Web Preview; `machineId` is the computer a loopback address opens on ('' for none). */
  onOpen: (url: string, machineId: string) => void;
};

/** The computer a link opens on: its own while it is still saved, else the selected one. */
export function linkComputer(link: PhoneLink, machines: MachineRecord[], selected: MachineRecord | null) {
  if (!isComputerLink(link.url)) return null;
  return machines.find((machine) => machine.id === link.machineId) ?? selected;
}

export default function LinksSheet({ visible, machine, onClose, onOpen }: LinksSheetProps) {
  const appearance = useAppearance();
  const iconColor = appearance.foreground;
  const links = usePhoneLinksStore((state) => state.links);
  const machines = useMachinesStore((state) => state.machines);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [status, setStatus] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void usePhoneLinksStore.getState().hydrate();
    setStep({ kind: 'list' });
    setStatus(null);
  }, [visible]);

  if (!visible) return null;

  const computerName = machine !== null ? machineShortName(machine) : null;
  const canCopy = machine !== null && !isDemoMachine(machine) && !isCloudBoxMachineId(machine.id);

  const copyFromComputer = (target: MachineRecord): void => {
    const name = machineShortName(target);
    setCopying(true);
    setStatus(LinksCopy.copying(name));
    void readComputerLinks(target).then((result) => {
      setCopying(false);
      if (result.kind === 'tooOld') setStatus(LinksCopy.tooOld(name));
      else if (result.kind === 'failed') setStatus(LinksCopy.copyFailed(name, result.message));
      else {
        const { added, updated } = usePhoneLinksStore.getState().addMany(result.links);
        setStatus(
          added > 0
            ? LinksCopy.copied(added, name)
            : updated > 0
              ? LinksCopy.updatedIcons(updated, name)
              : LinksCopy.nothingNew(name),
        );
      }
    });
  };

  if (step.kind === 'dialog') {
    const editing = step.id === null ? null : (links.find((link) => link.id === step.id) ?? null);
    return (
      <LinkDialog
        visible
        editing={editing !== null}
        initialName={editing?.name ?? ''}
        initialUrl={editing?.url ?? ''}
        initialIcon={editing?.icon}
        computerName={
          editing !== null
            ? (() => {
                const on = linkComputer(editing, machines, machine);
                return on !== null ? machineShortName(on) : computerName;
              })()
            : computerName
        }
        onSubmit={(name, url, icon) => {
          const store = usePhoneLinksStore.getState();
          // A loopback address keeps the computer it was saved for, else takes the selected one.
          const machineId = isComputerLink(url) ? (editing?.machineId ?? machine?.id) : undefined;
          if (editing !== null) store.update(editing.id, { name, url, icon, machineId });
          else store.add({ name, url, icon, machineId });
          setStatus(null);
          setStep({ kind: 'list' });
        }}
        onCancel={() => setStep({ kind: 'list' })}
      />
    );
  }

  // A row whose link has gone shows the list again.
  const link = step.kind === 'row' ? links.find((candidate) => candidate.id === step.id) : undefined;
  if (link !== undefined) {
    return (
      <ContextMenu
        visible
        title={linkLabel(link)}
        subtitle={link.url}
        items={[
          {
            kind: 'item',
            key: 'edit',
            label: LinksCopy.edit,
            icon: <PencilGlyph size={14} color={iconColor} />,
            onPress: () => setStep({ kind: 'dialog', id: link.id }),
          },
          {
            kind: 'item',
            key: 'remove',
            label: LinksCopy.remove,
            icon: <TrashGlyph size={14} color={appearance.danger} />,
            destructive: true,
            onPress: () => {
              usePhoneLinksStore.getState().remove(link.id);
              setStep({ kind: 'list' });
            },
          },
        ]}
        onClose={() => setStep({ kind: 'list' })}
      />
    );
  }

  const items: ContextMenuItem[] = [];
  if (links.length === 0) items.push({ kind: 'note', key: 'empty', label: LinksCopy.empty });
  for (const saved of links) {
    const on = linkComputer(saved, machines, machine);
    items.push({
      kind: 'item',
      key: `link-${saved.id}`,
      label: linkLabel(saved),
      suffix: on !== null ? machineShortName(on) : undefined,
      icon: <LinkIcon icon={saved.icon} url={saved.url} size={14} color={iconColor} />,
      secondary: {
        icon: <DotsGlyph size={16} color={appearance.muted} />,
        label: LinksCopy.rowOptions,
        onPress: () => setStep({ kind: 'row', id: saved.id }),
      },
      onPress: () => onOpen(saved.url, on?.id ?? ''),
    });
  }
  items.push({ kind: 'separator', key: 'sep-actions' });
  items.push({
    kind: 'item',
    key: 'add',
    label: LinksCopy.add,
    icon: <PlusGlyph size={14} color={iconColor} />,
    onPress: () => setStep({ kind: 'dialog', id: null }),
  });
  if (canCopy && machine !== null) {
    items.push({
      kind: 'item',
      key: 'copy',
      label: LinksCopy.copyFrom(machineShortName(machine)),
      icon: <CopyGlyph size={14} color={iconColor} />,
      disabled: copying,
      onPress: () => copyFromComputer(machine),
    });
  }

  return (
    <ContextMenu
      visible
      title={LinksCopy.title}
      subtitle={status ?? undefined}
      items={items}
      onClose={onClose}
    />
  );
}
