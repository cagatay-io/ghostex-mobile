package expo.modules.ghostexnative

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import expo.modules.kotlin.AppContext
import java.lang.ref.WeakReference

/**
 * Hands a script to one react-native-webview WebView on the UI thread right away.
 *
 * CDXC:SessionChat 2026-10-23 WHY: the chat core runs as WebAssembly in a hidden WebView and is
 * called several times per keystroke. react-native-webview's `postMessage` is a Fabric view command
 * that waits for the next UI frame, about 16 ms per call (docs/2026-10-23/mobile-ota/webview-spike/
 * REPORT.md); `evaluateJavascript` posted straight to the main looper answers in about 1 ms.
 * SEE-ALSO: ios/GhostexWebViewPost.swift, src/chat/rust/wasm-core/bridge.ts in the app.
 */
internal object GhostexWebViewPost {
  private val main = Handler(Looper.getMainLooper())
  private var cachedTag = -1
  private var cached: WeakReference<WebView>? = null

  fun post(appContext: AppContext, viewTag: Int, script: String) {
    main.post { find(appContext, viewTag)?.evaluateJavascript(script, null) }
  }

  private fun find(appContext: AppContext, viewTag: Int): WebView? {
    if (viewTag == cachedTag) cached?.get()?.let { return it }
    val root: View = appContext.findView(viewTag) ?: return null
    return firstWebView(root)?.also {
      cachedTag = viewTag
      cached = WeakReference(it)
    }
  }

  private fun firstWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) firstWebView(view.getChildAt(index))?.let { return it }
    }
    return null
  }
}
