/**
 * URL translation for the Web preview.
 *
 * A preview always loads `http://127.0.0.1:<localPort>/…` on the phone, but the
 * user only ever thinks in the computer's own addresses, so every string shown
 * to them is rebuilt as `localhost:<remotePort>/…`. Both directions are pure
 * string work here; the (remotePort ↔ localPort) table itself belongs to the
 * screen that owns the live forwards.
 *
 * Parsing is done by hand rather than with `URL`, because React Native's `URL`
 * is a partial implementation that does not expose a usable `port`/`hostname`
 * split for every shape we get from `onShouldStartLoadWithRequest`.
 */

/** The phone-side address a forward listens on. */
export const LOOPBACK_HOST = '127.0.0.1';

/**
 * Hosts that mean "this machine" to a web app. `0.0.0.0` is a bind address
 * rather than a destination, but dev servers print it and pages link to it, and
 * on the computer it resolves to the same listener a forward reaches.
 */
const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  // IPv4-mapped loopback: what a dual-stack server prints for 127.0.0.1, and the
  // compressed form a WebView reports for the same address.
  '[::ffff:127.0.0.1]',
  '[::ffff:7f00:1]',
]);

/** The rest of 127.0.0.0/8 (Debian names its own host 127.0.1.1). */
const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u;

const DEFAULT_PORT_BY_SCHEME: Record<string, number> = { http: 80, https: 443 };

export type ParsedHttpUrl = {
  /** Lowercased, without the trailing colon. */
  scheme: 'http' | 'https';
  /** Lowercased host, brackets kept for IPv6 literals. */
  host: string;
  /** The scheme's default port when the URL carried none. */
  port: number;
  /** Everything from the path onwards, always starting with `/`. */
  pathAndQuery: string;
};

const HTTP_URL_PATTERN = /^(https?):\/\/([^/?#]*)([^]*)$/i;

/** Parse an absolute http(s) URL into the parts the preview needs. */
export function parseHttpUrl(url: string): ParsedHttpUrl | null {
  const match = HTTP_URL_PATTERN.exec(url.trim());
  if (match === null) return null;
  const scheme = match[1].toLowerCase() as 'http' | 'https';
  const authority = match[2];
  const rest = match[3];
  /*
   * A backslash is not a legal authority character, and WebKit and Chromium
   * disagree about whether they normalize it to "/" before or after the host
   * ends. Refusing the URL outright means neither engine can be talked into
   * treating "http://localhost\@evil.example/" as loopback here.
   */
  if (authority.includes('\\')) return null;
  // Strip userinfo: everything up to and including the last "@".
  const atIndex = authority.lastIndexOf('@');
  const hostAndPort = atIndex < 0 ? authority : authority.slice(atIndex + 1);
  if (hostAndPort.length === 0) return null;

  let host = hostAndPort;
  let portText = '';
  if (hostAndPort.startsWith('[')) {
    const closing = hostAndPort.indexOf(']');
    if (closing < 0) return null;
    host = hostAndPort.slice(0, closing + 1);
    const tail = hostAndPort.slice(closing + 1);
    if (tail.length > 0) {
      if (!tail.startsWith(':')) return null;
      portText = tail.slice(1);
    }
  } else {
    const colon = hostAndPort.lastIndexOf(':');
    if (colon >= 0) {
      host = hostAndPort.slice(0, colon);
      portText = hostAndPort.slice(colon + 1);
    }
  }

  let port = DEFAULT_PORT_BY_SCHEME[scheme];
  if (portText.length > 0) {
    if (!/^\d+$/.test(portText)) return null;
    const parsed = Number.parseInt(portText, 10);
    if (!isValidPort(parsed)) return null;
    port = parsed;
  }

  return {
    scheme,
    // A fully qualified "localhost." resolves to the same host; the trailing
    // root label is dropped so it is recognised as loopback rather than as an
    // ordinary web address.
    host: (host.endsWith('.') && !host.endsWith(']') ? host.slice(0, -1) : host).toLowerCase(),
    port,
    pathAndQuery: rest.length === 0 || !rest.startsWith('/') ? `/${rest}` : rest,
  };
}

/**
 * Whether a parsed host names the machine the page is served from. A `*.localhost` name is that
 * machine too (browsers resolve the whole TLD to loopback, and Portless names its dev servers so);
 * on the phone it would resolve to the phone itself.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || IPV4_LOOPBACK.test(host) || host.endsWith('.localhost');
}

/**
 * The address the computer's end of a forward dials for a loopback host as a link wrote it. A link
 * naming `127.0.0.1` reaches a listener bound to that address only, which Windows OpenSSH never
 * finds when asked for `localhost` (it tries `::1` and does not fall back; CDXC:Mobile 2026-10-09 in
 * `GhostexSshConnection.kt`), so the address is kept as written; `localhost` names stay `localhost`
 * so a server bound only to `::1` is still reached.
 */
export function computerDialHost(host: string): string {
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost';
  if (host === '[::1]') return '::1';
  if (IPV4_LOOPBACK.test(host)) return host;
  // `0.0.0.0` and the IPv4-mapped forms: a listener on every IPv4 address answers on 127.0.0.1.
  return LOOPBACK_HOST;
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Parse a typed port; `null` when it is not a usable TCP port. */
export function parsePortInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number.parseInt(trimmed, 10);
  return isValidPort(port) ? port : null;
}

/** Accept a full address, a bare hostname, or a computer-side port number. */
export function parseAddressInput(value: string): string | null {
  const text = value.trim();
  if (text.length === 0 || /[\s\\]/.test(text)) return null;
  if (/^\d+$/.test(text)) {
    const port = parsePortInput(text);
    return port === null ? null : `http://localhost:${port}/`;
  }
  if (text.includes('://') && !/^https?:\/\//i.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : text.startsWith('//') ? `http:${text}` : `http://${text}`;
  const parsed = parseHttpUrl(candidate);
  if (parsed === null || parsed.host.length === 0 || parsed.host.includes('@')) return null;
  // Reject unsupported schemes and malformed authorities before giving them to the WebView.
  if (!parsed.host.startsWith('[') && parsed.host.includes(':')) return null;
  if (
    candidate
      .slice(candidate.indexOf('://') + 3)
      .split(/[/?#]/)[0]
      .includes('@')
  )
    return null;
  if (/^https?:\/\//i.test(text) || text.startsWith('//') || isLoopbackHost(parsed.host)) return candidate;
  return `https://${text}`;
}

/** The phone-side URL a forward serves. */
export function localPreviewUrl(scheme: 'http' | 'https', localPort: number, pathAndQuery: string): string {
  return `${scheme}://${LOOPBACK_HOST}:${localPort}${pathAndQuery}`;
}

/**
 * What the same page is at on the computer. The scheme is dropped because the
 * address bar has room for one line and `localhost:3000/path` is what the user
 * would type there.
 */
export function remoteDisplayAddress(remotePort: number, pathAndQuery: string): string {
  const path = pathAndQuery === '/' ? '/' : pathAndQuery;
  return `localhost:${remotePort}${path}`;
}
