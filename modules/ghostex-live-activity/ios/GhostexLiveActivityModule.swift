import ActivityKit
import ExpoModulesCore

/// Starts, updates and ends the one Ghostex Live Activity for `src/notifications/liveActivity.ts`. The
/// views live in the widget extension (`Extension/`); both sides share `Shared/GhostexActivityAttributes.swift`.
///
/// No call passes an `AlertConfiguration`: the activity updates silently, the notification carries the sound.
/// No push token is requested: the app updates the activity itself.
public final class GhostexLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GhostexLiveActivity")

    // Reads ActivityKit's in-process list; no I/O.
    Function("hasActivity") { () -> Bool in
      !Self.liveActivities().isEmpty
    }

    AsyncFunction("start") { (stateJson: String, staleDateMs: Double) async throws in
      let content = try Self.content(stateJson, staleDateMs)
      if let activity = Self.liveActivities().first {
        await activity.update(content)
        return
      }
      do {
        _ = try Activity.request(attributes: GhostexActivityAttributes(), content: content, pushType: nil)
      } catch {
        throw LiveActivityRequestException(error.localizedDescription)
      }
    }

    AsyncFunction("update") { (stateJson: String, staleDateMs: Double) async throws in
      let content = try Self.content(stateJson, staleDateMs)
      // One activity per phone: any other one, left from an earlier run, is ended.
      for (index, activity) in Self.liveActivities().enumerated() {
        if index == 0 {
          await activity.update(content)
        } else {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }

    AsyncFunction("end") { () async in
      for activity in Activity<GhostexActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  /// Activities that are on screen: neither ended nor dismissed.
  private static func liveActivities() -> [Activity<GhostexActivityAttributes>] {
    Activity<GhostexActivityAttributes>.activities.filter { $0.activityState == .active || $0.activityState == .stale }
  }

  private static func content(_ stateJson: String, _ staleDateMs: Double) throws -> ActivityContent<GhostexActivityContent> {
    let state: GhostexActivityContent
    do {
      state = try JSONDecoder().decode(GhostexActivityContent.self, from: Data(stateJson.utf8))
    } catch {
      throw InvalidLiveActivityStateException(String(describing: error))
    }
    let fitted: GhostexActivityContent
    do {
      fitted = try state.fitted(with: GhostexActivityAttributes())
    } catch {
      throw InvalidLiveActivityStateException(String(describing: error))
    }
    return ActivityContent(state: fitted, staleDate: Date(timeIntervalSince1970: staleDateMs / 1000))
  }
}

final class InvalidLiveActivityStateException: GenericException<String> {
  override var reason: String {
    "The Live Activity content state is not valid: \(param)"
  }
}

final class LiveActivityRequestException: GenericException<String> {
  override var reason: String {
    "iOS did not start the Live Activity: \(param)"
  }
}
