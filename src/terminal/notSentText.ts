/**
 * Texts that the not-sent sign names (`notSentKeys.ts`): the pad's text editor's draft and an upload's link. On iOS
 * the terminal is told what the text is; while its link is replaced it counts the text on the sign, never sends it
 * (not later either) and rejects. Android's sendText takes no such argument and shows no sign.
 */

import { Platform } from 'react-native';

import { GhostexNative, type SentText } from '../../modules/ghostex-native/src';
import { useTerminalStore } from './sessions';

/** Sends `text` into `sessionKey`'s terminal; false when it was not sent (no terminal, or on iOS no link). */
export async function sendNamedText(sessionKey: string, text: string, sent: SentText): Promise<boolean> {
  try {
    await (Platform.OS === 'ios'
      ? GhostexNative.sendText(sessionKey, text, sent)
      : GhostexNative.sendText(sessionKey, text));
    return true;
  } catch {
    return false;
  }
}

/**
 * The text editor's Send with a draft: the draft goes once the terminal took it, unless more was typed meanwhile; a
 * draft that was not sent stays for the next Send. True when it was sent.
 */
export async function sendTextEditorDraft(sessionKey: string, draft: string): Promise<boolean> {
  if (!(await sendNamedText(sessionKey, draft, { kind: 'text' }))) return false;
  const store = useTerminalStore.getState();
  if ((store.textEditorDraftBySessionKey[sessionKey] ?? '') === draft) store.setTextEditorDraft(sessionKey, '');
  return true;
}
