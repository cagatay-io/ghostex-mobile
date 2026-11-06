import SwiftUI
import WidgetKit

/// The Ghostex Home Screen widget in three sizes (StandBy shows the small one): what the app last wrote into the App
/// Group (`GhostexWidgetSnapshot`). The app asks for a reload after each write (`GhostexWidgetsModule`), so the
/// timeline never asks for one itself; it adds an entry at each shown reset, so a passed reset leaves its bar's label
/// without a reload. The widget never reaches the network.
struct GhostexStatusWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: GhostexWidgetStore.kind, provider: StatusProvider()) { entry in
      StatusWidgetView(entry: entry)
    }
    .configurationDisplayName("Ghostex")
    .description("Agents working and waiting for you, as of the app's last update.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct StatusEntry: TimelineEntry {
  let date: Date
  /// Nil before the app wrote one, or when it cannot be read: the widget shows its empty state.
  let snapshot: GhostexWidgetSnapshot?
}

struct StatusProvider: TimelineProvider {
  func placeholder(in context: Context) -> StatusEntry {
    StatusEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
    completion(StatusEntry(date: Date(), snapshot: Self.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
    let now = Date()
    let snapshot = Self.load()
    let dates = [now] + (snapshot?.resets(after: now) ?? [])
    completion(Timeline(entries: dates.map { StatusEntry(date: $0, snapshot: snapshot) }, policy: .never))
  }

  private static func load() -> GhostexWidgetSnapshot? {
    GhostexWidgetSnapshot.read(GhostexWidgetStore.snapshotURL().flatMap { try? Data(contentsOf: $0) })
  }
}
