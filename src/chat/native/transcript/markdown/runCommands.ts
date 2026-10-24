/**
 * The commands a reply offers to run in a terminal, read out of the core's marked Markdown: a fence
 * whose header carries `run`, and an inline span the core wrapped in a `ghostex-run:` link.
 *
 * CDXC:SessionChat 2026-10-24 SEE-ALSO: which commands qualify and the text each runs is decided in
 * packages/gx-chat-core/src/transcript/run_command.rs; the desktop draws its buttons in
 * apps/desktop/src/app/native_chat/run_command.rs. Per the phone's long-press rule, a code block's Run
 * sits beside its copy button (`Markdown.tsx`), and the message's menu offers Copy command and Paste
 * in terminal for a message with one inline command, or Run in terminal for one with one command
 * block (`MessageActions.tsx`).
 */

import { parseMarkdown, type Block, type Inline } from './parse';

const RUN_COMMAND_HREF_PREFIX = 'ghostex-run:';

export function isRunCommandHref(href: string): boolean {
  return href.startsWith(RUN_COMMAND_HREF_PREFIX);
}

/** The command a `ghostex-run:` href carries, or null. */
export function commandFromHref(href: string): string | null {
  if (!isRunCommandHref(href)) return null;
  try {
    const command = decodeURIComponent(href.slice(RUN_COMMAND_HREF_PREFIX.length));
    return command.trim().length > 0 ? command : null;
  } catch {
    return null;
  }
}

/** A command a message holds: an inline span's (`inline`) or a code block's. */
export type MessageCommand = { command: string; inline: boolean };

function inlineCommands(inlines: readonly Inline[], out: MessageCommand[]): void {
  for (const inline of inlines) {
    if (inline.t === 'link') {
      const command = commandFromHref(inline.href);
      if (command !== null) out.push({ command, inline: true });
      else inlineCommands(inline.c, out);
    } else if (inline.t === 'strong' || inline.t === 'em' || inline.t === 'del') {
      inlineCommands(inline.c, out);
    }
  }
}

function blockCommands(blocks: readonly Block[], out: MessageCommand[]): void {
  for (const block of blocks) {
    switch (block.t) {
      case 'code':
        if (block.run !== null) out.push({ command: block.run, inline: false });
        break;
      case 'p':
      case 'h':
        inlineCommands(block.c, out);
        break;
      case 'list':
        for (const item of block.items) blockCommands(item.c, out);
        break;
      case 'quote':
      case 'alert':
        blockCommands(block.c, out);
        break;
      case 'section':
        blockCommands(block.all, out);
        break;
      case 'table':
        for (const cell of block.head) inlineCommands(cell, out);
        for (const row of block.rows) for (const cell of row) inlineCommands(cell, out);
        break;
      default:
        break;
    }
  }
}

/** Every distinct command in a message's marked Markdown, in the order they appear. */
export function messageCommands(markdown: string): MessageCommand[] {
  if (!markdown.includes('"run"') && !markdown.includes(RUN_COMMAND_HREF_PREFIX)) return [];
  const out: MessageCommand[] = [];
  blockCommands(parseMarkdown(markdown), out);
  const seen = new Set<string>();
  return out.filter((entry) => !seen.has(entry.command) && seen.add(entry.command) !== undefined);
}
