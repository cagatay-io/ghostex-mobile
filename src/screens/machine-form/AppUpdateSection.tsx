/**
 * Edit machine's Ghostex block: the version that computer runs and what its updater is doing, the
 * action (Update to <version>, Check for updates, Retry), and the "Keep this machine up to date"
 * switch, the desktop's machine dialog row (`dialog_update_section`) on the phone.
 */

import { ActivityIndicator, Switch, Text, View } from 'react-native';

import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { DownloadGlyph, RefreshGlyph } from '../../components/sessions/icons';
import { EditMachineCopy } from '../../copy';
import {
  appUpdateView,
  runAppUpdateOp,
  setAppAutoUpdate,
  useAppUpdateStore,
  type AppUpdateView,
} from '../../machines/appUpdate';
import type { MachineConnectionTarget } from '../../machines/credentials';
import { SetupPalette } from '../../theme/palette';
import { formStyles } from './styles';

const TONE_COLOR: Record<AppUpdateView['tone'], string> = {
  muted: SetupPalette.MUTED,
  warning: SetupPalette.WARN,
  success: SetupPalette.OK,
};

export default function AppUpdateSection({ machine }: { machine: MachineConnectionTarget }) {
  const update = useAppUpdateStore((state) => state.byMachineId[machine.id]);
  if (update === undefined) return null;
  const view = appUpdateView(update);
  const copy = EditMachineCopy.appUpdate;
  const line =
    [view.versionText, view.detail].filter((part): part is string => part !== null).join(' · ') ||
    (view.busy ? copy.reading : null);
  if (line === null) return null;
  const action = view.action;
  return (
    <>
      <Text style={formStyles.sectionLabel}>{copy.label}</Text>
      <View style={formStyles.rowsCard}>
        <View style={[formStyles.row, formStyles.rowFirst]}>
          {view.busy ? <ActivityIndicator size="small" color={SetupPalette.MUTED} /> : null}
          <View style={formStyles.rowMain}>
            <Text style={[formStyles.rowDetail, { color: TONE_COLOR[view.tone] }]}>{line}</Text>
          </View>
        </View>
        {action !== null ? (
          <View style={[formStyles.row, { paddingTop: 2, borderTopWidth: 0 }]}>
            <SetupButton
              small
              label={action.label}
              disabled={!action.enabled}
              icon={
                action.op === 'install' ? (
                  <DownloadGlyph size={14} color={SetupPalette.FOREGROUND} />
                ) : (
                  <RefreshGlyph size={14} color={SetupPalette.FOREGROUND} />
                )
              }
              onPress={() => runAppUpdateOp(machine, action.op)}
            />
          </View>
        ) : null}
        {view.autoUpdate !== null ? (
          <View style={formStyles.row}>
            <View style={formStyles.rowMain}>
              <Text style={formStyles.rowLabel}>{copy.autoUpdate}</Text>
              <Text style={formStyles.rowDetail}>{copy.autoUpdateDetail}</Text>
            </View>
            <Switch
              value={view.autoUpdate}
              disabled={update.busy}
              onValueChange={(enabled) => setAppAutoUpdate(machine, enabled)}
              trackColor={{ false: SetupPalette.MUTED_BG, true: SetupPalette.ACCENT }}
              thumbColor={SetupPalette.FOREGROUND}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}
