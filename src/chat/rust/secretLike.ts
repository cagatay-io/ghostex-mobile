/**
 * Whether chat box text looks like it holds a key or token, so Send asks once more before it goes into the chat.
 * Passwords are not recognised: they look like ordinary words. A line-for-line copy of the chat core's rule
 * (`packages/gx-chat-core/src/composer/secret_like.rs`, where the CDXC:Secrets 2026-11-19 DECISION is); change both
 * together. Both are checked against `packages/gx-chat-core/tests/fixtures/secret_like.json`
 * (`packages/gx-chat-core/tests/secret_like_phone_copy.test.ts` runs this copy).
 *
 * CDXC:Secrets 2026-11-19 WHY:
 * Send decides at once, before the field empties (`ComposerModel.submit`), and the phone reaches the core only through
 * its hidden page, a moment later; asking it there would let a key pasted and sent at once slip past the warning.
 */

/**
 * Known key and token prefixes: the shortest body, whether it may hold `-` and `_` (`npm_` and `hf_` bodies are letters
 * and digits only, so `npm_package_…` variables are not keys), and whether ordinary words can follow the prefix
 * (`sk-learn-…`), so a body made of words is not a key. A prefix only keys carry skips that test: a random body
 * sometimes looks word-shaped, and about one key in ten was missed with it. `gxs_`, `gxo_` and `gxd_` are Ghostex's own
 * tokens (32 random bytes in URL-safe base64).
 */
const PREFIXES: ReadonlyArray<readonly [prefix: string, body: number, separators: boolean, words: boolean]> = [
  ['sk-ant-', 20, true, false],
  ['sk-proj-', 20, true, false],
  ['sk-', 20, true, true],
  ['sk_live_', 16, true, false],
  ['sk_test_', 16, true, false],
  ['rk_live_', 16, true, false],
  ['lin_api_', 20, true, false],
  ['lin_oauth_', 20, true, false],
  ['ghp_', 20, true, false],
  ['gho_', 20, true, false],
  ['ghu_', 20, true, false],
  ['ghs_', 20, true, false],
  ['ghr_', 20, true, false],
  ['github_pat_', 20, true, false],
  ['glpat-', 16, true, false],
  ['xoxb-', 10, true, false],
  ['xoxp-', 10, true, false],
  ['xoxa-', 10, true, false],
  ['xoxr-', 10, true, false],
  ['xoxs-', 10, true, false],
  ['xapp-', 10, true, false],
  ['npm_', 30, false, true],
  ['hf_', 30, false, false],
  ['AIza', 30, true, false],
  ['gxs_', 20, true, false],
  ['gxo_', 20, true, false],
  ['gxd_', 20, true, false],
];

export function looksLikeSecret(text: string): boolean {
  if (text.includes('PRIVATE KEY-----')) return true;
  return tokens(text).some((token) => knownPrefix(token) || awsKeyId(token) || randomToken(token));
}

/**
 * The words of `text`, split at whitespace (U+FEFF and U+0085 included, as the core's copy splits), quotes, brackets
 * and the `=`/`:` of `KEY=value`.
 */
function tokens(text: string): string[] {
  return text.split(/[\s\u0085﻿"'`=:,;()[\]{}<>]+/).filter((token) => token.length > 0);
}

function knownPrefix(token: string): boolean {
  return PREFIXES.some(([prefix, body, separators, words]) => {
    if (!token.startsWith(prefix)) return false;
    const rest = token.slice(prefix.length);
    const run = (separators ? /^[A-Za-z0-9_-]*/ : /^[A-Za-z0-9]*/).exec(rest)?.[0] ?? '';
    return run.length >= body && mixed(run) && !(words && wordShaped(run));
  });
}

/** Digits, or both upper and lower case: what a random body has and a word does not. */
function mixed(run: string): boolean {
  return /[0-9]/.test(run) || (/[A-Z]/.test(run) && /[a-z]/.test(run));
}

/** An AWS access key id: `AKIA` or `ASIA` and 16 upper-case letters or digits. */
function awsKeyId(token: string): boolean {
  return /^(AKIA|ASIA)[A-Z0-9]{16}/.test(token);
}

/**
 * A long run of letters, digits and `_-+/.` with upper case, lower case and digits mixed, little repetition, and not
 * made of words. Hex (commit ids, hashes, UUIDs) has no upper case and paths have a `/` between words, so neither
 * counts.
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
    count(/[A-Z]/g) >= 2 &&
    count(/[a-z]/g) >= 2 &&
    count(/[0-9]/g) >= 1 &&
    longestRun >= 24 &&
    entropy(token) >= 4.0 &&
    !wordShaped(token)
  );
}

/**
 * Whether at least half of `token`'s letters and digits sit in words: runs of four or more letters written as a word
 * is (`some`, `Branch`), split where camelCase starts a new word.
 */
function wordShaped(token: string): boolean {
  const alphanumeric = (token.match(/[A-Za-z0-9]/g) ?? []).length;
  if (alphanumeric === 0) return false;
  let inWords = 0;
  for (const run of token.split(/[^A-Za-z]/)) {
    for (const word of camelWords(run)) if (word.length >= 4 && wordCased(word)) inWords += word.length;
  }
  return inWords * 2 >= alphanumeric;
}

/**
 * Written as a word is: all lower case, or one capital and then lower case; and pronounceable, with a vowel and no four
 * consonants in a row, which a run of random letters often is not.
 */
function wordCased(word: string): boolean {
  return /^[A-Za-z][a-z]*$/.test(word) && /[aeiouy]/i.test(word) && !/[^aeiouy]{4}/i.test(word);
}

/**
 * A run of letters split where a new camelCase word starts: before an upper-case letter that follows a lower-case one,
 * and before the last of several upper-case letters when a lower-case one follows it (`HTTPServer` is `HTTP`, `Server`).
 */
function camelWords(run: string): string[] {
  const isLower = (c: string | undefined) => c !== undefined && c >= 'a' && c <= 'z';
  const isUpper = (c: string | undefined) => c !== undefined && c >= 'A' && c <= 'Z';
  const words: string[] = [];
  let start = 0;
  for (let i = 1; i < run.length; i++) {
    const lowerToUpper = isLower(run[i - 1]) && isUpper(run[i]);
    const acronymEnd = isUpper(run[i - 1]) && isUpper(run[i]) && isLower(run[i + 1]);
    if (lowerToUpper || acronymEnd) {
      words.push(run.slice(start, i));
      start = i;
    }
  }
  if (start < run.length) words.push(run.slice(start));
  return words;
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
