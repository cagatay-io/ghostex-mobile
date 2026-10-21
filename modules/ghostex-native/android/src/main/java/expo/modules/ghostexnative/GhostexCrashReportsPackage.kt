package expo.modules.ghostexnative

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/** Installs the crash handler in Application.onCreate, before React Native starts. */
class GhostexCrashReportsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          GhostexCrashReports.install(application)
        }
      },
    )
}
