import ExpoModulesCore
import WidgetKit

/// Writes the widget snapshot for `src/notifications/widgets.ts` and asks WidgetKit to reload the widgets. The widgets
/// live in the widget extension (`Extension/`); both sides find the file through `Shared/GhostexWidgetStore.swift`.
public final class GhostexWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GhostexWidgets")

    AsyncFunction("writeSnapshot") { (json: String) throws in
      // Atomic: the extension never reads half a file.
      try Data(json.utf8).write(to: try Self.snapshotURL(), options: .atomic)
    }

    AsyncFunction("removeSnapshot") { () throws in
      do {
        try FileManager.default.removeItem(at: try Self.snapshotURL())
      } catch CocoaError.fileNoSuchFile {
        // Nothing written yet.
      }
    }

    Function("reloadTimelines") {
      WidgetCenter.shared.reloadTimelines(ofKind: GhostexWidgetStore.kind)
    }
  }

  private static func snapshotURL() throws -> URL {
    guard let url = GhostexWidgetStore.snapshotURL() else { throw NoAppGroupException() }
    return url
  }
}

final class NoAppGroupException: Exception {
  override var reason: String {
    "The App Group container for the widgets is not available (GhostexAppGroup in Info.plist, App Group entitlement)"
  }
}
