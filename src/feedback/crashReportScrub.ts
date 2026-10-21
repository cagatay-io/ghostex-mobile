/**
 * Strips the obvious personal data out of a crash report on the phone itself, before the user sees
 * it in Send Bug / Feedback or anything is posted, so a report is clean even with no computer
 * connected.
 *
 * CDXC:Feedback 2026-10-21 WHY:
 * The phone applies the feedback agent's privacy rule (`feedback_agent_prompt` step 5 in
 * server/src/feedback/agent.rs: no tokens, keys, passwords, cookies, email addresses or account
 * names, home paths shortened to ~) mechanically; when a computer is connected and the user starts
 * the agent, the agent cleans the already-scrubbed text again. Values the phone knows are private
 * (the saved computers' names, addresses and SSH usernames) are replaced wherever they appear.
 */

/** Words the phone knows are private, e.g. saved computer names, hosts and SSH usernames. */
export type ScrubTerms = readonly string[];

/** File types a stack names after an `@`, which are not email domains. */
const CODE_FILE_EXTENSIONS = new Set([
  'bundle',
  'js',
  'jsx',
  'mjs',
  'ts',
  'tsx',
  'hbc',
  'kt',
  'java',
  'swift',
  'mm',
  'so',
]);

const REPLACEMENTS: readonly [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  // Private keys and long secrets first, before shorter patterns cut them up.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '<private key>'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<token>'],
  [
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    '<token>',
  ],
  // `Authorization: Bearer x`, `token=x`, `"password": "x"`, `api_key: x`.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 <token>'],
  [
    /\b([A-Za-z]*[_-]?(?:token|key|secret|password|passwd|pwd|cookie|authorization|credential)s?)(["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi,
    '$1$2<redacted>',
  ],
  // Credentials inside URLs: scheme://user:pass@host.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1<user>@'],
  // Home folders: macOS, Linux, Windows, and iOS app containers.
  [/\/(?:Users|home)\/[^/\s:'"`)]+/g, '~'],
  [/\b[A-Za-z]:\\Users\\[^\\\s:'"`)]+/g, '~'],
  [
    /(?:\/private)?\/var\/mobile\/Containers\/(?:Data|Bundle|Shared\/AppGroup)\/(?:Application\/)?[0-9A-F-]{36}/gi,
    '<app>',
  ],
  // Email addresses, but not a JavaScript stack's `function@file.bundle:1:2`.
  [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,})\b(?![\w-]|\.\w|:\d)/g,
    (match, tld) => (CODE_FILE_EXTENSIONS.has(tld.toLowerCase()) ? match : '<email>'),
  ],
  // Local and Tailscale host names carry machine and tailnet names.
  [
    /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:local|lan|home|internal|localdomain|ts\.net|beta\.tailscale\.net)\b(?![\w-]|\.\w)/gi,
    '<host>',
  ],
  // IPv4 addresses, except loopback and the unspecified address.
  [
    /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g,
    (match) => (match.startsWith('127.') || match === '0.0.0.0' ? match : '<ip>'),
  ],
  // IPv6 addresses (at least three colons, or a `::` with a digit), never `HH:MM:SS` times.
  [
    /(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}(?![\w:])|(?<![\w:])(?=[0-9A-Fa-f:]*\d)(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5})?(?![\w:])/g,
    (match) => (match === '::1' ? match : '<ip>'),
  ],
  // `user@` in front of a host or address that was just replaced (`ssh madda@<host>`).
  [/\b[A-Za-z0-9._-]+@(?=<(?:host|ip|private)>)/g, '<user>@'],
  // Any other long, key-like run of letters and digits (32+ characters, mixed case or base64).
  [
    /\b(?=[A-Za-z0-9+/_-]{32,})(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g,
    (match) => (/^[0-9a-f]{32,}$/i.test(match) && match.length <= 40 ? match : '<redacted>'),
  ],
];

const PLACEHOLDER_WORDS = new Set([
  'private',
  'redacted',
  'token',
  'email',
  'host',
  'user',
  'app',
  'private key',
  'cut',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `text` with the obvious personal data replaced by placeholders such as `<email>` and `~`. */
export function scrubPersonalData(text: string, terms: ScrubTerms = []): string {
  let result = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result =
      typeof replacement === 'string' ? result.replace(pattern, replacement) : result.replace(pattern, replacement);
  }
  // Then the words the phone knows are private, longest first, so a host name goes before the user
  // name inside it; never a placeholder's own word, which would break `<host>` and the like.
  const words = [...new Set(terms.map((term) => term.trim()))]
    .filter((term) => term.length >= 3 && !PLACEHOLDER_WORDS.has(term.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    result = result.replace(new RegExp(`(?<![A-Za-z0-9<])${escapeRegExp(word)}(?![A-Za-z0-9>])`, 'gi'), '<private>');
  }
  return result.replace(/\b[A-Za-z0-9._-]+@(?=<private>)/g, '<user>@');
}
