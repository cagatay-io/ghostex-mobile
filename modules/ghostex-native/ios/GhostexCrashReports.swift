import Foundation
import MetricKit
import UIKit
import ExpoModulesCore

/// Crash reports kept on the phone until the user sends or deletes one, or stops keeping them.
///
/// CDXC:Feedback 2026-10-21 WHY:
/// iOS catches only uncaught Objective-C exceptions (`NSSetUncaughtExceptionHandler`), which also covers a fatal JavaScript error that React Native turns into an `RCTFatalException`. Swift traps and other signal crashes are not caught: a signal handler may only call async-signal-safe functions, and writing a JSON file from one can deadlock on a lock the crashed thread holds. The exception handler writes the report synchronously and then calls the handler that was installed before it.
/// CDXC:Feedback 2026-11-13 WHY:
/// The crashes the exception handler cannot see reach the same reports through MetricKit, which hands an earlier run's crash diagnostic (exception type, signal, call stack) to the app on a later launch or while it runs, on a real device only and with no promised delay. Each diagnostic is kept as a `native` report of its own, named by a hash of the diagnostic, so two crashes in one payload stay two reports and a repeated delivery replaces its own file. MetricKit gives only the payload's reporting period, not the crash's own time, so the report keeps that period beside the time it is sorted by.
/// A crash the app already recorded itself (a fatal JavaScript error, an uncaught exception, both ending in an abort) must not be kept twice, also when its diagnostic arrives on a later launch or after the report was sent: each of those reports leaves a marker, an empty file whose name holds the crash's time and process id. A diagnostic takes a marker only on matching evidence: the signal SIGABRT (the exception type EXC_CRASH alone is no proof, Apple uses it for SIGKILL, SIGQUIT and others too), the marker's time within the reporting period (five minutes either side) and, from iOS 17, the same process id; anything less is kept as a report, since a duplicate beats a lost crash. A marker stays on the phone until its diagnostic takes it or keeping is turned off, since MetricKit promises no delivery time. The app never sends or exports a marker; like the reports, markers are part of the phone's backups as iOS makes them.
/// Whether reports are kept is stored here, not in JavaScript, because the exception handler writes before JavaScript runs and a diagnostic can arrive at any time. Every writer writes only while it holds the store lock and keeping is on; a crashing writer that cannot take the lock within 0.2 s keeps nothing rather than write outside it. Turning keeping off holds the same lock from the switch to the last deletion, so no report is left or added afterwards.
/// SEE-ALSO: android/.../GhostexCrashReports.kt (the report's fields and limits), src/GhostexCrashReports.ts, src/app/crashReports.ts.
enum GhostexCrashReports {
  private static let maxReports = 5
  private static let maxErrorChars = 2_000
  private static let maxStackChars = 16_000
  private static let maxLogChars = 8_000
  /// An exception this soon after a recorded fatal JavaScript error is React Native raising it.
  private static let jsRethrowWindow: TimeInterval = 15
  /// How far a marker's time may lie outside a diagnostic's time span and still be the same crash.
  private static let markerSlack: TimeInterval = 300
  private static let keepingKey = "GhostexCrashReports.keeping"

  private static let lock = NSLock()
  private static var route = ""
  private static var logTail = ""
  private static var lastJsReportAt: Date = .distantPast
  private static var installed = false
  private static var diagnosticsSubscriber: GhostexCrashDiagnosticsSubscriber?
  fileprivate static var previousHandler: (@convention(c) (NSException) -> Void)?

  /// Guards the report files and markers; never held together with `lock`.
  private static let storeLock = NSLock()
  /// Guards only `keeping`, never across file work, so reading it never waits on a write. Taken inside `storeLock`.
  private static let keepingLock = NSLock()
  /// Whether reports are kept: on until the user turns it off. Loaded by `install`.
  private static var keeping = true

  static func install() {
    lock.lock()
    defer { lock.unlock() }
    if installed { return }
    installed = true
    let stored = UserDefaults.standard.object(forKey: keepingKey) as? Bool
    keepingLock.lock()
    keeping = stored ?? true
    keepingLock.unlock()
    previousHandler = NSGetUncaughtExceptionHandler()
    NSSetUncaughtExceptionHandler(ghostexHandleUncaughtException)
  }

