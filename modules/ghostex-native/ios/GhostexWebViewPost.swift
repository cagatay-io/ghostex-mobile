import UIKit
import WebKit
import ExpoModulesCore

/// Hands a script to one react-native-webview WKWebView on the main thread right away.
///
/// CDXC:SessionChat 2026-10-23 WHY: the chat core runs as WebAssembly in a hidden WebView and is
/// called several times per keystroke. react-native-webview's `postMessage` is a Fabric view command
/// that waits for the next UI frame, about 16 ms per call (docs/2026-10-23/mobile-ota/webview-spike/
/// REPORT.md); `evaluateJavaScript` dispatched straight to the main queue answers in about 1 ms.
/// SEE-ALSO: android GhostexWebViewPost.kt, src/chat/rust/wasm-core/bridge.ts in the app.
enum GhostexWebViewPost {
    private static var cachedTag = -1
    private static weak var cached: WKWebView?

    static func post(appContext: AppContext?, viewTag: Int, script: String) {
        DispatchQueue.main.async {
            find(appContext: appContext, viewTag: viewTag)?.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    private static func find(appContext: AppContext?, viewTag: Int) -> WKWebView? {
        if viewTag == cachedTag, let webView = cached {
            return webView
        }
        guard let root = appContext?.findView(withTag: viewTag, ofType: UIView.self) else {
            return nil
        }
        let found = firstWebView(in: root)
        if let found {
            cachedTag = viewTag
            cached = found
        }
        return found
    }

    private static func firstWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView {
            return webView
        }
        for subview in view.subviews {
            if let webView = firstWebView(in: subview) {
                return webView
            }
        }
        return nil
    }
}
