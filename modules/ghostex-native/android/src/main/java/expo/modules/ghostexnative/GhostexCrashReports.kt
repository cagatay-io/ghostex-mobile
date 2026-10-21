package expo.modules.ghostexnative

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import kotlin.system.exitProcess

/**
 * Crash reports kept on the phone until the user sends one through Send Bug / Feedback.
 *
 * CDXC:Feedback 2026-10-21 DECISION:
 * User (Q372): "Yes, add crash reports", "should be able to send it to github issues please after agent cleans up any personal data. same as what we have in the modal for Send Bug/Feedback". A crash writes a JSON report into the app's own files (nothing leaves the phone), the next launch offers it, and Send report opens the feedback screen with it attached, cleaned (src/feedback/crashReportScrub.ts) and shown in Review before it posts.
 *
 * CDXC:Feedback 2026-10-21 WHY:
 * Java/Kotlin crashes are caught by a default uncaught-exception handler that writes the report synchronously and then hands over to the previous handler, so the system still shows its crash and Play still sees it. Crashes in native code (signals) and "app not responding" kills are read on the next launch from Android's own exit records (Android 11 and later) instead of installing signal handlers, which cannot safely write files. A fatal JavaScript error records its own report through `recordJsCrash` and then makes React Native throw on the Java side; that second, less useful report is skipped.
 * SEE-ALSO: ios/GhostexCrashReports.swift, src/GhostexCrashReports.ts, src/app/crashReports.ts.
 */
internal object GhostexCrashReports {
  private const val TAG = "GhostexCrashReports"
  private const val DIR = "crash-reports"
  private const val CONTEXT_FILE = "context.json"
  private const val PREVIOUS_CONTEXT_FILE = "context.previous.json"
  private const val PREFS = "ghostex.crashReports"
  private const val EXIT_INFO_SEEN_AT = "exitInfoSeenAt"
  private const val MAX_REPORTS = 5
  private const val MAX_ERROR_CHARS = 2_000
  private const val MAX_STACK_CHARS = 16_000
  private const val MAX_LOG_CHARS = 8_000
  /** A Java crash this soon after a recorded fatal JavaScript error is React Native rethrowing it. */
  private const val JS_RETHROW_WINDOW_MS = 15_000L

  @Volatile private var appContext: Context? = null
  @Volatile private var route: String = ""
  @Volatile private var logTail: String = ""
  @Volatile private var lastJsReportAt: Long = 0L
  private var installed = false
  private val contextWriter = Executors.newSingleThreadExecutor()

