/**
 * Where an http(s) link belongs. A link to the phone's own loopback is never
 * what the user meant: the listener is on the computer, so the address has to
 * be opened through a forward in the Web preview rather than handed to the
 * phone's browser. Everything else keeps going to the system browser. The
 * classification itself is `machineLinks.ts`.
 */

import { classifyMachineLink } from './machineLinks';

export type WebPreviewTarget = {
  /** Port on the computer, as written in the link. */
  remotePort: number;
  /** Path + query, always starting with `/`. */
  path: string;
  scheme: 'http' | 'https';
  /** The loopback host as written (`localhost`, `127.0.0.1`, `[::1]`), which the computer dials. */
  host: string;
};

/** The preview target for a link, or `null` when it is not a loopback link. */
export function webPreviewTargetForUrl(url: string): WebPreviewTarget | null {
  const link = classifyMachineLink(url);
  if (link.kind !== 'computer') return null;
  const { remotePort, path, scheme, host } = link.address;
  return { remotePort, path, scheme, host };
}
