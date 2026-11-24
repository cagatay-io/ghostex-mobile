/**
 * Texts that the not-sent sign names (`notSentKeys.ts`): the pad's text editor's draft and an upload's link. On iOS
 * the terminal is told what the text is; while its link is replaced it counts the text on the sign, never sends it
 * (not later either) and rejects. Android's sendText takes no such argument and shows no sign, so there both behave as
 * before: the editor empties its draft at once, and an upload whose link fails fails as a whole.
 */

import { Platform } from 'react-native';

import { GhostexNative, type SentText } from '../../modules/ghostex-native/src';
import { useTerminalStore } from './sessions';

/** Sessions whose editor Send waits for the terminal's answer: a second tap meanwhile sends nothing. */
const sending = new Set<string>();

// Android: a failed call means the terminal entry closed or failed; the terminal's state overlay shows that.
const ignoreClosedTerminal = (): void => undefined;

/** True when native `sendText` rejected because the terminal is missing or has no live link. */
function isNotConnectedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'E_NOT_CONNECTED';
}

/**
 * Sends `text` into `sessionKey`'s terminal. iOS: false when it was not sent (`E_NOT_CONNECTED`: no terminal, or no
 * link); unexpected errors rethrow. Android: the call as before, its rejection reaching the caller.
 */
export async function sendNamedText(sessionKey: string, text: string, sent: SentText): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    await GhostexNative.sendText(sessionKey, text);
    return true;
  }
  try {
    await GhostexNative.sendText(sessionKey, text, sent);
    return true;
  } catch (error) {
    if (isNotConnectedError(error)) return false;
    throw error;
  }
}

/**
 * The text editor's Send with a draft (iOS): the draft goes once the terminal took it, unless more was typed meanwhile;
 * a draft that was not sent stays for the next Send; a tap while the previous Send waits sends nothing. True when this
 * call sent it. Android: the draft goes at once, as before.
 */
export async function sendTextEditorDraft(sessionKey: string, draft: string): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    void GhostexNative.sendText(sessionKey, draft).catch(ignoreClosedTerminal);
    useTerminalStore.getState().setTextEditorDraft(sessionKey, '');
    return true;
  }
  if (sending.has(sessionKey)) return false;
  sending.add(sessionKey);
  try {
    if (!(await sendNamedText(sessionKey, draft, { kind: 'text' }))) return false;
  } finally {
    sending.delete(sessionKey);
  }
  const store = useTerminalStore.getState();
  if ((store.textEditorDraftBySessionKey[sessionKey] ?? '') === draft) store.setTextEditorDraft(sessionKey, '');
  return true;
}
