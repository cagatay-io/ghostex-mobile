/**
 * Settings › Autopilot › Advanced on the phone: "Supervisor model" and "When it's at its limit",
 * each one row with its pick's agent logo and model that opens the chat's model sheet
 * (`ModelMenuSheet.tsx`). The computer projects what the sheet shows (`/api/autopilot`
 * `supervisorMenu`) and saves a pick (`supervisorPick`), server/src/server/autopilot_supervisor_menu.rs;
 * the sheet's gestures are turned into those calls here.
 *
 * CDXC:Autopilot 2026-11-26 DECISION:
 * Issue #765, user: "show the model picker we show when user is on new session, he can pick any agent and any model and any effort there". Mockup answers: Q5010 "sheet" (the phone gets one row that opens the chat's model sheet, and a second row the same way for the fallback), Q5009 "fallback row" (an "Automatic" row on top of the fallback's sheet). This supersedes the two Opus 5.5 · Medium and GPT 6.1 Sol · High choice rows.
 * SEE-ALSO: apps/desktop/src/app/window/settings_modal/tabs/autopilot/supervisor_picker.rs (the desktop's rows).
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openAgentClisScreen } from '../../agents/missingAgent';
import { AGENT_ICONS } from '../../assets/agentIcons.generated';
import { agentAccent } from '../../chat/native/composer/agentColors';
import { Glyph } from '../../chat/native/composer/icons';
import type { JsonRecord } from '../../chat/native/composer/json';
import { ModelMenuSheet } from '../../chat/native/composer/ModelMenuSheet';
import { useTranscriptTheme } from '../../chat/native/transcript/theme';
import type { UserAction } from '../../chat/rust/actions';
import { chatMachineLink } from '../../chat/rust/machine-link';
import { readRecord, writeRecord } from '../../chat/rust/storage';
import type { MachineRecord } from '../../machines/store';
import { SettingsSearchAnchor } from './search/SettingsSearchAnchor';
import { useSettingsStyles } from './SettingsControls';

const CALL_TIMEOUT_MS = 15_000;
/** The starred models the chat's sheet keeps (gx-chat-core `MODEL_FAVORITES_STORE`). */
const FAVORITES = { store: 'modelFavorites', suffix: '' } as const;

/** A pick as the computer names it (`pick_label`). */
export type SupervisorLabel = {
  agent: string;
  agentName: string;
  icon: string;
  model: string;
  effort: string | null;
  /** "Opus 5.5 · Medium", or the model alone when it has no effort. */
  label: string;
};

export type SupervisorLabels = { supervisor: SupervisorLabel; fallback: SupervisorLabel | null };

type Slot = 'supervisor' | 'fallback';
type MenuView = { tab: string | null; query: string; legacyOpen: boolean };

