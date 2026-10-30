import SwiftUI
import WidgetKit

// The extension compiles `Shared/` into its own module; the Swift test package (`Package.swift`) has it as a
// separate module.
#if canImport(GhostexLiveActivityModel)
  import GhostexLiveActivityModel
#endif

// The approved mockup `mockups/live-activity` (D-037): state colours of the session list (orange works, blue
// waits, pink asks, muted finished), always with a glyph and a word so colour never carries meaning alone;
// rows of the agent's mark, agent + project (D-037 item 2); four rows within Apple's 160 pt Lock Screen height.

enum ActivityStyle {
  static let working = Color(red: 0xC6 / 255, green: 0x8A / 255, blue: 0x06 / 255)
  static let waiting = Color(red: 0x95 / 255, green: 0xD7 / 255, blue: 0xF6 / 255)
  static let question = Color(red: 0xF4 / 255, green: 0x72 / 255, blue: 0xB6 / 255)
  static let finished = Color(red: 0xB5 / 255, green: 0xB5 / 255, blue: 0xB5 / 255)
  static let text = Color.white
  static let secondaryText = Color.white.opacity(0.72)
  static let divider = Color.white.opacity(0.08)
  static let surface = Color(red: 12 / 255, green: 12 / 255, blue: 14 / 255).opacity(0.74)
  /// 29 pt rows keep header and four rows under the 160 pt Lock Screen limit.
  static let rowHeight: CGFloat = 29
  /// Width of the time column: `12h 59m`, or `1:02:03` of the timer before iOS 18, at caption size.
  static let timeWidth: CGFloat = 52
}

/// What a row or a count shows: the agent's state, with "has a question" for a waiting agent that asks one.
enum ActivityStatus {
  case working
  case waiting
  case question
  case finished

  init(_ row: GhostexActivityRow) {
    switch row.state {
    case .working: self = .working
    case .waiting: self = row.asksQuestion ? .question : .waiting
    case .finished: self = .finished
    }
  }

  var word: LocalizedStringKey {
    switch self {
    case .working: return "working"
    case .waiting: return "waiting"
    case .question: return "has a question"
    case .finished: return "finished"
    }
  }

  var color: Color {
    switch self {
    case .working: return ActivityStyle.working
    case .waiting: return ActivityStyle.waiting
    case .question: return ActivityStyle.question
    case .finished: return ActivityStyle.finished
    }
  }
}

/// The "working" glyph: an open three-quarter ring, the shape the limited-width circle reuses.
struct WorkingArc: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let radius = min(rect.width, rect.height) / 2
    path.addArc(
      center: CGPoint(x: rect.midX, y: rect.midY), radius: radius,
      startAngle: .degrees(-90), endAngle: .degrees(180), clockwise: false)
    return path
  }
}

struct StatusGlyph: View {
  let status: ActivityStatus
  let size: CGFloat

  var body: some View {
    Group {
      switch status {
      case .working:
        WorkingArc()
          .stroke(status.color, style: StrokeStyle(lineWidth: max(1.5, size / 6.5), lineCap: .round))
          .frame(width: size * 0.78, height: size * 0.78)
          .frame(width: size, height: size)
      case .waiting:
        Image(systemName: "clock").font(.system(size: size, weight: .semibold)).foregroundStyle(status.color)
      case .question:
        Image(systemName: "questionmark.circle").font(.system(size: size, weight: .semibold))
          .foregroundStyle(status.color)
      case .finished:
        Image(systemName: "checkmark.circle").font(.system(size: size, weight: .semibold))
          .foregroundStyle(status.color)
      }
    }
    .accessibilityHidden(true)
  }
}

/// "2 working" / "1 waiting", or only glyph and number where the words do not fit.
struct CountLabel: View {
  let kind: ActivityStatus
  let count: Int
  let showsWord: Bool