  /** Called from Application.onCreate (GhostexCrashReportsPackage), before any screen runs. */
  @Synchronized
  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    appContext = app
    // The last process's screen and log, for a native crash or ANR read from the exit records.
    runCatching {
      val dir = reportsDir(app)
      val current = File(dir, CONTEXT_FILE)
      if (current.exists()) current.renameTo(File(dir, PREVIOUS_CONTEXT_FILE))
    }
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        if (System.currentTimeMillis() - lastJsReportAt > JS_RETHROW_WINDOW_MS) {
          write(app, javaReport(app, thread, error))
        }
      } catch (_: Throwable) {
        // A failing report must never hide the crash itself.
      }
      if (previous != null) {
        previous.uncaughtException(thread, error)
      } else {
        Process.killProcess(Process.myPid())
        exitProcess(10)
      }
    }
  }

  /** The screen the app is on and the tail of its in-app log, kept for the next crash. */
  fun setContext(nextRoute: String, nextLog: String) {
    route = nextRoute.take(200)
    logTail = nextLog.takeLast(MAX_LOG_CHARS)
    val app = appContext ?: return
    val snapshot = JSONObject().put("route", route).put("log", logTail).toString()
    contextWriter.execute {
      runCatching { File(reportsDir(app), CONTEXT_FILE).writeText(snapshot) }
    }
  }

  /** A fatal JavaScript error, written synchronously before React Native ends the app. */
  fun recordJsCrash(context: Context, error: String, stack: String, fatal: Boolean) {
    val report = baseReport(context, "javascript", System.currentTimeMillis())
      .put("fatal", fatal)
      .put("error", error.take(MAX_ERROR_CHARS))
      .put("stack", stack.take(MAX_STACK_CHARS))
    write(context, report)
    if (fatal) lastJsReportAt = System.currentTimeMillis()
  }

  /** Every stored report as JSON, newest first, after importing native crashes and ANRs. */
  fun list(context: Context): List<String> {
    runCatching { importExitInfo(context) }.onFailure { Log.w(TAG, "Could not read exit records", it) }
    return reportFiles(context).map { file ->
      runCatching { JSONObject(file.readText()).put("id", file.nameWithoutExtension).toString() }.getOrNull()
    }.filterNotNull()
  }

  fun delete(context: Context, id: String) {
    if (!id.matches(Regex("[A-Za-z0-9_-]+"))) return
    File(reportsDir(context), "$id.json").delete()
  }

  private fun reportsDir(context: Context): File = File(context.filesDir, DIR).apply { mkdirs() }

  /** Report files, newest first (names start with the crash time). */
  private fun reportFiles(context: Context): List<File> =
    reportsDir(context)
      .listFiles { file -> file.isFile && file.name.endsWith(".json") && file.name.first().isDigit() }
      ?.sortedByDescending { it.name }
      ?: emptyList()

  private fun write(context: Context, report: JSONObject) {
    val at = report.optLong("at", System.currentTimeMillis())
    val kind = report.optString("kind", "crash")
    File(reportsDir(context), "${String.format("%015d", at)}-$kind.json").writeText(report.toString())
    reportFiles(context).drop(MAX_REPORTS).forEach { it.delete() }
  }

  private fun baseReport(context: Context, kind: String, at: Long): JSONObject {
    val (version, build) = appVersion(context)
    return JSONObject()
      .put("kind", kind)
      .put("at", at)
      .put("platform", "android")
      .put("appVersion", version)
      .put("appBuild", build)
      .put("os", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
      .put("device", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
      .put("route", route)
      .put("log", logTail)
  }

  private fun javaReport(context: Context, thread: Thread, error: Throwable): JSONObject =
    baseReport(context, "java", System.currentTimeMillis())
      .put("fatal", true)
      .put("thread", thread.name)
      .put("error", "${error.javaClass.name}: ${error.message ?: ""}".take(MAX_ERROR_CHARS))
      .put("stack", Log.getStackTraceString(error).take(MAX_STACK_CHARS))

  private fun appVersion(context: Context): Pair<String, String> = runCatching {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val build = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    Pair(info.versionName ?: "", build.toString())
  }.getOrDefault(Pair("", ""))

  /** Native crashes and "not responding" kills Android recorded since the last look. */
  @Synchronized
  private fun importExitInfo(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val seenAt = prefs.getLong(EXIT_INFO_SEEN_AT, -1L)
    if (seenAt < 0) {
      // First run with crash reports: older exits are not this feature's to report.
      prefs.edit().putLong(EXIT_INFO_SEEN_AT, System.currentTimeMillis()).apply()
      return
    }
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val exits = manager.getHistoricalProcessExitReasons(context.packageName, 0, 10)
      .filter { it.timestamp > seenAt }
    if (exits.isEmpty()) return
    val previous = runCatching {
      JSONObject(File(reportsDir(context), PREVIOUS_CONTEXT_FILE).readText())
    }.getOrNull()
    for (exit in exits.filter { it.reason == ApplicationExitInfo.REASON_CRASH_NATIVE || it.reason == ApplicationExitInfo.REASON_ANR }) {
      val native = exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE
      val report = baseReport(context, if (native) "native" else "anr", exit.timestamp)
        .put("fatal", true)
        .put("route", previous?.optString("route") ?: "")
        .put("log", previous?.optString("log") ?: "")
        .put(
          "error",
          ((if (native) "Native crash" else "App not responding") +
            (exit.description?.let { ": $it" } ?: "")).take(MAX_ERROR_CHARS),
        )
        // An ANR's trace is the threads' stacks as text; a native crash's is a binary tombstone.
        .put("stack", if (native) "" else anrTrace(exit))
      write(context, report)
    }
    prefs.edit().putLong(EXIT_INFO_SEEN_AT, exits.maxOf { it.timestamp }).apply()
  }

  /** The main thread's part of an ANR trace (it is the one that hung), or the trace's start. */
  private fun anrTrace(exit: ApplicationExitInfo): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return ""
    val text = runCatching {
      exit.traceInputStream?.bufferedReader()?.use { reader ->
        val buffer = CharArray(256 * 1024)
        val read = reader.read(buffer)
        if (read <= 0) "" else String(buffer, 0, read)
      }
    }.getOrNull() ?: return ""
    val main = text.indexOf("\"main\"")
    return (if (main >= 0) text.substring(main) else text).take(MAX_STACK_CHARS)
  }
}
