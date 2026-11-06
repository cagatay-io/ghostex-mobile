import { useMachinesStore } from '../../machines/store';
import { useSettingsSyncStore } from '../../settingsSync/settingsSync';
import { Caption, SectionHeader, SettingsScreenLayout, SettingToggle, ValueRow } from './SettingsControls';

function ago(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  if (minutes < 1440) return `Synced ${Math.floor(minutes / 60)} h ago`;
  return `Synced ${Math.floor(minutes / 1440)} d ago`;
}

export default function SyncPage() {
  const machines = useMachinesStore((state) => state.machines);
  const { lastSyncAt, refused } = useSettingsSyncStore();
  const computers = machines.filter(
    (machine) => lastSyncAt[machine.id] !== undefined || refused[machine.id] !== undefined,
  );
  return (
    <SettingsScreenLayout>
      <SettingToggle settingKey="settingsSyncThroughPhone" label="Carry settings between computers" />
      <Caption>
        Your computers keep Spaces and the settings picked in their Settings › Sync the same. This phone keeps a copy
        and passes changes on to each computer it connects to, so two computers that never connect to each other still
        match. Sign-ins and secrets never sync.
      </Caption>
      {computers.length > 0 ? <SectionHeader title="Your computers" /> : null}
      {computers.map((machine) => (
        <ValueRow
          key={machine.id}
          label={machine.name}
          value={refused[machine.id] !== undefined ? 'Removed this phone from sync' : ago(lastSyncAt[machine.id] ?? 0)}
        />
      ))}
    </SettingsScreenLayout>
  );
}
