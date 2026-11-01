import Foundation

/// The widget snapshot (`widget-snapshot.schema.json`, version 1) as the widgets read it. The app writes it after each
/// session refresh (`src/notifications/widgetSnapshot.ts`); it carries agent, project, state and times only, no prompt,
/// reply or title text. Any other version, a missing or an unreadable file reads as nil: the widget then shows its
/// empty state, never placeholder values.
///
/// Compiled into the widget extension next to the Live Activity's `Shared/` files, whose counts, agent state and ISO
/// time parsing (`ActivityTime`, which takes the app's milliseconds) it reuses.
struct GhostexWidgetSnapshot: Decodable, Hashable {
  static let version = 1

  struct Agent: Decodable, Hashable {
    let agentName: String
    let project: String
    let state: GhostexAgentState
    /// Working: since the stint began; waiting: since the agent waits.
    let sinceAt: Date

    private enum CodingKeys: String, CodingKey { case agentName, project, state, sinceAt }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      agentName = try container.decode(String.self, forKey: .agentName)
      project = try container.decode(String.self, forKey: .project)
      state = try container.decode(GhostexAgentState.self, forKey: .state)
      sinceAt = try ActivityTime.decode(container, .sinceAt)
    }
  }

  struct UsageBar: Decodable, Hashable {
    let label: String
    /// 0 to 100.
    let usedPercent: Double
    let resetsAt: Date?

    private enum CodingKeys: String, CodingKey { case label, usedPercent, resetsAt }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      label = try container.decode(String.self, forKey: .label)
      usedPercent = min(100, max(0, try container.decode(Double.self, forKey: .usedPercent)))
      resetsAt = try ActivityTime.decodeIfPresent(container, .resetsAt)
    }

    /// As the usage pane writes it: the rounded percent.
    var percentText: String { "\(Int(usedPercent.rounded()))%" }
  }

  /// The data time: when the oldest summary behind the snapshot was read.
  let writtenAt: Date
  let counts: GhostexActivityCounts
  /// An agent waits for the user.
  let attention: Bool
  /// Waiting first, at most eight.
  let agents: [Agent]
  /// Empty without usage data: the large widget then shows no bars.
  let usageBars: [UsageBar]

  private enum CodingKeys: String, CodingKey { case schemaVersion, writtenAt, counts, attention, agents, usage }
  private enum UsageKeys: String, CodingKey { case bars }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let version = try container.decode(Int.self, forKey: .schemaVersion)
    guard version == Self.version else {
      throw DecodingError.dataCorruptedError(
        forKey: .schemaVersion, in: container, debugDescription: "Unknown widget snapshot version \(version)")
    }
    writtenAt = try ActivityTime.decode(container, .writtenAt)
    counts = try container.decode(GhostexActivityCounts.self, forKey: .counts)
    attention = try container.decode(Bool.self, forKey: .attention)
    agents = try container.decode([Agent].self, forKey: .agents)
    if container.contains(.usage) {
      usageBars = try container.nestedContainer(keyedBy: UsageKeys.self, forKey: .usage).decode([UsageBar].self, forKey: .bars)
    } else {
      usageBars = []
    }
  }

  /// The snapshot in `data`, or nil when there is none or it cannot be read.
  static func read(_ data: Data?) -> GhostexWidgetSnapshot? {
    data.flatMap { try? JSONDecoder().decode(Self.self, from: $0) }
  }

  /// No agent works or waits: only then may a widget say so. Counted agents can have no row (a computer that sends
  /// no start time, an approval without a time), so an empty agent list alone does not mean it.
  var noAgentWorkingOrWaiting: Bool { counts.working == 0 && counts.waiting == 0 }

  /// The shown resets still to come after `date`, in order: the timeline's later entries, at which a passed reset
  /// leaves its bar's label.
  func resets(after date: Date) -> [Date] {
    Array(Set(usageBars.compactMap(\.resetsAt).filter { $0 > date })).sorted()
  }
}
