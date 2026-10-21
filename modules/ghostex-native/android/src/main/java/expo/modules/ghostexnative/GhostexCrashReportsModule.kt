package expo.modules.ghostexnative

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JavaScript's door to the phone's crash reports (GhostexCrashReports.kt). */
class GhostexCrashReportsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw CodedException("React context is unavailable.")

  override fun definition() = ModuleDefinition {
    Name("GhostexCrashReports")

    OnCreate {
      // Normally installed earlier by GhostexCrashReportsPackage; this covers a host without it.
      appContext.reactContext?.let { GhostexCrashReports.install(it) }
    }

    Function("setContext") { route: String, log: String ->
      GhostexCrashReports.setContext(route, log)
    }

    Function("recordJsCrash") { error: String, stack: String, fatal: Boolean ->
      GhostexCrashReports.recordJsCrash(context, error, stack, fatal)
    }

    AsyncFunction("listReports") {
      GhostexCrashReports.list(context)
    }

    AsyncFunction("deleteReport") { id: String ->
      GhostexCrashReports.delete(context, id)
    }
  }
}
