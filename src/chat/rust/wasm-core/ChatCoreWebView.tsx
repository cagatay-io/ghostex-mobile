/**
 * The chat core's hidden WebView, mounted once at the app's root while Settings › Chat › Chat brain
 * is "Browser view". It loads the page that carries the Rust chat core as WebAssembly and hands
 * everything the page posts to {@link wasmCoreBridge}. Nothing in it is ever drawn: it is a 1×1
 * view behind the app.
 */

import { Asset } from 'expo-asset';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useSettingsStore } from '../../../settings/store';
import { wasmCoreBridge } from './bridge';

// Built by `cargo xtask build-mobile-chat-wasm` in the main repo (gitignored, like the native
// core's outputs); Metro bundles it as an asset, so it ships in every over-the-air update.
const CHAT_CORE_PAGE = require('../../../../assets/chat-core/chat-core.html') as number;

/** Mounts the WebView while the Browser view brain is chosen. */
export function ChatCoreWebViewHost() {
  const brain = useSettingsStore((store) => store.settings.sessionChatBrain);
  const hydrated = useSettingsStore((store) => store.hydrated);
  if (!hydrated || brain !== 'browserView') return null;
  return <ChatCoreWebView />;
}

function ChatCoreWebView() {
  const reloadKey = useSyncExternalStore(wasmCoreBridge.subscribeView, wasmCoreBridge.reloadKey);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Asset.fromModule(CHAT_CORE_PAGE)
      .downloadAsync()
      .then((asset) => {
        if (!cancelled) setUri(asset.localUri ?? asset.uri);
      })
      .catch((error: unknown) => {
        wasmCoreBridge.fail(`The chat core page is missing from this build (${String(error)}).`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    wasmCoreBridge.mounted();
    return () => wasmCoreBridge.unmounted();
  }, []);

  // A reload (a crash, or a grown page) starts the page over.
  useEffect(() => {
    if (reloadKey > 0) wasmCoreBridge.mounted();
  }, [reloadKey]);

  if (uri === null) return null;
  return (
    <View style={styles.host} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <WebView
        key={reloadKey}
        source={{ uri }}
        originWhitelist={['*']}
        allowFileAccess
        allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)}
        javaScriptEnabled
        onLoadEnd={(event) => {
          const target = (event.nativeEvent as unknown as { target?: unknown }).target;
          if (typeof target === 'number') wasmCoreBridge.attach(target);
        }}
        onMessage={(event) => wasmCoreBridge.receive(event.nativeEvent.data)}
        onRenderProcessGone={() => wasmCoreBridge.died('The chat core page stopped.')}
        onContentProcessDidTerminate={() => wasmCoreBridge.died('The chat core page stopped.')}
        onError={() => wasmCoreBridge.died('The chat core page could not load.')}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 1×1 and nearly transparent: a WebView that is not laid out or fully transparent can stop running
  // its scripts on some Android versions.
  host: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0.01 },
  webView: { width: 1, height: 1, backgroundColor: 'transparent' },
});
