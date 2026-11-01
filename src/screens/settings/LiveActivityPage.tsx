import { LiveActivityCopy } from '../../copy';
import { useComputersNeedingUpdate } from '../../notifications/liveActivity';
import { useSettingsStore } from '../../settings/store';
import LiveActivityPreview from './LiveActivityPreview';
import { Caption, SectionHeader, SettingsScreenLayout, SettingToggle } from './SettingsControls';

/**
 * Settings › Live Activity (the approved mockup's settings; its own page):
 * one switch, on by default (`liveActivityEnabled`). Off ends a running activity at once and starts none.
 * While a computer with agents sends no start times or attention kind, it says which Mac needs an update. iOS only
 * (pages.ts).
 */
export default function LiveActivityPage() {
  const enabled = useSettingsStore((state) => state.settings.liveActivityEnabled);
  const outdated = useComputersNeedingUpdate();
  return (
    <SettingsScreenLayout>
      <SettingToggle settingKey="liveActivityEnabled" label={LiveActivityCopy.toggle} />
      {enabled ? (
        <>
          {outdated.length > 0 ? <Caption>{LiveActivityCopy.needsUpdate(outdated)}</Caption> : null}
          <Caption>{LiveActivityCopy.onCaption}</Caption>
          <Caption>{LiveActivityCopy.freshnessCaption}</Caption>
          <SectionHeader title={LiveActivityCopy.previewTitle} />
          <LiveActivityPreview />
        </>
      ) : (
        <Caption>{LiveActivityCopy.offCaption}</Caption>
      )}
    </SettingsScreenLayout>
  );
}
