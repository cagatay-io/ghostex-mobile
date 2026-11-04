import Foundation

/// The widget snapshot (format version 2) as the widgets read it. The app writes it after each
/// session refresh (`src/notifications/widgetSnapshot.ts`); it carries agent identity, tint, project, state and times,
/// no prompt, reply or title text. Any other version, a missing or an unreadable file, and an agent in a state other than
/// working or waiting read as nil: the widget then shows its empty state, never placeholder values.
///
/// Compiled into the widget extension next to the Live Activity's `Shared/` files, whose counts and ISO time parsing
/// (`ActivityTime`, which takes the app's milliseconds) it reuses.
struct GhostexWidgetSnapshot: Decodable, Hashable {
  static let version = 2

  /// What the widgets count and list: finished agents are in neither, so a snapshot has no third state.
  enum State: String, Decodable, Hashable {
    case working
    case waiting
  }

  struct Agent: Decodable, Hashable {
    let agentName: String
    /// Resolved artwork identity and packed RGB tint from the app, never inferred from the display name.
    let agentIcon: String
    let agentTint: UInt32
    let project: String
    let state: State
    /// Working: since the stint began; waiting: since the agent waits.
    let sinceAt: Date

    private enum CodingKeys: String, CodingKey { case agentName, agentIcon, agentTint, project, state, sinceAt }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      agentName = try container.decode(String.self, forKey: .agentName)
      agentIcon = try container.decode(String.self, forKey: .agentIcon)
      agentTint = try container.decode(UInt32.self, forKey: .agentTint)
      project = try container.decode(String.self, forKey: .project)
      state = try container.decode(State.self, forKey: .state)
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