  var body: some View {
    HStack(spacing: 4) {
      StatusGlyph(status: kind, size: 13)
      Text("\(count)").fontWeight(.bold).monospacedDigit()
      if showsWord {
        Text(kind.word)
      }
    }
    .font(.footnote)
    .lineLimit(1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(count) \(Text(kind.word))"))
  }
}

/// Time in the row's state, in minutes as the approved mockup shows it ("4m", "1h 2m"). A working or waiting row
/// counts on from `startedAt` by itself while the content is current (iOS 18: the system's `TimeDataSource`;
/// iOS 16.4–17 have no live minute format, so they count as a `m:ss` timer) and stops at the data time once the
/// content is not current (REQ-LIVEACT-007). A finished row says how long the agent worked, from `startedAt` to
/// `finishedAt`, and does not change.
struct ElapsedText: View {
  let row: GhostexActivityRow
  /// The data time when the content is past its stale date; nil while it is current.
  let frozenAt: Date?

  private static let minutes = Date.ComponentsFormatStyle(style: .narrow, fields: [.hour, .minute])

  var body: some View {
    if row.state == .finished, let finishedAt = row.finishedAt {
      Text(Self.minutes.format(row.startedAt..<max(row.startedAt, finishedAt)))
    } else if let frozenAt {
      Text(Self.minutes.format(row.startedAt..<max(row.startedAt, frozenAt)))
    } else if #available(iOS 18.0, *) {
      Text(.dateRange(startingAt: row.startedAt), format: Self.minutes)
    } else {
      Text(timerInterval: row.startedAt...Date.distantFuture, countsDown: false)
        .monospacedDigit()
    }
  }
}

struct ActivityRowView: View {
  let row: GhostexActivityRow
  let frozenAt: Date?

  var body: some View {
    let status = ActivityStatus(row)
    HStack(spacing: 8) {
      AgentMarkView(agentName: row.agentName)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(row.agentName)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(row.state == .finished ? ActivityStyle.secondaryText : ActivityStyle.text)
          .layoutPriority(1)
        Text(row.project)
          .font(.footnote)
          .foregroundStyle(ActivityStyle.secondaryText)
      }
      .lineLimit(1)
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 4) {
        StatusGlyph(status: status, size: 12)
        Text(status.word).fontWeight(.semibold)
      }
      .font(.caption)
      .lineLimit(1)
      ElapsedText(row: row, frozenAt: frozenAt)
        .font(.caption)
        .foregroundStyle(ActivityStyle.secondaryText)
        .lineLimit(1)
        // A live time text takes the whole column; this keeps it at the right edge like the frozen one.
        .multilineTextAlignment(.trailing)
        .frame(width: ActivityStyle.timeWidth, alignment: .trailing)
    }
    .frame(height: ActivityStyle.rowHeight)
    .accessibilityElement(children: .combine)
    .accessibilityHint(Text("Opens this session"))
  }
}

/// A row that opens its session (REQ-LIVEACT-009): the target's ids, never the name.
struct ActivityRowLink: View {
  let row: GhostexActivityRow
  let frozenAt: Date?
  let isFirst: Bool

  var body: some View {
    Group {
      if let url = row.target.deepLink {
        Link(destination: url) { ActivityRowView(row: row, frozenAt: frozenAt) }
      } else {
        ActivityRowView(row: row, frozenAt: frozenAt)
      }
    }
    .overlay(alignment: .top) {
      if !isFirst {
        Rectangle().fill(ActivityStyle.divider).frame(height: 1)
      }
    }
  }
}

struct ActivityRows: View {
  let rows: [GhostexActivityRow]
  /// The data time when the content is past its stale date: the rows' times stop there.
  let frozenAt: Date?

  var body: some View {
    VStack(spacing: 0) {
      ForEach(rows, id: \.target) { row in
        ActivityRowLink(row: row, frozenAt: frozenAt, isFirst: row.target == rows.first?.target)
      }
    }
  }
}

struct NotCurrentLabel: View {
  let updatedAt: Date

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
      Text("Not current · \(Text(updatedAt, style: .time))")
    }
    .fontWeight(.semibold)
    .lineLimit(1)
  }
}