  /// Starts taking MetricKit's diagnostics; called once the app has finished launching.
  static func subscribeToDiagnostics() {
    lock.lock()
    defer { lock.unlock() }
    if diagnosticsSubscriber != nil { return }
    let subscriber = GhostexCrashDiagnosticsSubscriber()
    diagnosticsSubscriber = subscriber
    MXMetricManager.shared.add(subscriber)
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
    // React Native ends the app right after this call, so it waits on the store as briefly as the exception handler.
    let written = withStoreIfFree(within: 0.2) { writeReport(report, ownFatal: fatal) } ?? false
    if fatal && written {
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
    withStoreIfFree(within: 0.2) { _ = writeReport(report, ownFatal: true) }
  }

  /// Keeps each crash MetricKit reports, unless the app already recorded that crash or keeping is off.
  fileprivate static func recordDiagnostics(_ payload: MXDiagnosticPayload) {
    for (index, crash) in (payload.crashDiagnostics ?? []).enumerated() {
      let report = nativeReport(crash, from: payload.timeStampBegin, to: payload.timeStampEnd)
      let identity = diagnosticIdentity(crash.jsonRepresentation(), index: index)
      withStore {
        guard isKeeping(), !takeMarker(of: crash, from: payload.timeStampBegin, to: payload.timeStampEnd) else { return }
        _ = writeReport(report, ownFatal: false, identity: identity)
      }
    }
  }

  static func isKeeping() -> Bool {
    keepingLock.lock()
    defer { keepingLock.unlock() }
    return keeping
  }

  /// Turns keeping reports on or off. Off deletes every stored report and marker before it returns; every writer checks
  /// `keeping` while it holds the store lock, which this holds from the switch to the last deletion, so none adds a
  /// report afterwards. Throws when a file could not be deleted.
  static func setKeeping(_ keep: Bool) throws {
    let failed: Int = withStore {
      keepingLock.lock()
      keeping = keep
      keepingLock.unlock()
      UserDefaults.standard.set(keep, forKey: keepingKey)
      if keep { return 0 }
      guard let dir = reportsDir() else { return 0 }
      let names: [String]
      do {
        names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
      } catch {
        NSLog("GhostexCrashReports: could not list the stored reports to delete them: %@", "\(error)")
        return 1
      }
      var failed = 0
      for name in names where isReportName(name) || isMarkerName(name) {
        do {
          try FileManager.default.removeItem(at: dir.appendingPathComponent(name))
        } catch {
          NSLog("GhostexCrashReports: could not delete %@: %@", name, "\(error)")
          failed += 1
        }
      }
      return failed
    }
    if failed > 0 { throw CrashReportsNotDeletedException(failed) }
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

  /// Report files are named after the crash time: `000001731500000000-javascript.json`.
  private static func isReportName(_ name: String) -> Bool {
    name.hasSuffix(".json") && (name.first?.isNumber ?? false)
  }

  /// Markers are named `fatal-<crash time in ms>-<process id>.marker`.
  private static func isMarkerName(_ name: String) -> Bool {
    name.hasPrefix("fatal-") && name.hasSuffix(".marker")
  }

  /// Report files, newest first (names start with the crash time).
  private static func reportFiles() -> [URL] {
    filesNamed(isReportName)
  }

  private static func filesNamed(_ matches: (String) -> Bool) -> [URL] {
    guard
      let dir = reportsDir(),
      let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path)
    else { return [] }
    return names
      .filter(matches)
      .sorted(by: >)
      .map { dir.appendingPathComponent($0) }
  }

  /// Runs `body` holding the store lock.
  private static func withStore<T>(_ body: () -> T) -> T {
    storeLock.lock()
    defer { storeLock.unlock() }
    return body()
  }

  /// Runs `body` holding the store lock if it can be taken within `wait` (while the app is ending); otherwise nothing is
  /// written and the result is nil: a crash report never outside the lock, and never a hang.
  @discardableResult
  private static func withStoreIfFree<T>(within wait: TimeInterval, _ body: () -> T) -> T? {
    guard storeLock.lock(before: Date().addingTimeInterval(wait)) else { return nil }
    defer { storeLock.unlock() }
    return body()
  }

  /// Writes one report while keeping is on and keeps the five newest; a fatal crash the app recorded itself also leaves
  /// a marker for its MetricKit diagnostic. `identity` tells reports of one kind and time apart (MetricKit's diagnostics
  /// share their payload's period). Call holding the store lock. True when the report was written.
  private static func writeReport(_ report: [String: Any], ownFatal: Bool, identity: String? = nil) -> Bool {
    guard isKeeping(), let dir = reportsDir() else { return false }
    let at = (report["at"] as? Int64) ?? Int64(Date().timeIntervalSince1970 * 1000)
    let kind = (report["kind"] as? String) ?? "crash"
    let name = String(format: "%015lld-%@", at, kind) + (identity.map { "-\($0)" } ?? "")
    do {
      let data = try JSONSerialization.data(withJSONObject: report)
      try data.write(to: dir.appendingPathComponent("\(name).json"), options: .atomic)
    } catch {
      NSLog("GhostexCrashReports: a %@ crash report could not be written: %@", kind, "\(error)")
      return false
    }
    do {
      if ownFatal {
        let marker = String(format: "fatal-%015lld-%d.marker", at, ProcessInfo.processInfo.processIdentifier)
        try Data().write(to: dir.appendingPathComponent(marker), options: .atomic)
      }
      for stale in reportFiles().dropFirst(maxReports) {
        try FileManager.default.removeItem(at: stale)
      }
    } catch {
      NSLog("GhostexCrashReports: after a %@ crash report, its marker or the oldest reports: %@", kind, "\(error)")
    }
    return true
  }

  /// A marker's crash time and process id, from its name `fatal-<time>-<pid>.marker`.
  private static func markerParts(_ url: URL) -> (at: Int64, pid: Int32)? {
    let parts = url.deletingPathExtension().lastPathComponent.split(separator: "-")
    guard parts.count == 3, let at = Int64(parts[1]), let pid = Int32(parts[2]) else { return nil }
    return (at, pid)
  }

  /// Deletes and reports the marker of a crash the app recorded itself that this diagnostic describes, if the evidence
  /// matches: the signal SIGABRT (how an uncaught exception, and so a fatal JavaScript error, ends; EXC_CRASH alone also
  /// covers other signals), the marker's time within the reporting period give or take `markerSlack`, and from iOS 17 the
  /// same process id. Without all of it, nothing is taken.
  private static func takeMarker(of crash: MXCrashDiagnostic, from begin: Date, to end: Date) -> Bool {
    guard crash.signal?.int32Value == SIGABRT else { return false }
    let earliest = Int64((begin.timeIntervalSince1970 - markerSlack) * 1000)
    let latest = Int64((end.timeIntervalSince1970 + markerSlack) * 1000)
    for url in filesNamed(isMarkerName) {
      guard let marker = markerParts(url), marker.at >= earliest, marker.at <= latest else { continue }
      if #available(iOS 17.0, *), crash.metaData.pid != marker.pid { continue }
      do {
        try FileManager.default.removeItem(at: url)
      } catch {
        NSLog("GhostexCrashReports: could not delete a crash marker: %@", "\(error)")
      }
      return true
    }
    return false
  }

  /// A stable name for one MetricKit diagnostic: FNV-1a (64 bit) of its JSON and its place in the payload, so the same
  /// payload delivered again maps to the same reports, and two diagnostics of one payload, even identical ones, to two.
  private static func diagnosticIdentity(_ json: Data, index: Int) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in json + Data("#\(index)".utf8) {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01b3
    }
    return String(format: "%016llx", hash)
  }

