/**
 * Whether chat box text looks like it holds a key, token or password, so Send asks once more before it goes into the
 * chat. A line-for-line copy of the chat core's rule (`packages/gx-chat-core/src/composer/secret_like.rs`, where the
 * CDXC:Secrets 2026-11-19 DECISION is); change both together.
 *
 * CDXC:Secrets 2026-11-19 WHY:
 * Send decides at once, before the field empties (`ComposerModel.submit`), and the phone reaches the core only through
 * its hidden page, a moment later; asking it there would let a key pasted and sent at once slip past the warning.
 */

/** Known key and token prefixes, each with the shortest body that follows it in a real key. */
const PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ['sk-ant-', 20],
  ['sk-', 20],
  ['sk_live_', 16],
  ['sk_test_', 16],
  ['rk_live_', 16],
  ['lin_api_', 20],
  ['lin_oauth_', 20],
  ['ghp_', 20],
  ['gho_', 20],
  ['ghu_', 20],
  ['ghs_', 20],
  ['ghr_', 20],
  ['github_pat_', 20],
  ['glpat-', 16],
  ['xoxb-', 10],
  ['xoxp-', 10],
  ['xoxa-', 10],
  ['xoxr-', 10],
  ['xoxs-', 10],
  ['xapp-', 10],
  ['npm_', 30],
  ['hf_', 30],
  ['AIza', 30],
  ['gxs_', 20],
];

export function looksLikeSecret(text: string): boolean {
  if (text.includes('PRIVATE KEY-----')) return true;
  return tokens(text).some((token) => knownPrefix(token) || awsKeyId(token) || randomToken(token));
}

/** The words of `text`, split at whitespace, quotes, brackets and the `=`/`:` of `KEY=value`. */
function tokens(text: string): string[] {
  return text.split(/[\s"'`=:,;()[\]{}<>]+/).filter((token) => token.length > 0);
}

function knownPrefix(token: string): boolean {
  return PREFIXES.some(([prefix, body]) => {
    if (!token.startsWith(prefix)) return false;
    const rest = token.slice(prefix.length);
    const run = /^[A-Za-z0-9_-]*/.exec(rest)?.[0].length ?? 0;
    return run >= body && /[0-9]/.test(rest);
  });
}

/** An AWS access key id: `AKIA` or `ASIA` and 16 upper-case letters or digits. */
function awsKeyId(token: string): boolean {
  return /^(AKIA|ASIA)[A-Z0-9]{16}/.test(token);
}

/**
 * A long run of letters, digits and `_-+/=` with upper case, lower case and digits mixed and little repetition. Hex
 * (commit ids, hashes, UUIDs) has no upper case and paths have a `/` between words, so neither counts.
 */
function randomToken(raw: string): boolean {
  const token = raw.replace(/[.!?]+$/, '');
  if (
    token.length < 32 ||
    token.includes('//') ||
    token.startsWith('/') ||
    token.startsWith('~') ||
    !/^[A-Za-z0-9_+/.-]+$/.test(token)
  ) {
    return false;
  }
  const count = (pattern: RegExp) => (token.match(pattern) ?? []).length;
  const longestRun = Math.max(...token.split(/[/.]/).map((part) => part.length));
  return (
    count(/[A-Z]/g) >= 2 && count(/[a-z]/g) >= 2 && count(/[0-9]/g) >= 2 && longestRun >= 24 && entropy(token) >= 4.0
  );
}

/** Shannon entropy of `token`'s characters, in bits per character. */
function entropy(token: string): number {
  const counts = new Map<string, number>();
  for (const c of token) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / token.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