struct GhostexMark: View {
  var body: some View {
    Image("GhostexMark")
      .resizable()
      .frame(width: 16, height: 16)
      .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
      .accessibilityLabel(Text("Ghostex"))
  }
}

/// The Lock Screen presentation (REQ-LIVEACT-008 AC4/AC5): counts, then up to four rows; past its stale date
/// it says how old it is and dims the rows (REQ-LIVEACT-007).
struct LockScreenCard: View {
  let content: GhostexActivityContent
  let isStale: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 10) {
        GhostexMark()
        if isStale {
          NotCurrentLabel(updatedAt: content.updatedAt)
          Spacer(minLength: 4)
          CountLabel(kind: .working, count: content.counts.working, showsWord: false)
          CountLabel(kind: .waiting, count: content.counts.waiting, showsWord: false)
          if content.moreCount > 0 {
            Text("+\(content.moreCount)").foregroundStyle(ActivityStyle.secondaryText)
          }
        } else {
          CountLabel(kind: .working, count: content.counts.working, showsWord: true)
          CountLabel(kind: .waiting, count: content.counts.waiting, showsWord: true)
          Spacer(minLength: 4)
          if content.moreCount > 0 {
            Text("+\(content.moreCount) more").fontWeight(.semibold).foregroundStyle(ActivityStyle.secondaryText)
          }
        }
      }
      .font(.footnote)
      .frame(minHeight: 20)
      if content.agents.isEmpty {
        Text("No agent is working or waiting")
          .font(.footnote)
          .foregroundStyle(ActivityStyle.secondaryText)
      } else {
        ActivityRows(rows: content.agents, frozenAt: isStale ? content.updatedAt : nil)
          .opacity(isStale ? 0.5 : 1)
      }
    }
    .foregroundStyle(ActivityStyle.text)
    .padding(.horizontal, 14)
    .padding(.top, 10)
    .padding(.bottom, 6)
    // The Lock Screen presentation is at most 160 pt tall; larger text sizes would push rows out of it.
    .dynamicTypeSize(...DynamicTypeSize.xLarge)
  }
}

/// The expanded Dynamic Island's bottom (REQ-LIVEACT-008 AC3): the first two rows and how many more there are.
struct ExpandedRows: View {
  let content: GhostexActivityContent
  let isStale: Bool
  private let shownRows = 2

  var body: some View {
    let rows = Array(content.agents.prefix(shownRows))
    let hidden = content.agents.count + content.moreCount - rows.count
    VStack(spacing: 2) {
      ActivityRows(rows: rows, frozenAt: isStale ? content.updatedAt : nil)
        .opacity(isStale ? 0.5 : 1)
      HStack {
        if isStale {
          NotCurrentLabel(updatedAt: content.updatedAt)
        } else {
          Text("Ghostex").fontWeight(.semibold)
        }
        Spacer(minLength: 4)
        if hidden > 0 {
          Text("+\(hidden) more").fontWeight(.semibold)
        }
      }
      .font(.caption)
      .foregroundStyle(ActivityStyle.secondaryText)
      // The island's bottom corners are round: inset the footer so its ends stay inside them (mockup).
      .padding(.horizontal, 8)
      .padding(.bottom, 4)
    }
    .foregroundStyle(ActivityStyle.text)
    .dynamicTypeSize(...DynamicTypeSize.xLarge)
  }
}

/// Count inside a 28 pt circle for a width-limited island (iOS 27, iPhone Duo; FL-DUO-10): an open arc for
/// working, a closed ring for waiting, so the shape tells them apart, not only the colour.
struct RingCount: View {
  let kind: ActivityStatus
  let count: Int