  private static func baseReport(kind: String, at: Date) -> [String: Any] {
    let info = Bundle.main.infoDictionary ?? [:]
    let locked = lock.lock(before: Date().addingTimeInterval(0.2))
    let currentRoute = route
    let currentLog = logTail
    if locked { lock.unlock() }
    return reportFields(
      kind: kind,
      at: at,
      appVersion: info["CFBundleShortVersionString"] as? String ?? "",
      appBuild: info["CFBundleVersion"] as? String ?? "",
      os: "iOS \(ProcessInfo.processInfo.operatingSystemVersionString)",
      device: deviceModel(),
      route: currentRoute,
      log: currentLog
    )
  }

  /// The fields every report carries; MetricKit's describe an earlier run, the app's own reports this one.
  private static func reportFields(
    kind: String, at: Date, appVersion: String, appBuild: String, os: String, device: String, route: String, log: String
  ) -> [String: Any] {
    [
      "kind": kind,
      "at": Int64(at.timeIntervalSince1970 * 1000),
      "platform": "ios",
      "appVersion": appVersion,
      "appBuild": appBuild,
      "os": os,
      "device": device,
      "route": route,
      "log": log,
    ]
  }

  /// A MetricKit crash as a `native` report. The version, system and device are the crashed run's; the screen and the
  /// app log are left empty, because the ones this run knows belong to another run. MetricKit names no crash time, only
  /// the payload's reporting period: the report is sorted by the period's end (`at`) and keeps the period itself as
  /// `periodBegin` / `periodEnd`, which the text shows instead of an exact time.
  private static func nativeReport(_ crash: MXCrashDiagnostic, from begin: Date, to end: Date) -> [String: Any] {
    let meta = crash.metaData
    var report = reportFields(
      kind: "native",
      at: end,
      appVersion: crash.applicationVersion,
      appBuild: meta.applicationBuildVersion,
      os: meta.osVersion,
      device: meta.deviceType,
      route: "",
      log: ""
    )
    report["fatal"] = true
    report["periodBegin"] = Int64(begin.timeIntervalSince1970 * 1000)
    report["periodEnd"] = Int64(end.timeIntervalSince1970 * 1000)
    var lines: [String] = []
    if let type = crash.exceptionType {
      let code = crash.exceptionCode.map { ", code \($0)" } ?? ""
      lines.append("Exception type: \(machExceptionName(type.int32Value)) (\(type))\(code)")
    }
    if let signal = crash.signal {
      lines.append("Signal: \(signalName(signal.int32Value)) (\(signal))")
    }
    if #available(iOS 17.0, *), let reason = crash.exceptionReason {
      lines.append("Objective-C exception: \(reason.exceptionName): \(reason.composedMessage)")
    }
    if let reason = crash.terminationReason, !reason.isEmpty {
      lines.append("Termination reason: \(reason)")
    }
    if let region = crash.virtualMemoryRegionInfo, !region.isEmpty {
      lines.append("Memory region: \(region)")
    }
    report["error"] = String(lines.joined(separator: "\n").prefix(maxErrorChars))
    let stack = callStackText(crash.callStackTree.jsonRepresentation())
    report["thread"] = stack.crashedThread
    report["stack"] = String(stack.text.prefix(maxStackChars))
    return report
  }

  /// MetricKit's call stack tree as text: per thread, one line per frame (binary, address, offset into the binary's
  /// text segment), then the binaries' UUIDs for symbolication. MetricKit does not symbolicate on the phone.
  private static func callStackText(_ json: Data) -> (text: String, crashedThread: String?) {
    guard
      let tree = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any],
      let threads = tree["callStacks"] as? [[String: Any]]
    else {
      // An unknown shape is still the stack Apple delivered.
      return (String(decoding: json, as: UTF8.self), nil)
    }
    var lines: [String] = []
    var binaries: [String: String] = [:]
    var crashedThread: String?
    for (index, thread) in threads.enumerated() {
      let crashed = thread["threadAttributed"] as? Bool ?? false
      if crashed { crashedThread = "Thread \(index)" }
      lines.append("Thread \(index)\(crashed ? " (crashed)" : ""):")
      var frameNumber = 0
      var pending = (thread["callStackRootFrames"] as? [[String: Any]] ?? []).reversed().map { $0 }
      while let frame = pending.popLast() {
        let binary = frame["binaryName"] as? String ?? "???"
        let address = (frame["address"] as? NSNumber)?.uint64Value ?? 0
        let offset = (frame["offsetIntoBinaryTextSegment"] as? NSNumber)?.uint64Value ?? 0
        lines.append(String(format: "%-4ld %@ 0x%016llx + %llu", frameNumber, binary, address, offset))
        if let uuid = frame["binaryUUID"] as? String {
          binaries[binary] = uuid.replacingOccurrences(of: "-", with: "").lowercased()
        }
        frameNumber += 1
        pending.append(contentsOf: (frame["subFrames"] as? [[String: Any]] ?? []).reversed())
      }
      lines.append("")
    }
    if !binaries.isEmpty {
      lines.append("Binary images:")
      for (name, uuid) in binaries.sorted(by: { $0.key < $1.key }) { lines.append("\(name) \(uuid)") }
    }
    return (lines.joined(separator: "\n"), crashedThread)
  }

  private static func machExceptionName(_ type: Int32) -> String {
    switch type {
    case EXC_BAD_ACCESS: return "EXC_BAD_ACCESS"
    case EXC_BAD_INSTRUCTION: return "EXC_BAD_INSTRUCTION"
    case EXC_ARITHMETIC: return "EXC_ARITHMETIC"
    case EXC_SOFTWARE: return "EXC_SOFTWARE"
    case EXC_BREAKPOINT: return "EXC_BREAKPOINT"
    case EXC_CRASH: return "EXC_CRASH"
    case EXC_RESOURCE: return "EXC_RESOURCE"
    case EXC_GUARD: return "EXC_GUARD"
    default: return "exception"
    }
  }

  private static func signalName(_ signal: Int32) -> String {
    switch signal {
    case SIGILL: return "SIGILL"
    case SIGTRAP: return "SIGTRAP"
    case SIGABRT: return "SIGABRT"
    case SIGFPE: return "SIGFPE"
    case SIGKILL: return "SIGKILL"
    case SIGBUS: return "SIGBUS"
    case SIGSEGV: return "SIGSEGV"
    case SIGSYS: return "SIGSYS"
    case SIGPIPE: return "SIGPIPE"
    case SIGTERM: return "SIGTERM"
    default: return "signal"
    }
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

/// Setting keeping off could not delete every stored report.
final class CrashReportsNotDeletedException: GenericException<Int>, @unchecked Sendable {
  override var reason: String {
    "\(param) stored crash report file(s) could not be deleted"
  }
}

/// MetricKit's subscriber; MetricKit calls it on a background queue.
private final class GhostexCrashDiagnosticsSubscriber: NSObject, MXMetricManagerSubscriber {
  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    for payload in payloads { GhostexCrashReports.recordDiagnostics(payload) }
  }
}

