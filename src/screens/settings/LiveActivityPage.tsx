import { LiveActivityCopy } from '../../copy';
import { useComputersNeedingUpdate } from '../../notifications/liveActivity';
import { useSettingsStore } from '../../settings/store';
import LiveActivityPreview from './LiveActivityPreview';
import { Caption, SectionHeader, SettingsScreenLayout, SettingToggle } from './SettingsControls';

/**
 * Settings › Live Activity (REQ-LIVEACT-005, mockups/live-activity "Einstellungen"; its own page, D-037 item 3):
 * one switch, on by default (`liveActivityEnabled`). Off ends a running activity at once and starts none.
 * While a computer with agents lacks host changes H1a and H1b, it says which Mac needs an update (D-063,
 * REQ-LIVEACT-004). iOS only (pages.ts).
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