  var body: some View {
    ZStack {
      if kind == .working {
        WorkingArc().stroke(kind.color, style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
      } else {
        Circle().stroke(kind.color, lineWidth: 2.6)
      }
      Text("\(count)")
        .font(.system(size: 12, weight: .bold))
        .monospacedDigit()
        .minimumScaleFactor(0.6)
        .foregroundStyle(ActivityStyle.text)
    }
    .padding(1.3)
    .frame(width: 28, height: 28)
  }
}

/// Passes `isDynamicIslandLimitedInWidth` (iOS 27) to its content; false where the system has no such state.
struct IslandWidthReader<Content: View>: View {
  @ViewBuilder let content: (Bool) -> Content

  var body: some View {
    #if canImport(UIKit, _version: 9127.0.85)
      if #available(iOS 27.0, *) {
        LimitedWidthEnvironment(content: content)
      } else {
        content(false)
      }
    #else
      content(false)
    #endif
  }
}

#if canImport(UIKit, _version: 9127.0.85)
  @available(iOS 27.0, *)
  private struct LimitedWidthEnvironment<Content: View>: View {
    @Environment(\.isDynamicIslandLimitedInWidth) private var limited
    let content: (Bool) -> Content

    var body: some View {
      content(limited)
    }
  }
#endif

/// One side of the compact island (REQ-LIVEACT-008 AC1): working on the leading side, waiting on the trailing.
struct CompactCount: View {
  let kind: ActivityStatus
  let count: Int
  let isStale: Bool

  var body: some View {
    IslandWidthReader { limited in
      if limited {
        RingCount(kind: kind, count: count)
      } else {
        HStack(spacing: 5) {
          StatusGlyph(status: kind, size: 15)
          Text("\(count)").font(.system(size: 15, weight: .bold)).monospacedDigit()
        }
        .foregroundStyle(ActivityStyle.text)
      }
    }
    .opacity(isStale ? 0.5 : 1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(count) \(Text(kind.word))"))
  }
}

/// What the minimal island draws: both counts, working above waiting, each line its state's glyph and number
/// (REQ-LIVEACT-008 AC2; the approved mockup's minimal circle). In the 28 pt circle of a width-limited island
/// (iOS 27, iPhone Duo) the same two lines are drawn smaller, so neither count is dropped there.
struct MinimalLayout: Equatable {
  struct Line: Equatable {
    let kind: ActivityStatus
    let count: Int
  }

  let lines: [Line]
  /// Glyph and number size, in points.
  let glyphSize: CGFloat
  let fontSize: CGFloat

  static func of(_ counts: GhostexActivityCounts, limitedWidth: Bool) -> MinimalLayout {
    MinimalLayout(
      lines: [Line(kind: .working, count: counts.working), Line(kind: .waiting, count: counts.waiting)],
      glyphSize: limitedWidth ? 7 : 9, fontSize: limitedWidth ? 9.5 : 11)
  }
}

/// The lines of a `MinimalLayout`, each its state's glyph and its number.
struct StackedCounts: View {
  let layout: MinimalLayout

  var body: some View {
    VStack(spacing: 0) {
      ForEach(layout.lines, id: \.kind) { line in
        HStack(spacing: 2) {
          StatusGlyph(status: line.kind, size: layout.glyphSize)
          Text("\(line.count)").font(.system(size: layout.fontSize, weight: .bold)).monospacedDigit()
        }
      }
    }
    .lineLimit(1)
    .foregroundStyle(ActivityStyle.text)
  }
}

/// The minimal island (REQ-LIVEACT-008 AC2): both counts stacked, each with its glyph.
struct MinimalCounts: View {
  let counts: GhostexActivityCounts
  let isStale: Bool

  var body: some View {
    IslandWidthReader { limited in
      let layout = MinimalLayout.of(counts, limitedWidth: limited)
      if limited {
        StackedCounts(layout: layout)
          .minimumScaleFactor(0.6)
          .frame(width: 28, height: 28)
      } else {
        StackedCounts(layout: layout)
      }
    }
    .opacity(isStale ? 0.5 : 1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(counts.working) working, \(counts.waiting) waiting"))
  }
}
