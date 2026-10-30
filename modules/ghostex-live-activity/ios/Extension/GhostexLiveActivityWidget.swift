import ActivityKit
import SwiftUI
import WidgetKit

/// The widget extension `plugins/withLiveActivity.js` adds to the app: the presentations of the one Ghostex
/// Live Activity (REQ-LIVEACT-008). The app starts and updates it (`GhostexLiveActivityModule.swift`); the
/// extension only renders the content state it is given and never reaches the network.
@main
struct GhostexLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    GhostexLiveActivityWidget()
  }
}

struct GhostexLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: GhostexActivityAttributes.self) { context in
      LockScreenCard(content: context.state, isStale: context.isStale)
        .activityBackgroundTint(ActivityStyle.surface)
        .activitySystemActionForegroundColor(ActivityStyle.text)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          CountLabel(kind: .working, count: context.state.counts.working, showsWord: true)
            .padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          CountLabel(kind: .waiting, count: context.state.counts.waiting, showsWord: true)
            .padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ExpandedRows(content: context.state, isStale: context.isStale)
        }
      } compactLeading: {
        CompactCount(kind: .working, count: context.state.counts.working, isStale: context.isStale)
      } compactTrailing: {
        CompactCount(kind: .waiting, count: context.state.counts.waiting, isStale: context.isStale)
      } minimal: {
        MinimalCounts(counts: context.state.counts, isStale: context.isStale)
      }
      .keylineTint(ActivityStyle.waiting)
    }
  }
}
