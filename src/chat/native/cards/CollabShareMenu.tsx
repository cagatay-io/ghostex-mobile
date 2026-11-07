/**
 * The phone's Share sheet (Ghostex Collab), opened from the chat's Share pill: the chat's link and
 * code with Copy and Share, what guest messages do (Send, Ask me, View only), who is watching with
 * Remove, when the link ends, and Stop sharing. Before the chat is shared it offers Create link, and
 * while Ghostex Collab is off on that computer, its switch. Read from and saved to that computer's
 * `/api/collab` (server/src/server/collab_http.rs). Port of desktop `window/collab_share.rs`.
 *
 * CDXC:Collab 2026-11-07 DECISION: User (Q1616): the phone is "full (share, approve messages, Stop sharing, see viewers)", starting a share included.
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import { chatMachineLink } from '../../rust/machine-link';
import type { RustChat } from '../../rust/useRustChat';
import { obj, str } from './json';
import { ToneButton } from './ToneCard';
import { themedStyles } from '../transcript/theme';

const CALL_TIMEOUT_MS = 15_000;
const MODES = [
  { value: 'send', label: 'Send' },
  { value: 'approve', label: 'Ask me' },
  { value: 'view', label: 'View only' },
] as const;

type Share_ = {
  shareId: string;
  projectId: string;
  sessionId: string;
  link: string;
  code: string;
  mode: string;
  expiresAtMs: number | null;
  viewers: { id: string; name: string }[];
};

type View_ = {
  config: { enabled: boolean; mode: string; requireCode: boolean };
  relayConnected: boolean;
  shares: Share_[];
};

function endsLabel(at: number | null): string {
  if (at === null) return 'The link works until you stop sharing';
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60_000));
  if (minutes < 60) return `The link ends in ${minutes} min`;
  if (minutes < 2880) return `The link ends in ${Math.round(minutes / 60)} h`;
  return `The link ends in ${Math.round(minutes / 1440)} days`;
}

export function CollabShareMenu({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const styles = useStyles();
  const collab = obj(document.collab);
  const projectId = collab ? str(collab, 'projectId') : '';
  const sessionId = collab ? str(collab, 'sessionId') : '';
  const machine = chat.machine;
  const [view, setView] = useState<View_ | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const send = useCallback(
    async (params: Record<string, unknown>) => {
      if (machine === null) return;
      const write = params.op !== 'read';
      if (write) setBusy(true);
      try {
        const answer = await chatMachineLink(machine).rpc('collab', params, CALL_TIMEOUT_MS);
        if (answer.error !== null) {
          setError(
            /unknown|no gxserver endpoint/i.test(answer.error.message)
              ? 'Update Ghostex on this computer to share chats from your phone.'
              : answer.error.message,
          );
          return;
        }
        setError(null);
        const result = answer.result as Record<string, unknown>;
        if (result.share !== undefined) {
          void send({ op: 'read' });
          return;
        }
        setView(result as unknown as View_);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Couldn't reach Ghostex on your computer.");
      } finally {
        if (write) setBusy(false);
      }
    },
    [machine],
  );

  useEffect(() => {
    void send({ op: 'read' });
    const timer = setInterval(() => void send({ op: 'read' }), 3_000);
    return () => clearInterval(timer);
  }, [send]);

  const copy = (what: string, text: string) => {
    void Clipboard.setStringAsync(text);
    setCopied(what);
    setTimeout(() => setCopied((current) => (current === what ? null : current)), 1600);
  };

  if (view === null) {
    return <Text style={styles.note}>{error ?? 'Reading Ghostex Collab…'}</Text>;
  }
  const share = view.shares.find((entry) => entry.projectId === projectId && entry.sessionId === sessionId);
  if (!view.config.enabled) {
    return (
      <View style={styles.menu}>
        <Text style={styles.note}>
          Ghostex Collab is off on this computer. Turn it on to share a chat through a link that opens it in any
          browser, with no app or account.
        </Text>
        <View style={styles.actions}>
          <ToneButton
            kind="primary"
            label="Turn on Ghostex Collab"
            disabled={busy}
            onPress={() => void send({ op: 'set', patch: { enabled: true } })}
          />
        </View>
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
  if (share === undefined) {
    const mode = view.config.mode;
    return (
      <View style={styles.menu}>
        <Text style={styles.note}>
          {`Anyone you send the link to can follow this chat live in their browser. ${
            mode === 'send'
              ? 'Their messages go straight to the agent.'
              : mode === 'view'
                ? 'They can watch, but not write.'
                : 'You approve each message they send.'
          }${view.config.requireCode ? ' They also type a six-digit code you give them.' : ''}`}
        </Text>
        <View style={styles.actions}>
          <ToneButton
            kind="primary"
            label="Create link"
            disabled={busy || projectId.length === 0}
            onPress={() => void send({ op: 'share', projectId, sessionId })}
          />
        </View>
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
  const code = share.code.length === 6 ? `${share.code.slice(0, 3)} ${share.code.slice(3)}` : share.code;
  return (
    <View style={styles.menu}>
      <Text style={styles.status}>{view.relayConnected ? 'Live' : 'Connecting to the share relay…'}</Text>
      <Text style={styles.label}>Link</Text>
      <Text selectable numberOfLines={2} style={styles.link}>
        {share.link}
      </Text>
      <View style={styles.actions}>
        <ToneButton
          kind="secondary"
          label={copied === 'link' ? 'Copied' : 'Copy link'}
          onPress={() => copy('link', share.link)}
        />
        <ToneButton
          kind="secondary"
          label="Share"
          onPress={() =>
            void Share.share({
              message: share.code.length > 0 ? `${share.link}\nCode: ${share.code}` : share.link,
            })
          }
        />
      </View>
      {share.code.length > 0 ? (
        <>
          <Text style={styles.label}>Code</Text>
          <View style={styles.row}>
            <Text selectable style={styles.code}>
              {code}
            </Text>
            <ToneButton
              kind="secondary"
              label={copied === 'code' ? 'Copied' : 'Copy'}
              onPress={() => copy('code', share.code)}
            />
          </View>
        </>
      ) : null}
      <Text style={styles.label}>Guest messages</Text>
      <View accessibilityRole="radiogroup" style={styles.segments}>
        {MODES.map((option) => {
          const selected = option.value === share.mode;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => void send({ op: 'setMode', shareId: share.shareId, mode: option.value })}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Watching</Text>
      {share.viewers.length === 0 ? <Text style={styles.note}>Nobody yet</Text> : null}
      {share.viewers.map((viewer) => (
        <View key={viewer.id} style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.name} numberOfLines={1}>
            {viewer.name}
          </Text>
          <ToneButton
            kind="secondary"
            label="Remove"
            onPress={() => void send({ op: 'removeViewer', shareId: share.shareId, viewerId: viewer.id })}
          />
        </View>
      ))}
      <View style={[styles.row, styles.footer]}>
        <Text style={styles.ends}>{endsLabel(share.expiresAtMs)}</Text>
        <ToneButton
          kind="secondary"
          label="Stop sharing"
          disabled={busy}
          onPress={() => void send({ op: 'stop', shareId: share.shareId })}
        />
      </View>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  menu: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  note: { color: P.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 4 },
  status: { color: P.muted, fontSize: 12 },
  label: { color: P.muted, fontSize: 12, marginTop: 6 },
  link: { color: P.foreground, fontSize: 13 },
  code: { flex: 1, color: P.foreground, fontSize: 20, fontWeight: '600', letterSpacing: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  segments: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.inputBorder,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 6 },
  segmentSelected: { backgroundColor: P.selectedFill, borderWidth: 1, borderColor: P.selectedBorder },
  segmentText: { color: P.muted, fontSize: 13 },
  segmentTextSelected: { color: P.foreground, fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  name: { flex: 1, color: P.foreground, fontSize: 14 },
  footer: { marginTop: 8, justifyContent: 'space-between' },
  ends: { flex: 1, color: P.muted, fontSize: 12 },
  error: { color: '#ef9999', fontSize: 12.5 },
}));
