/**
 * The Desktop site switch of the Web preview: a page is asked for as a desktop
 * browser would ask for it, like Safari's "Request Desktop Website".
 *
 * Three things make a page a desktop page, and all three are set together:
 * the user agent (the server picks its layout from it), a desktop-width
 * viewport (the layout needs room), and, on iOS, WebKit's own desktop content
 * mode. The choice is kept per site, so the key names the site, not the page.
 */

import { Platform } from 'react-native';

import { LOOPBACK_HOST, parseHttpUrl } from './urls';

/** Layout width a desktop browser gives a page when the window is this narrow. */
export const DESKTOP_VIEWPORT_WIDTH = 1280;

/** Safari on a Mac, which is what iOS itself sends for "Request Desktop Website". */
const IOS_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';

/** Chrome on a desktop computer. */
const ANDROID_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** The user agent to send in desktop mode; `undefined` keeps the WebView's own phone agent. */
export function desktopUserAgent(): string {
  return Platform.OS === 'ios' ? IOS_DESKTOP_USER_AGENT : ANDROID_DESKTOP_USER_AGENT;
}

/**
 * The site a URL belongs to, the key the choice is remembered under. A page on
 * the computer is `localhost:<port>`, because every forwarded port is the same
 * phone-side host and two dev servers are two sites; any other site is its host
 * without a leading `www.`. `remotePortForLocal` turns a phone-side forward port
 * back into the computer's port.
 */
export function siteKeyForUrl(
  url: string,
  remotePortForLocal: (localPort: number) => number | undefined,
): string | null {
  const parsed = parseHttpUrl(url);
  if (parsed === null) return null;
  if (parsed.host === LOOPBACK_HOST) {
    const remotePort = remotePortForLocal(parsed.port);
    return remotePort === undefined ? null : `localhost:${remotePort}`;
  }
  return parsed.host.replace(/^www\./, '');
}

/**
 * Runs before the page's own scripts. Android's WebView lays out a page with no
 * viewport tag at 980 CSS pixels and honours a phone `width=device-width` tag, so
 * the tag is replaced with a desktop width (the WebView then zooms out to fit it)
 * and re-asserted when the page writes its own. WebKit gets the same through
 * `contentMode='desktop'`, and the tag is harmless there.
 */
export const DESKTOP_VIEWPORT_SCRIPT = `(function () {
  try {
    var content = 'width=${DESKTOP_VIEWPORT_WIDTH}';
    var apply = function () {
      var head = document.head || document.documentElement;
      if (!head) return;
      var tags = document.querySelectorAll('meta[name="viewport"]');
      var tag = tags.length > 0 ? tags[0] : null;
      for (var i = 1; i < tags.length; i++) tags[i].parentNode.removeChild(tags[i]);
      if (tag === null) {
        tag = document.createElement('meta');
        tag.setAttribute('name', 'viewport');
        head.appendChild(tag);
      }
      // An unchanged value would re-enter the observer below for nothing.
      if (tag.getAttribute('content') !== content) tag.setAttribute('content', content);
    };
    var watched = null;
    var watchHead = function () {
      if (document.head && document.head !== watched) {
        watched = document.head;
        new MutationObserver(apply).observe(watched, { childList: true, attributes: true, subtree: true, attributeFilter: ['content', 'name'] });
      }
    };
    var start = function () {
      apply();
      watchHead();
    };
    start();
    // The head does not exist yet when this runs before the document is parsed.
    new MutationObserver(start).observe(document.documentElement, { childList: true });
  } catch (error) {
    // A page that forbids DOM access keeps the engine's own viewport.
  }
  true;
})();`;