private func ghostexHandleUncaughtException(_ exception: NSException) {
  GhostexCrashReports.recordException(exception)
  GhostexCrashReports.previousHandler?(exception)
}

/// Installs the exception handler before the app delegate's own launch code runs, and subscribes to MetricKit once the
/// app has finished launching.
public class GhostexCrashReportsAppDelegate: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    GhostexCrashReports.install()
  }

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    GhostexCrashReports.subscribeToDiagnostics()
    return true
  }
}

/// JavaScript's door to the phone's crash reports.
public class GhostexCrashReportsModule: Module {
  /// The report folder's file work (listing, deleting, switching keeping off) runs here, one call at a time, instead of
  /// on Expo's shared queue, so a large folder never holds up other modules' calls.
  private let storeQueue = DispatchQueue(label: "io.ghostex.crash-reports", qos: .utility)

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

    Function("isKeepingReports") { () -> Bool in
      GhostexCrashReports.isKeeping()
    }

    AsyncFunction("setKeepingReports") { (keep: Bool) in
      try GhostexCrashReports.setKeeping(keep)
    }.runOnQueue(storeQueue)

    AsyncFunction("listReports") { () -> [String] in
      GhostexCrashReports.list()
    }.runOnQueue(storeQueue)

    AsyncFunction("deleteReport") { (id: String) in
      GhostexCrashReports.delete(id: id)
    }.runOnQueue(storeQueue)
  }
}
