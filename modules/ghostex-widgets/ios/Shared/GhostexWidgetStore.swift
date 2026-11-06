import Foundation

/// Where the widget snapshot lives: one JSON file in the App Group container the app and the widget extension share.
/// Compiled into the app (`GhostexWidgetsModule`, which writes it) and into the widget extension (which reads it).
///
/// The group id comes from each bundle's Info.plist (`GhostexAppGroup`, the build setting `GHOSTEX_APP_GROUP` that
/// `plugins/withWidgets.js` sets from app.json's entitlement), so a build signed by another team can use its own
/// group by overriding that one setting.
enum GhostexWidgetStore {
  /// The widgets' kind, also the kind the app reloads.
  static let kind = "GhostexStatus"
  static let fileName = "widget-snapshot.json"

  static func snapshotURL() -> URL? {
    guard
      let group = Bundle.main.object(forInfoDictionaryKey: "GhostexAppGroup") as? String, !group.isEmpty,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return container.appendingPathComponent(fileName, isDirectory: false)
  }
}