async function favorites(): Promise<string[]> {
  try {
    const raw = await readRecord(FAVORITES, Date.now());
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function toggleFavorite(key: string): Promise<void> {
  const list = await favorites();
  const next = list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
  await writeRecord(FAVORITES, JSON.stringify(next), Date.now());
}

export function AutopilotSupervisorRows({
  machine,
  labels,
  limit,
  onView,
  onError,
}: {
  machine: MachineRecord;
  labels: SupervisorLabels;
  /** Log lines the page asked for, which a pick's answer carries. */
  limit: number;
  /** A pick's answer: the page's new state. */
  onView: (view: unknown) => void;
  onError: (message: string) => void;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [menu, setMenu] = useState<JsonRecord | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const view = useRef<MenuView>({ tab: null, query: '', legacyOpen: false });
  /** Only the latest menu read lands. */
  const reads = useRef(0);

  const rpc = useCallback(
    async (params: Record<string, unknown>): Promise<unknown> => {
      const answer = await chatMachineLink(machine).rpc('autopilot', params, CALL_TIMEOUT_MS);
      if (answer.error !== null) throw new Error(answer.error.message);
      return answer.result;
    },
    [machine],
  );

  const params = useCallback(
    async (op: string, which: Slot) => ({
      op,
      slot: which,
      tab: view.current.tab,
      query: view.current.query,
      legacyOpen: view.current.legacyOpen,
      favorites: await favorites(),
    }),
    [],
  );

  const read = useCallback(
    async (which: Slot): Promise<boolean> => {
      const id = ++reads.current;
      try {
        const answer = (await rpc(await params('supervisorMenu', which))) as JsonRecord | null;
        if (id !== reads.current) return false;
        const next = answer?.menu;
        if (next === null || typeof next !== 'object') {
          onError('Ghostex has no model lineup yet.');
          return false;
        }
        setMenu(next as JsonRecord);
        setAutomatic(answer?.automatic === true);
        return true;
      } catch (error) {
        if (id === reads.current) onError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [rpc, params, onError],
  );

  const open = async (which: Slot): Promise<void> => {
    view.current = { tab: null, query: '', legacyOpen: false };
    // The sheet closes itself without a menu, so it opens once the first one is in.
    if (await read(which)) setSlot(which);
  };

  const close = useCallback(() => {
    setSlot(null);
    setMenu(null);
    reads.current += 1;
  }, []);

  const pick = useCallback(
    async (which: Slot, change: Record<string, unknown>, closes: boolean): Promise<void> => {
      if (closes) close();
      try {
        onView(await rpc({ ...(await params('supervisorPick', which)), ...change, limit }));
        if (!closes) await read(which);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    },
    [close, rpc, params, limit, onView, onError, read],
  );

  const dispatch = useCallback(
    (action: UserAction): void => {
      if (slot === null) return;
      const record = action as unknown as JsonRecord & { type: string };
      switch (record.type) {
        case 'modelMenuView': {
          const next = { ...view.current };
          if ('tab' in record) next.tab = typeof record.tab === 'string' ? record.tab : null;
          if (typeof record.query === 'string') next.query = record.query;
          if (typeof record.legacyOpen === 'boolean') next.legacyOpen = record.legacyOpen;
          // Another tab starts with the Legacy models shut, as on the desktop card.
          if (next.tab !== view.current.tab) next.legacyOpen = false;
          view.current = next;
          void read(slot);
          return;
        }
        case 'modelMenuPick':
          void pick(
            slot,
            { key: record.key, ...(typeof record.effort === 'string' ? { effort: record.effort } : {}) },
            true,
          );
          return;
        case 'modelMenuTrait':
          void pick(slot, { trait: { id: record.id, value: record.value } }, false);
          return;
        case 'modelMenuFavorite':
          if (typeof record.key === 'string') void toggleFavorite(record.key).then(() => read(slot));
          return;
        case 'openAgentSettings':
          close();
          openAgentClisScreen(machine.id);
          return;
        default:
          return;
      }
    },
    [slot, read, pick, close, machine.id],
  );

  return (
    <>
      <PickRow
        title="Supervisor model"
        description="The agent that wakes only for judgment calls. It runs commands without asking."
        label={labels.supervisor}
        onPress={() => void open('supervisor')}
      />
      <PickRow
        title="When it's at its limit"
        description={
          labels.fallback === null ? 'Opus 5.5 or GPT 6.1 Sol, whichever has room.' : 'Then Opus 5.5 or GPT 6.1 Sol.'
        }
        label={labels.fallback}
        onPress={() => void open('fallback')}
      />
      <ModelMenuSheet
        menu={menu}
        visible={slot !== null}
        ownProvider=""
        onClose={close}
        dispatch={dispatch}
        applyLabel="Use this model"
        header={
          slot === 'fallback' ? (
            <AutomaticRow selected={automatic} onPress={() => void pick('fallback', { automatic: true }, true)} />
          ) : undefined
        }
      />
    </>
  );
}

function PickRow({
  title,
  description,
  label,
  onPress,
}: {
  title: string;
  description: string;
  label: SupervisorLabel | null;
  onPress: () => void;
}) {
  const styles = useSettingsStyles();
  const P = useTranscriptTheme();
  const Icon = label === null ? undefined : AGENT_ICONS[label.icon];
  const value = label === null ? 'Automatic' : label.label;
  return (
    <SettingsSearchAnchor label={title}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${label === null ? value : `${label.agentName}, ${value}`}`}
        accessibilityHint={description}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={onPress}
      >
        <View style={styles.linkText}>
          <Text style={styles.linkTitle}>{title}</Text>
          <Text style={styles.linkDescription}>{description}</Text>
        </View>
        <View style={local.value}>
          {Icon !== undefined && label !== null ? <Icon size={16} color={agentAccent(label.icon, P.light)} /> : null}
          <Text style={[styles.value, local.valueText]} numberOfLines={1}>
            {value}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </SettingsSearchAnchor>
  );
}

/** The fallback sheet's first row: no pick of its own, only Opus 5.5, then GPT 6.1 Sol. */
function AutomaticRow({ selected, onPress }: { selected: boolean; onPress: () => void }) {
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel="Automatic: Opus 5.5 at medium, then GPT 6.1 Sol at high"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        local.automatic,
        { borderBottomColor: P.ink(0.08) },
        selected || pressed ? { backgroundColor: P.ink(selected ? 0.11 : 0.05) } : null,
      ]}
    >
      <View style={local.automaticText}>
        <Text style={[local.automaticTitle, { color: P.menuForeground }]}>Automatic</Text>
        <Text style={[local.automaticDetail, { color: P.ink(0.64) }]}>Opus 5.5 · Medium, then GPT 6.1 Sol · High</Text>
      </View>
      {selected ? <Glyph name="check" size={16} color={P.ink(0.64)} /> : null}
    </Pressable>
  );
}

const local = StyleSheet.create({
  value: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '45%', marginLeft: 8 },
  valueText: { flexShrink: 1 },
  automatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  automaticText: { flex: 1, gap: 2 },
  automaticTitle: { fontSize: 15, fontWeight: '600' },
  automaticDetail: { fontSize: 13 },
});
