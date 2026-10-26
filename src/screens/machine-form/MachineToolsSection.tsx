/**
 * Edit machine's Agent CLIs and Skills and tools: what that computer has installed, read and
 * installed through its own Ghostex (src/machines/machineTools.ts), the desktop's Settings > Agents
 * and Integrations with that machine picked.
 */

import { ActivityIndicator, Text, View } from 'react-native';

import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { DownloadGlyph, RefreshGlyph } from '../../components/sessions/icons';
import { EditMachineCopy } from '../../copy';
import type { MachineConnectionTarget } from '../../machines/credentials';
import {
  agentCliRow,
  DESKTOP_CONTROL_TOOL_IDS,
  refreshMachineTools,
  runRowAction,
  skillRow,
  TOO_OLD_MESSAGE,
  toolRow,
  useMachineToolsStore,
  type MachineTools,
  type RowTone,
  type ToolRowView,
} from '../../machines/machineTools';
import { SetupPalette } from '../../theme/palette';
import { formStyles } from './styles';

const TONE_COLOR: Record<RowTone, string> = {
  muted: SetupPalette.MUTED,
  warning: SetupPalette.WARN,
  success: SetupPalette.OK,
};

function Row({
  machine,
  row,
  first,
  tools,
}: {
  machine: MachineConnectionTarget;
  row: ToolRowView;
  first: boolean;
  tools: MachineTools;
}) {
  const starting = tools.starting[row.key] === true;
  const failed = tools.failed[row.key];
  const action = row.action;
  return (
    <View style={[formStyles.row, first ? formStyles.rowFirst : null]}>
      <View style={formStyles.rowMain}>
        <Text style={formStyles.rowLabel}>{row.title}</Text>
        <Text style={[formStyles.rowDetail, { color: TONE_COLOR[failed ? 'warning' : row.tone] }]}>
          {failed ?? row.detail}
        </Text>
      </View>
      {row.busy ? <ActivityIndicator size="small" color={SetupPalette.MUTED} /> : null}
      {action !== null ? (
        <SetupButton
          small
          label={action.label}
          busy={starting}
          icon={
            action.operation === 'update' ? (
              <RefreshGlyph size={14} color={SetupPalette.FOREGROUND} />
            ) : action.operation === 'uninstallSkill' ? undefined : (
              <DownloadGlyph size={14} color={SetupPalette.FOREGROUND} />
            )
          }
          onPress={() => void runRowAction(machine, row.key, action)}
        />
      ) : null}
    </View>
  );
}

function Card({
  machine,
  tools,
  heading,
  rows,
}: {
  machine: MachineConnectionTarget;
  tools: MachineTools;
  heading?: string;
  rows: ToolRowView[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      {heading !== undefined ? <Text style={formStyles.fieldHint}>{heading}</Text> : null}
      <View style={formStyles.rowsCard}>
        {rows.map((row, index) => (
          <Row key={row.key} machine={machine} row={row} first={index === 0} tools={tools} />
        ))}
      </View>
    </>
  );
}

function Notice({ text, busy, onRetry }: { text: string; busy: boolean; onRetry?: () => void }) {
  return (
    <View style={formStyles.rowsCard}>
      <View style={[formStyles.row, formStyles.rowFirst]}>
        {busy ? <ActivityIndicator size="small" color={SetupPalette.MUTED} /> : null}
        <View style={formStyles.rowMain}>
          <Text style={formStyles.rowDetail}>{text}</Text>
        </View>
        {onRetry !== undefined ? (
          <SetupButton small label={EditMachineCopy.machineTools.retry} disabled={busy} onPress={onRetry} />
        ) : null}
      </View>
    </View>
  );
}

export default function MachineToolsSection({
  machine,
  reachable,
}: {
  machine: MachineConnectionTarget;
  reachable: boolean;
}) {
  const tools = useMachineToolsStore((state) => state.byMachineId[machine.id]);
  const copy = EditMachineCopy.machineTools;
  if (!reachable) {
    return (
      <>
        <Text style={formStyles.sectionLabel}>{copy.agentsLabel}</Text>
        <Notice text={copy.notConnected} busy={false} />
      </>
    );
  }
  const reading = tools?.reading ?? true;
  const retry = () => void refreshMachineTools(machine);
  const agents = tools?.agents;
  const integrations = tools?.integrations;
  const managed = tools?.tools;
  const allTools = managed?.data ?? [];
  const desktopRows = DESKTOP_CONTROL_TOOL_IDS.flatMap((id) => allTools.filter((tool) => tool.id === id)).map(toolRow);
  const toolRows = allTools
    .filter(
      (tool) => tool.supported === true && tool.id !== 'powershell' && !DESKTOP_CONTROL_TOOL_IDS.includes(tool.id),
    )
    .map(toolRow);
  const cli = integrations?.data?.ghostexCli;
  const cliRow: ToolRowView | null =
    cli === undefined
      ? null
      : {
          key: 'cli',
          title: copy.ghostexCli,
          detail: cli.installed === true && cli.path ? copy.cliFound(cli.path) : copy.cliMissing,
          tone: cli.installed === true ? 'success' : 'warning',
          busy: false,
          action: null,
        };
  // Skills Settings doesn't list (no catalog name) stay off the phone too.
  const skillRows = (integrations?.data?.skills ?? []).filter((skill) => (skill.name ?? '') !== '').map(skillRow);
  return (
    <>
      <Text style={formStyles.sectionLabel}>{copy.agentsLabel}</Text>
      {tools === undefined || (agents?.data == null && agents?.error == null) ? (
        <Notice text={copy.reading} busy />
      ) : agents?.error != null ? (
        <Notice text={agents.error} busy={reading} onRetry={retry} />
      ) : (
        <Card machine={machine} tools={tools} rows={(agents?.data ?? []).map(agentCliRow)} />
      )}
      <Text style={formStyles.sectionLabel}>{copy.toolsLabel}</Text>
      {tools === undefined || (integrations?.data == null && integrations?.error == null) ? (
        <Notice text={copy.reading} busy />
      ) : (
        <>
          {integrations?.error != null ? (
            <Notice text={integrations.error} busy={reading} onRetry={retry} />
          ) : (
            <>
              {cliRow !== null ? <Card machine={machine} tools={tools} rows={[cliRow]} /> : null}
              <Card machine={machine} tools={tools} heading={copy.skills} rows={skillRows} />
            </>
          )}
          {managed?.error != null ? (
            <Notice text={managed.error} busy={reading} onRetry={retry} />
          ) : (
            <>
              {desktopRows.length === 0 && managed?.data != null ? (
                // A Ghostex from before Desktop control could be installed from another device.
                <>
                  <Text style={formStyles.fieldHint}>{copy.desktopControl}</Text>
                  <Notice text={TOO_OLD_MESSAGE} busy={false} />
                </>
              ) : (
                <Card machine={machine} tools={tools} heading={copy.desktopControl} rows={desktopRows} />
              )}
              <Card machine={machine} tools={tools} heading={copy.tools} rows={toolRows} />
            </>
          )}
        </>
      )}
    </>
  );
}
