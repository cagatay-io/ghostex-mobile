import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { CommandPadCopy } from '../../copy';
import type { RootStackParamList } from '../../navigation/types';
import { SettingsSection } from './SectionBoundary';
import { Caption, LinkRow, SectionHeader, SettingsScreenLayout, SettingToggle } from './SettingsControls';

/**
 * The Befehlspad's switch (the key bar's `extraKeysToolbarVisible`, same meaning), key vibration and its nine
 * keys, then the editors whose keys fill its Keys and Agent layers (approved mockup `mockups/befehlspad`).
 */
function CommandPadSection() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <>
      <SectionHeader title={CommandPadCopy.settingsSection} />
      <SettingToggle settingKey="extraKeysToolbarVisible" label={CommandPadCopy.toggle} />
      <Caption>{CommandPadCopy.settingsCaption}</Caption>
      <SettingToggle settingKey="keyBarHapticsEnabled" label={CommandPadCopy.vibration} />
      <LinkRow
        title={CommandPadCopy.padKeys}
        description={CommandPadCopy.padKeysDescription}
        onPress={() => navigation.navigate('CommandPadKeysEditor')}
      />
      <SectionHeader title={CommandPadCopy.layersSection} />
      <LinkRow
        title={CommandPadCopy.extraKeysLayout}
        description={CommandPadCopy.extraKeysLayoutDescription}
        onPress={() => navigation.navigate('ExtraKeysEditor')}
      />
      <LinkRow
        title={CommandPadCopy.agentHotkeys}
        description={CommandPadCopy.agentHotkeysDescription}
        onPress={() => navigation.navigate('AgentHotkeysEditor')}
      />
    </>
  );
}

export default function KeyboardPage() {
  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:keyboard:command-pad">
        <CommandPadSection />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
