/**
 * The phone's own saved links: what each one keeps, how a typed address becomes a page address, and what a row shows.
 * The rules are the desktop's (packages/gx-core/src/custom_links.rs in the Ghostex main repo), ported line for line so
 * an address reads the same on both: `localhost:8317` opens over http, `example.com/admin` over https.
 *
 * CDXC:Sidebar 2026-11-22 DECISION:
 * The user said yes to links on the phone, after the desktop got them in its sidebar ⋯ menu (Ghostex 660896af5). The
 * phone keeps its own list (./store.ts), apart from every computer's `customLinks`, which stays unsynced on purpose: a
 * `localhost` link names the computer it was saved on. So a phone link to a loopback address remembers the computer it
 * opens on (`machineId`), and its page opens through that computer's forward in the Web Preview, which is where
 * `localhost` means that computer (src/screens/WebPreviewScreen.tsx). "Copy links from <computer>" reads a computer's
 * `customLinks` with `ghostex settings get customLinks --json` (./copyFromComputer.ts).
 * SEE-ALSO: ./LinksSheet.tsx (the ☰ menu's Links page, its row menu and the Add link / Edit link dialog).
 */

import { isLoopbackHost, parseHttpUrl } from '../webPreview/urls';

/** The most links the list keeps (gx-core `CUSTOM_LINKS_MAX`); adding one past it drops the oldest, as on the desktop. */
export const PHONE_LINKS_MAX = 50;

/** One saved link. */
export type PhoneLink = {
  id: string;
  /** What the user typed as its name; empty for none. */
  name: string;
  /** A full http or https address (`normalizeLinkUrl`). */
  url: string;
  /** The computer a loopback address (`localhost:8317`) opens on; absent for any other address. */
  machineId?: string;
};

/** A new link id, unique enough for one person's links (the desktop's are 12 hex characters too). */
export function newLinkId(): string {
  let id = '';
  for (let index = 0; index < 12; index += 1) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/** `scheme://host[:port]/…`'s `host[:port]`. */
function urlAuthority(url: string): string | null {
  const at = url.indexOf('://');
  if (at < 0) return null;
  const authority = url.slice(at + 3).split(/[/?#]/u)[0];
  return authority.length > 0 ? authority : null;
}

/** A row's label: its name, else its address's host (and port) (gx-core `CustomLink::label`). */
export function linkLabel(link: Pick<PhoneLink, 'name' | 'url'>): string {
  const name = link.name.trim();
  if (name.length > 0) return name;
  return urlAuthority(link.url) ?? link.url;
}

/** Whether the link's address is on a computer (`localhost`, `127.0.0.1`), which the Web Preview opens through one. */
export function isComputerLink(url: string): boolean {
  const parsed = parseHttpUrl(url);
  return parsed !== null && isLoopbackHost(parsed.host);
}

/** The host of `host[:port]` (an IPv6 address in brackets kept whole), `null` when either part is not one. */
function hostOfAuthority(authority: string): string | null {
  if (authority.length === 0 || authority.includes('@')) return null;
  let host: string;
  let port: string | null;
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    if (end < 0) return null;
    host = authority.slice(0, end + 1);
    const after = authority.slice(end + 1);
    port = after.startsWith(':') ? after.slice(1) : null;
  } else {
    const colon = authority.lastIndexOf(':');
    host = colon < 0 ? authority : authority.slice(0, colon);
    port = colon < 0 ? null : authority.slice(colon + 1);
  }
  if (port !== null) {
    if (!/^\d{1,5}$/u.test(port) || Number(port) > 65_535) return null;
  }
  const bracketed = host.startsWith('[');
  const valid =
    host.length > 0 &&
    (bracketed || /^[A-Za-z0-9._-]+$/u.test(host)) &&
    !host.startsWith('.') &&
    !host.endsWith('..');
  return valid ? host : null;
}

/** A host that is this computer or the local network, which seldom serves https. */
function looksLocal(rawHost: string): boolean {
  const host = rawHost.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.internal') ||
    host.startsWith('[') ||
    !host.includes('.') ||
    host.split('.').every((part) => /^\d+$/u.test(part) && Number(part) <= 255)
  );
}

/**
 * What the user typed as an address, as a page address (gx-core `normalize_custom_link_url`): `http://` or `https://`
 * kept, and one without a scheme given `http://` when it names a computer, a local network name, an IP address or a
 * port (`localhost:8317`, `192.168.1.4`, `nas.local`, `box:3000`), else `https://` (`example.com/admin`). `null` for
 * anything that is not a web address.
 */
export function normalizeLinkUrl(input: string): string | null {
  const text = input.trim();
  // Whitespace or a control character (Rust `char::is_control`: U+0000–001F and U+007F–009F).
  if (text.length === 0 || /[\s\u0000-\u001f\u007f-\u009f]/u.test(text)) return null;
  let scheme: string | null = null;
  let rest = text;
  const separator = text.indexOf('://');
  if (separator >= 0) {
    scheme = text.slice(0, separator).toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;
    rest = text.slice(separator + 3);
  }
  const authority = rest.split(/[/?#]/u)[0];
  const host = hostOfAuthority(authority);
  if (host === null) return null;
  const chosen = scheme ?? (looksLocal(host) || authority.length > host.length ? 'http' : 'https');
  const path = rest.slice(authority.length);
  return `${chosen}://${authority}${path.length === 0 ? '/' : path}`;
}

/**
 * The links a `customLinks` value holds (gx-core `custom_links_from_value`): unique ids, valid addresses, at most
 * `PHONE_LINKS_MAX`. Also reads the phone's own saved list, whose entries may carry a `machineId`.
 */
export function linksFromValue(value: unknown): PhoneLink[] {
  const links: PhoneLink[] = [];
  if (!Array.isArray(value)) return links;
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id.length === 0 || links.some((link) => link.id === id)) continue;
    const url = typeof record.url === 'string' ? normalizeLinkUrl(record.url) : null;
    if (url === null) continue;
    const link: PhoneLink = { id, name: typeof record.name === 'string' ? record.name.trim() : '', url };
    if (typeof record.machineId === 'string' && record.machineId.length > 0 && isComputerLink(url)) {
      link.machineId = record.machineId;
    }
    links.push(link);
    if (links.length === PHONE_LINKS_MAX) break;
  }
  return links;
}
