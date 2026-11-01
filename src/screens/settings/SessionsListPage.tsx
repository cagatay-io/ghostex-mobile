import { useSettingsStore, type SessionsListLayout } from '../../settings/store';
import { SettingsSection } from './SectionBoundary';
import { Caption, SectionHeader, SegmentedRow, SettingsScreenLayout, ToggleRow } from './SettingsControls';

const LAYOUT_OPTIONS: { value: SessionsListLayout; label: string }[] = [
  { value: 'unified', label: 'Unified' },
  { value: 'project', label: 'Project' },
];

/**
 * Settings › Sessions list: the phone's own layout, apart from the computer's Sidebar setting
 * (`sessionsListLayout` in settings/store.ts holds the user's decision).
 */
export default function SessionsListPage() {
  const layout = useSettingsStore((state) => state.settings.sessionsListLayout) ?? 'project';
  const groupByProject = useSettingsStore((state) => state.settings.sessionsListGroupByProject);
  const workingSection = useSettingsStore((state) => state.settings.sessionsListWorkingSection);
  const setSetting = useSettingsStore((state) => state.setSetting);

  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:sessions-list:layout">
        <SectionHeader title="Sessions list" />
        <SegmentedRow
          label="Sessions list layout"
          options={LAYOUT_OPTIONS}
          value={layout}
          onChange={(next) => setSetting('sessionsListLayout', next)}
        />
        <Caption>
          {layout === 'unified'
            ? "Every computer's sessions in one list. The filter narrows it by computer, Space or project."
            : 'One computer at a time: pick it from the tabs, and its sessions show under their projects.'}
        </Caption>
        {layout === 'unified' ? (
          <>
            <ToggleRow
              label="Group by project"
              detail="Unified only"
              value={groupByProject}
              onValueChange={(next) => setSetting('sessionsListGroupByProject', next)}
            />
            <ToggleRow
              label="Show Working section"
              detail="Unified only"
              value={workingSection}
              onValueChange={(next) => setSetting('sessionsListWorkingSection', next)}
            />
            <Caption>Working sessions fold into their own section while the switch is on.</Caption>
          </>
        ) : null}
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
