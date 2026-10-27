/**
 * The id a chart's card is flashed by when the ? pill's list jumps to it: its block's source,
 * trimmed, hashed (FNV-1a, 32 bits over the UTF-8 bytes). The same as gx-chat-core's
 * `questions/content.rs` `chart_id`, which names the row; change them together.
 */
export function chartId(source: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(source.trim())) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `chart-${hash.toString(16).padStart(8, '0')}`;
}
