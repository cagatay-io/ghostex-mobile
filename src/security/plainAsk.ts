/**
 * An approval request as one plain question, as the desktop words it
 * (`packages/gx-protocol/src/plain_ask.rs` in the Ghostex repo: keep the two in step).
 *
 * CDXC:Security 2026-11-17 DECISION:
 * User, on the approval cards page (Ghostex docs/2026-11-17/approval-ux/index.html): Q3720 a card,
 * Q3721 "Big boxes" for the words, Q3722 the "Let … ?" question. One plain question naming both
 * sides ("Let m7-arch connect to M7-Desktop?"), one line on what Approve lets it do, the words to
 * check big with "Approve only if m7-arch shows the same words.", then Deny and Approve. gxserver
 * keeps writing its long sentences into `summary` and `detail` (older apps show them as they are);
 * this reads them. A request it doesn't know shows as gxserver wrote it.
 */
import type { ApprovalRequest } from './approvalPayload';

/** How gxserver ends a server link's summary (`SERVER_LINK_SUMMARY_TAIL` in plain_ask.rs). */
export const SERVER_LINK_SUMMARY_TAIL = '" link its agents with this computer through Easy Connect';

export type PlainAsk = {
  question: string;
  body: string | null;
  words: string[];
  check: string | null;
};

/** `request` as one plain question, for the computer it waits on, named `computer`. */
export function plainAsk(request: ApprovalRequest, computer: string): PlainAsk | null {
  const summary = request.summary.trim();
  switch (request.action) {
    case 'pairingApproveDevice': {
      const name = quotedName(summary);
      if (name === null) return null;
      const words = detailWords(request.detail);
      if (summary.startsWith('Pair ')) {
        return {
          question: `Add ${name} to ${computer}?`,
          body: summary.includes('signs in over SSH')
            ? `It already reads and replies on ${computer} over SSH; adding it also lets it approve asks like this one.`
            : `It can then use Ghostex on ${computer} from anywhere, and approve asks like this one.`,
          words,
          check: words.length > 0 ? 'Approve only if your phone shows the same words.' : null,
        };
      }
      // A server link (GitHub #674): gxserver ends its summary with SERVER_LINK_SUMMARY_TAIL, after
      // the computer's own quoted name, so a name can't make a plain pairing read as a link.
      if (summary.endsWith(SERVER_LINK_SUMMARY_TAIL)) {
        return {
          question: `Let ${name} link its agents with ${computer}?`,
          body: `Agents on ${name} can then start, message and read agents on ${computer}. It gets no sign-in to ${computer}.`,
          words,
          check: words.length > 0 ? `Approve only if ${name} shows the same words.` : null,
        };
      }
      return {
        question: `Let ${name} connect to ${computer}?`,
        body: `It can then open your chats and terminals on ${computer}.`,
        words,
        check: words.length > 0 ? `Approve only if ${name} shows the same words.` : null,
      };
    }
    case 'pairingShowCode':
      return {
        question: `Show ${computer}'s pairing code?`,
        body: `Someone ran ghostex computer-code on ${computer}. Approve if it was you.`,
        words: [],
        check: null,
      };
    case 'addApproverKey': {
      if (!summary.startsWith('Let ')) return null;
      const rest = summary.slice(4);
      let label: string;
      let everything: boolean;
      if (rest.includes(' show the pairing code of ')) {
        label = rest.split(' show the pairing code of ')[0];
        everything = false;
      } else if (rest.includes(' act as you on ')) {
        label = rest.split(' act as you on ')[0];
        everything = true;
      } else {
        return null;
      }
      const asker = label.replace(/\(Ghostex app\)\s*$/, '').replace(/\(approvals\)\s*$/, '').trim();
      const words = keyWords(summary);
      if (asker === '' || words.length === 0) return null;
      return {
        question: `Let ${asker} manage ${computer}?`,
        body: everything
          ? `${asker} can then do everything you can do on ${computer}.`
          : `${asker} can then show ${computer}'s pairing code and add phones and computers to it.`,
        words,
        check: `Approve only if ${asker} shows the same words.`,
      };
    }
    default:
      return null;
  }
}

function quotedName(summary: string): string | null {
  const match = summary.match(/calls itself "([^"]+)"/);
  const name = match?.[1]?.trim() ?? '';
  return name === '' ? null : name;
}

function detailWords(detail: string | undefined): string[] {
  const match = detail?.match(/three words: ([^.]+)\./);
  if (!match) return [];
  return match[1]
    .split('·')
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

function keyWords(summary: string): string[] {
  const at = summary.lastIndexOf('(key words: ');
  if (at < 0) return [];
  const rest = summary.slice(at + '(key words: '.length);
  const end = rest.indexOf(')');
  if (end < 0) return [];
  return rest
    .slice(0, end)
    .split(/\s+/)
    .filter((word) => word.length > 0);
}
