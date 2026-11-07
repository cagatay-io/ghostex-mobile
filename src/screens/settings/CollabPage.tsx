/**
 * Settings › Collab (Ghostex Collab), for one computer: the switch, your name, what a new share
 * starts with, the chats shared now with Stop sharing, and the guest messages log. Read and saved
 * through that computer's `/api/collab` (server/src/server/collab_http.rs); a change shows at once.
 * The desktop's page is `settings_modal/tabs/collab.rs`.
 *
 * CDXC:Collab 2026-11-07 DECISION: User (Q1610, Q1616): "a page in settings called "Collab"", and the phone is "full (share, approve messages, Stop sharing, see viewers)".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { chatMachineLink } from '../../chat/rust/machine-link';
import { isMachineEnabled, machineDisplayLabel, useMachinesStore, type MachineRecord } from '../../machines/store';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import {
  Caption,
  ChoiceRow,
  LinkRow,
  SectionHeader,
  SegmentedRow,
  SettingsScreenLayout,
  ToggleRow,
  useSettingsStyles,
} from './SettingsControls';

const CALL_TIMEOUT_MS = 15_000;

type Config = {
  enabled: boolean;
  expiry: 'hour' | 'day' | 'week' | 'never';
  requireCode: boolean;
  mode: 'send' | 'approve' | 'view';
  ownerName: string;
  ownerDisplayName: string;
};

type Share_ = {
  shareId: string;
  title: string;
  expiresAtMs: number | null;
  viewers: { id: string; name: string }[];
};

type View_ = { config: Config; shares: Share_[] };

type LogEntry = {
  atMs: number;
  title: string;
  event: 'joined' | 'left' | 'removed' | 'message';
  guest: string;
  text?: string;
  images?: number;
  outcome?: string;
};

async function call(machine: MachineRecord, params: Record<string, unknown>) {
  try {
    const answer = await chatMachineLink(machine).rpc('collab', params, CALL_TIMEOUT_MS);
    if (answer.error !== null) {
      const unknown = /unknown|not a gxserver|no gxserver endpoint/i.test(answer.error.message);
      return {
        result: null,
        error: unknown
          ? 'Update Ghostex on this computer to use Ghostex Collab from your phone.'
          : answer.error.message,
      };
    }
    return { result: answer.result as Record<string, unknown>, error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "Couldn't reach Ghostex on your computer." };
  }
}

function ago(atMs: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - atMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}

function ends(at: number | null): string {
  if (at === null) return 'never ends';
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60_000));
  if (minutes < 60) return `ends in ${minutes} min`;
  if (minutes < 2880) return `ends in ${Math.round(minutes / 60)} h`;
  return `ends in ${Math.round(minutes / 1440)} days`;
}

const OUTCOMES: Record<string, string> = {
  sent: 'Went straight to the agent',
  held: 'Waited for you',
  approved: 'You sent it',
  edited: 'You edited it',
  declined: 'You declined it',
  refused: 'Not accepted',
};

export default function CollabPage() {
  const all = useMachinesStore((state) => state.machines);
  const selectedId = useMachinesStore((state) => state.selectedMachineId);
  const machines = useMemo(() => all.filter(isMachineEnabled), [all]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const machine =
    machines.find((entry) => entry.id === pickedId) ??
    machines.find((entry) => entry.id === selectedId) ??
    machines[0] ??
    null;
  const [view, setView] = useState<View_ | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (params: Record<string, unknown>) => {
      if (machine === null) return;
      const answer = await call(machine, params);
      if (answer.result !== null) {
        setView(answer.result as unknown as View_);
        setError(null);
      } else {
        setError(answer.error);
      }
    },
    [machine],
  );
  const readLog = useCallback(async () => {
    if (machine === null) return;
    const answer = await call(machine, { op: 'audit', limit: 30 });
    if (answer.result !== null) setLog((answer.result.entries as LogEntry[] | undefined) ?? []);
  }, [machine]);

  useEffect(() => {
    setView(null);
    void send({ op: 'read' });
    void readLog();
    const timer = setInterval(() => {
      void send({ op: 'read' });
      void readLog();
    }, 10_000);
    return () => clearInterval(timer);
  }, [send, readLog]);

  if (machine === null)
    return (
      <SettingsScreenLayout>
        <Caption>Connect a computer first: Ghostex Collab shares chats from your computer.</Caption>
      </SettingsScreenLayout>
    );

  const set = (patch: Partial<Config>) => {
    if (view !== null) setView({ ...view, config: { ...view.config, ...patch } });
    void send({ op: 'set', patch });
  };

  return (
    <SettingsScreenLayout intro="Share a chat through a link that opens it in any browser. Share is the pill above a chat's chat box.">
      {machines.length > 1 ? (
        <SettingsSection name="settings:collab:computer">
          <SectionHeader title="Computer" />
          {machines.map((entry) => (
            <ChoiceRow
              key={entry.id}
              label={machineDisplayLabel(entry)}
              selected={entry.id === machine.id}
              onPress={() => setPickedId(entry.id)}
            />
          ))}
        </SettingsSection>
      ) : null}
      {error !== null ? <Caption>{error}</Caption> : null}
      {view === null ? (
        error === null ? (
          <Caption>Reading Ghostex Collab…</Caption>
        ) : (
          <LinkRow title="Try again" onPress={() => void send({ op: 'read' })} />
        )
      ) : (
        <CollabBody view={view} log={log} set={set} send={send} />
      )}
    </SettingsScreenLayout>
  );
}

function CollabBody({
  view,
  log,
  set,
  send,
}: {
  view: View_;
  log: LogEntry[];
  set: (patch: Partial<Config>) => void;
  send: (params: Record<string, unknown>) => Promise<void>;
}) {
  const { config } = view;
  return (
    <>
      <SettingsSection name="settings:collab:switch">
        <SectionHeader title="Ghostex Collab" />
        <ToggleRow
          label="Ghostex Collab"
          detail={
            config.enabled
              ? 'On. Turning it off ends every share at once.'
              : 'Off: nothing can be shared and every link stops working.'
          }
          value={config.enabled}
          onValueChange={(enabled) => set({ enabled })}
        />
        <NameRow
          value={config.ownerName}
          placeholder={config.ownerDisplayName}
          onSave={(ownerName) => set({ ownerName })}
        />
      </SettingsSection>
      <SettingsSection name="settings:collab:newShares">
        <SectionHeader title="New shares start with" />
        <SegmentedRow
          label="Guest messages"
          options={[
            { value: 'send', label: 'Send' },
            { value: 'approve', label: 'Ask me' },
            { value: 'view', label: 'View only' },
          ]}
          value={config.mode}
          onChange={(mode) => set({ mode })}
        />
        <SegmentedRow
          label="Link ends after"
          options={[
            { value: 'hour', label: '1 hour' },
            { value: 'day', label: '24 hours' },
            { value: 'week', label: '7 days' },
            { value: 'never', label: 'Never' },
          ]}
          value={config.expiry}
          onChange={(expiry) => set({ expiry })}
        />
        <ToggleRow
          label="Ask for a code"
          detail="Guests also type the six-digit code from the Share sheet."
          value={config.requireCode}
          onValueChange={(requireCode) => set({ requireCode })}
        />
      </SettingsSection>
      {config.enabled ? (
        <SettingsSection name="settings:collab:shared">
          <SectionHeader title="Shared now" />
          {view.shares.length === 0 ? <Caption>No chat is shared right now.</Caption> : null}
          {view.shares.map((share) => (
            <LinkRow
              key={share.shareId}
              title={share.title}
              description={`${share.viewers.length} watching · link ${ends(share.expiresAtMs)} · Tap to stop sharing`}
              onPress={() => void send({ op: 'stop', shareId: share.shareId })}
            />
          ))}
          {view.shares.length > 1 ? <LinkRow title="Stop all" onPress={() => void send({ op: 'stopAll' })} /> : null}
        </SettingsSection>
      ) : null}
      <SettingsSection name="settings:collab:log">
        <SectionHeader title="Guest messages log" />
        {log.length === 0 ? (
          <Caption>Nothing yet. Every guest message and what you did with it shows here.</Caption>
        ) : null}
        {log.map((entry, index) => (
          <LogRow key={`${entry.atMs}-${index}`} entry={entry} />
        ))}
      </SettingsSection>
    </>
  );
}

function NameRow({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (name: string) => void;
}) {
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setText(value), [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.rowLabel}>Your name</Text>
        <TextInput
          accessibilityLabel="Your name"
          value={text}
          placeholder={placeholder}
          placeholderTextColor={appearance.muted}
          maxLength={40}
          autoCorrect={false}
          style={{ color: appearance.foreground, fontSize: 15, paddingVertical: 4 }}
          onChangeText={(next) => {
            setText(next);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => onSave(next), 700);
          }}
        />
        <Caption>What guests see for you. Empty uses this computer's user name.</Caption>
      </View>
    </View>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const styles = useSettingsStyles();
  const what =
    entry.event === 'message'
      ? (OUTCOMES[entry.outcome ?? ''] ?? 'Not accepted')
      : entry.event === 'joined'
        ? 'Joined'
        : entry.event === 'left'
          ? 'Left'
          : 'Removed and blocked';
  const title =
    entry.event === 'message'
      ? `${entry.guest}: ${entry.text && entry.text.length > 0 ? entry.text : `${entry.images ?? 0} picture(s)`}`
      : `${entry.guest} ${entry.event === 'removed' ? 'was removed' : entry.event}`;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowLabel} numberOfLines={2}>
          {title}
        </Text>
        <Caption>{`${what} · ${entry.title} · ${ago(entry.atMs)}`}</Caption>
      </View>
    </View>
  );
}
