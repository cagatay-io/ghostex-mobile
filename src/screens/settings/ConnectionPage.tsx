import { Caption, SettingsScreenLayout, SettingToggle } from './SettingsControls';

export default function ConnectionPage() {
  return (
    <SettingsScreenLayout>
      <SettingToggle settingKey="autoReconnect" label="Auto-reconnect on disconnect" />
      <Caption>Reconnects when the connection to your computer drops, and reopens interrupted agent terminals.</Caption>
      <SettingToggle settingKey="tailscaleReminder" label="Tailscale reminder" />
      <Caption>
        Shows a notice on Sessions when Tailscale is off on this phone and your computer cannot be reached. It stays
        hidden while the computer answers over the local network or another VPN.
      </Caption>
    </SettingsScreenLayout>
  );
}
