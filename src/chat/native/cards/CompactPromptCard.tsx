/**
 * The Ask-on-Enter compact-before-sending card above the composer.
 *
 * CDXC:SessionChat 2026-11-22 DECISION:
 * User (Q4396, "ask on enter", Q4452 "Build on phone"): when sending on a long chat whose prompt
 * cache has expired, hold the first Send and show a card above the chat box explaining that
 * compacting first saves usage, with:
 * - Primary: "Compact, then send"
 * - Secondary: "Send now" (or tapping Send again)
 * - Two "Don't ask again" options: "This chat" (this chat only) and "Always" (saves
 *   `offerCompactBeforeSending: false` on the connected computer via `disableOfferCompactBeforeSending`).
 *
 * Eligibility and card state live in `packages/gx-chat-core/src/composer/compact_prompt.rs` so
 * desktop, web and phone share the exact rule. Port of desktop `native_chat/compact_prompt.rs`.
 */

import { useEffect } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { CompactBeforeSendOffer } from '../../rust/document';
import type { RustChatHost } from '../../rust/host';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { ToneButton, ToneCard, ToneDismiss } from './ToneCard';

const DEFAULT_TITLE = 'Compact this chat first?';
const DEFAULT_DETAIL =
  'This chat is long and its prompt cache has expired. Compacting first shrinks it before sending, which saves usage.';

function formatSubtitle(tokensLabel: string, idleLabel: string): string {
  if (tokensLabel.length > 0 && idleLabel.length > 0) return `${tokensLabel} tokens · idle ${idleLabel}`;
  if (tokensLabel.length > 0) return `${tokensLabel} tokens · cache expired`;
  if (idleLabel.length > 0) return `Idle ${idleLabel} · cache expired`;
  return 'Prompt cache expired';
}

export function CompactPromptCard({
  offer,
  composer,
  dispatch,
}: {
  offer: CompactBeforeSendOffer | null | undefined;
  composer: RustChatHost['composerInput'];
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const open = offer !== null && offer !== undefined && offer.open === true;

  // Android hardware Back closes an open compact prompt instead of leaving the chat.
  useEffect(() => {
    if (!open || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      composer.dismissCompactPrompt();
      return true;
    });
    return () => subscription.remove();
  }, [composer, open]);

  if (!open || offer === null || offer === undefined) return null;

  const title = offer.title.trim().length > 0 ? offer.title : DEFAULT_TITLE;
  const detail = offer.detail.trim().length > 0 ? offer.detail : DEFAULT_DETAIL;
  const subtitle = formatSubtitle(offer.tokensLabel?.trim() ?? '', offer.idleLabel?.trim() ?? '');

  const onClose = () => {
    composer.dismissCompactPrompt();
  };

  const onDismiss = (scope: 'session' | 'always') => {
    composer.clearCompactPromptGuard();
    dispatch({ type: 'compactPromptDismiss', scope });
  };

  const onSendNow = () => {
    composer.clearCompactPromptGuard();
    if (!composer.hasDraftToSend()) {
      composer.dismissCompactPrompt();
      return;
    }
    composer.submit('send', { bypassCompactPrompt: true });
  };

  const onCompactThenSend = () => {
    composer.clearCompactPromptGuard();
    if (!composer.hasDraftToSend()) {
      composer.dismissCompactPrompt();
      return;
    }
    composer.submit('compact');
  };

  const dismissOption = (label: string, scope: 'session' | 'always', hint: string) => (
    <Pressable
      key={scope}
      accessibilityRole="button"
      accessibilityLabel={`Don't ask again: ${label}`}
      accessibilityHint={hint}
      hitSlop={6}
      onPress={() => onDismiss(scope)}
      style={({ pressed }) => [styles.dismissOption, pressed && { backgroundColor: P.neutralFill }]}
    >
      {({ pressed }) => <Text style={[styles.dismissOptionText, pressed && { color: P.foreground }]}>{label}</Text>}
    </Pressable>
  );

  const dontAskControls = (
    <View key="dont-ask" style={styles.dontAskRow}>
      <Text style={styles.dontAskLabel}>Don't ask again:</Text>
      {dismissOption('This chat', 'session', 'Stop asking in this chat')}
      <Text style={styles.dontAskDot}>·</Text>
      {dismissOption('Always', 'always', 'Never ask again. Re-enable in Settings > Chat > Claude Code.')}
    </View>
  );

  return (
    <ToneCard
      tone="info"
      icon="arrows-diagonal-minimize"
      title={title}
      detail={subtitle}
      trailing={<ToneDismiss onPress={onClose} />}
      body={[
        <Text key="body" style={styles.bodyText}>
          {detail}
        </Text>,
      ]}
      footerStart={[dontAskControls]}
      footerEnd={[
        <ToneButton key="send-now" label="Send now" kind="secondary" onPress={onSendNow} />,
        <ToneButton
          key="compact-then-send"
          label="Compact, then send"
          icon="arrows-diagonal-minimize"
          kind="primary"
          onPress={onCompactThenSend}
        />,
      ]}
    />
  );
}

const useStyles = themedStyles((P) => ({
  bodyText: {
    color: P.muted,
    fontSize: 13.5,
    lineHeight: 19.5,
  },
  dontAskRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  dontAskLabel: {
    color: P.muted,
    fontSize: 12.5,
    lineHeight: 16,
    paddingRight: 2,
  },
  dismissOption: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dismissOptionText: {
    color: P.muted,
    fontSize: 12.5,
    lineHeight: 16,
  },
  dontAskDot: {
    color: P.muted,
    opacity: 0.5,
    fontSize: 12,
  },
}));
