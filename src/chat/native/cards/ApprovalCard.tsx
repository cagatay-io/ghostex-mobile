/**
 * The approval card, in the tone card's approval tone: the chat core's plain-words title ("Claude
 * Code wants to run a command"), the tool and folder under it, the command, then Copy on the left
 * and Deny / Allow on the right. Port of desktop `approval.rs`; the phone has no keyboard hints.
 */

import * as Clipboard from 'expo-clipboard';
import { Text } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { str } from './json';
import { useCardText } from './primitives';
import { CommandBox, ToneButton, ToneCard, ToneDismiss, isShellTool } from './ToneCard';

/** Shown while the card's answer waits for gxserver to come back (gx-chat-core `questions/unreachable_retry.rs`). */
export const RECONNECTING_NOTE = "Reconnecting to Ghostex… your answer goes out as soon as it's back.";

export function ApprovalCard({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const cardText = useCardText();
  const { dispatch } = chat;
  const prompt = document.prompt;
  const card = document.questionCard;
  const busy = card.busy;
  const summary = str(prompt, 'summary');
  const tool = str(prompt, 'tool');
  const body =
    summary.length > 0
      ? [<CommandBox key="command" command={summary} shell={isShellTool(tool)} />]
      : [
          <Text key="ask" style={cardText.prose}>
            {card.approvalAsk || 'Allow this tool?'}
          </Text>,
        ];
  if (card.reconnecting === true) {
    body.push(
      <Text key="reconnecting" style={cardText.hint}>
        {RECONNECTING_NOTE}
      </Text>,
    );
  }
  return (
    <ToneCard
      tone="approval"
      title={card.approvalTitle || 'Approval request'}
      detail={card.approvalDetail}
      trailing={<ToneDismiss onPress={() => dispatch({ type: 'questionCancel' })} />}
      body={body}
      footerStart={
        summary.length > 0
          ? [
              <ToneButton
                key="copy"
                kind="secondary"
                icon="copy"
                label="Copy"
                onPress={() => void Clipboard.setStringAsync(summary)}
              />,
            ]
          : []
      }
      footerEnd={[
        <ToneButton
          key="deny"
          kind="secondary"
          label="Deny"
          disabled={busy}
          onPress={() => dispatch({ type: 'answer', answer: { kind: 'approval', approvalSend: '' } })}
        />,
        <ToneButton
          key="allow"
          kind="primary"
          label="Allow"
          disabled={busy}
          onPress={() => dispatch({ type: 'answer', answer: { kind: 'approval', approvalSend: '1' } })}
        />,
      ]}
    />
  );
}
