import Foundation
import UIKit
import ExpoModulesCore

/// Crash reports kept on the phone until the user sends one through Send Bug / Feedback.
///
/// CDXC:Feedback 2026-10-21 WHY:
/// iOS catches only uncaught Objective-C exceptions (`NSSetUncaughtExceptionHandler`), which also covers a fatal JavaScript error that React Native turns into an `RCTFatalException`. Swift traps and other signal crashes are not caught: a signal handler may only call async-signal-safe functions, and writing a JSON file from one can deadlock on a lock the crashed thread holds. The exception handler writes the report synchronously and then calls the handler that was installed before it.
/// SEE-ALSO: android/.../GhostexCrashReports.kt (the report's fields and limits), src/GhostexCrashReports.ts, src/app/crashReports.ts.
enum GhostexCrashReports {
  private static let maxReports = 5
  private static let maxErrorChars = 2_000
  private static let maxStackChars = 16_000
  private static let maxLogChars = 8_000
  /// An exception this soon after a recorded fatal JavaScript error is React Native raising it.
  private static let jsRethrowWindow: TimeInterval = 15

  private static let lock = NSLock()
  private static var route = ""
  private static var logTail = ""
  private static var lastJsReportAt: Date = .distantPast
  private static var installed = false
  fileprivate static var previousHandler: (@convention(c) (NSException) -> Void)?

  static func install() {
    lock.lock()
    defer { lock.unlock() }
    if installed { return }
    installed = true
    previousHandler = NSGetUncaughtExceptionHandler()
    NSSetUncaughtExceptionHandler(ghostexHandleUncaughtException)
  }

  static func setContext(route nextRoute: String, log nextLog: String) {
    lock.lock()
    route = String(nextRoute.prefix(200))
    logTail = String(nextLog.suffix(maxLogChars))
    lock.unlock()
  }

  static func recordJsCrash(error: String, stack: String, fatal: Bool) {
    var report = baseReport(kind: "javascript", at: Date())
    report["fatal"] = fatal
    report["error"] = String(error.prefix(maxErrorChars))
    report["stack"] = String(stack.prefix(maxStackChars))
    write(report)
    if fatal {
      lock.lock()
      lastJsReportAt = Date()
      lock.unlock()
    }
  }

  fileprivate static func recordException(_ exception: NSException) {
    // Never wait long on the lock while crashing: a stale screen name beats a hang.
    let locked = lock.lock(before: Date().addingTimeInterval(0.2))
    let recentJs = Date().timeIntervalSince(lastJsReportAt) < jsRethrowWindow
    if locked { lock.unlock() }
    if recentJs { return }
    var report = baseReport(kind: "nsexception", at: Date())
    report["fatal"] = true
    report["thread"] = Thread.isMainThread ? "main" : (Thread.current.name ?? "")
    report["error"] = String("\(exception.name.rawValue): \(exception.reason ?? "")".prefix(maxErrorChars))
    report["stack"] = String(exception.callStackSymbols.joined(separator: "\n").prefix(maxStackChars))
    write(report)
  }

  /// Every stored report as JSON, newest first.
  static func list() -> [String] {
    reportFiles().compactMap { url in
      guard
        let data = try? Data(contentsOf: url),
        var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else { return nil }
      object["id"] = url.deletingPathExtension().lastPathComponent
      guard let json = try? JSONSerialization.data(withJSONObject: object) else { return nil }
      return String(data: json, encoding: .utf8)
    }
  }

  static func delete(id: String) {
    guard id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil, let dir = reportsDir() else { return }
    try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).json"))
  }

  private static func reportsDir() -> URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return nil
    }
    let dir = base.appendingPathComponent("crash-reports", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  /// Report files, newest first (names start with the crash time).
  private static func reportFiles() -> [URL] {
    guard
      let dir = reportsDir(),
      let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path)
    else { return [] }
    return names
      .filter { $0.hasSuffix(".json") && ($0.first?.isNumber ?? false) }
      .sorted(by: >)
      .map { dir.appendingPathComponent($0) }
  }

  private static func write(_ report: [String: Any]) {
    guard
      let dir = reportsDir(),
      let data = try? JSONSerialization.data(withJSONObject: report)
    else { return }
    let at = (report["at"] as? Int64) ?? Int64(Date().timeIntervalSince1970 * 1000)
    let kind = (report["kind"] as? String) ?? "crash"
    let name = String(format: "%015lld-%@.json", at, kind)
    try? data.write(to: dir.appendingPathComponent(name), options: .atomic)
    for stale in reportFiles().dropFirst(maxReports) {
      try? FileManager.default.removeItem(at: stale)
    }
  }

  private static func baseReport(kind: String, at: Date) -> [String: Any] {
    let info = Bundle.main.infoDictionary ?? [:]
    let locked = lock.lock(before: Date().addingTimeInterval(0.2))
    let currentRoute = route
    let currentLog = logTail
    if locked { lock.unlock() }
    return [
      "kind": kind,
      "at": Int64(at.timeIntervalSince1970 * 1000),
      "platform": "ios",
      "appVersion": info["CFBundleShortVersionString"] as? String ?? "",
      "appBuild": info["CFBundleVersion"] as? String ?? "",
      "os": "iOS \(ProcessInfo.processInfo.operatingSystemVersionString)",
      "device": deviceModel(),
      "route": currentRoute,
      "log": currentLog,
    ]
  }

  /// The hardware model identifier (`iPhone16,1`), never the user's device name.
  private static func deviceModel() -> String {
    var system = utsname()
    uname(&system)
    return withUnsafeBytes(of: &system.machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
  }
}

private func ghostexHandleUncaughtException(_ exception: NSException) {
  GhostexCrashReports.recordException(exception)
  GhostexCrashReports.previousHandler?(exception)
}

/// Installs the exception handler before the app delegate's own launch code runs.
public class GhostexCrashReportsAppDelegate: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    GhostexCrashReports.install()
  }
}

/// JavaScript's door to the phone's crash reports.
public class GhostexCrashReportsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GhostexCrashReports")

    OnCreate {
      // Normally installed earlier by GhostexCrashReportsAppDelegate.
      GhostexCrashReports.install()
    }

    Function("setContext") { (route: String, log: String) in
      GhostexCrashReports.setContext(route: route, log: log)
    }

    Function("recordJsCrash") { (error: String, stack: String, fatal: Bool) in
      GhostexCrashReports.recordJsCrash(error: error, stack: stack, fatal: fatal)
    }

    AsyncFunction("listReports") { () -> [String] in
      GhostexCrashReports.list()
    }

    AsyncFunction("deleteReport") { (id: String) in
      GhostexCrashReports.delete(id: id)
    }
  }
}
