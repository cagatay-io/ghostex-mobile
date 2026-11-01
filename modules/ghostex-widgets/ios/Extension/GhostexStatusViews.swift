import SwiftUI
import WidgetKit

// The approved widget mockup: small shows the counts of working and waiting agents, "Needs you"
// while one waits and the data time; medium adds three agents in two lines (name; state and project); large shows the
// counts in its head, then the agents (up to eight, as many as fit), each with its state and since when, the usage
// bars where there are any, and the data time. Every state colour comes with its glyph and word, so meaning survives
// the tinted Home Screen and StandBy at night, where colours go. The Live Activity's glyphs, agent marks and Ghostex
// mark are reused; the light appearance draws the states in the darker tones the app uses on light surfaces.

struct WidgetColors {
  let background: Color
  let text: Color
  let secondary: Color
  let line: Color
  let working: Color
  let waiting: Color
  let bar: Color
  let track: Color

  static func of(_ scheme: ColorScheme) -> WidgetColors {
    if scheme == .light {
      return WidgetColors(
        background: .white,
        text: Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1E / 255),
        secondary: Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.72),
        line: Color.black.opacity(0.08),
        working: Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255),
        waiting: Color(red: 0x03 / 255, green: 0x69 / 255, blue: 0xA1 / 255),
        bar: Color(red: 0x03 / 255, green: 0x69 / 255, blue: 0xA1 / 255),
        track: Color.black.opacity(0.08))
    }
    return WidgetColors(
      background: Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0B / 255),
      text: Color(red: 0xFA / 255, green: 0xFA / 255, blue: 0xFA / 255),
      secondary: ActivityStyle.finished,
      line: ActivityStyle.divider,
      working: ActivityStyle.working,
      waiting: ActivityStyle.waiting,
      bar: Color(red: 0x7D / 255, green: 0xD3 / 255, blue: 0xFC / 255),
      track: Color.white.opacity(0.1))
  }

  func color(_ state: GhostexWidgetSnapshot.State) -> Color {
    switch state {
    case .working: return working
    case .waiting: return waiting
    }
  }
}

extension ActivityStatus {
  init(widgetState state: GhostexWidgetSnapshot.State) {
    switch state {
    case .working: self = .working
    case .waiting: self = .waiting
    }
  }
}

struct StatusWidgetView: View {
  let entry: StatusEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let colors = WidgetColors.of(scheme)
    Group {
      if let snapshot = entry.snapshot {
        switch family {
        case .systemMedium: MediumStatus(snapshot: snapshot, colors: colors)
        case .systemLarge: LargeStatus(snapshot: snapshot, now: entry.date, colors: colors)
        default: SmallStatus(snapshot: snapshot, colors: colors)
        }
      } else {
        // Nothing written yet, or a snapshot this widget cannot read: no numbers rather than invented ones.
        GhostexMark().frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
    .foregroundStyle(colors.text)
    // Fixed widget sizes: larger text sizes would clip the rows.
    .dynamicTypeSize(...DynamicTypeSize.xLarge)
    .widgetBackground(colors.background)
  }
}

extension View {
  /// The widget's background; StandBy and the tinted Home Screen remove it (iOS 17 `containerBackground`).
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      padding().background(color)
    }
  }
}

struct DataTime: View {
  let writtenAt: Date
  let colors: WidgetColors

  var body: some View {
    Text("Updated \(Text(writtenAt, style: .time))")
      .font(.caption2)
      .monospacedDigit()
      .foregroundStyle(colors.secondary)
      .lineLimit(1)
  }
}

/// "Needs you" with a bell while an agent waits; nothing otherwise.
struct AttentionMarker: View {
  let colors: WidgetColors

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: "bell").fontWeight(.bold).accessibilityHidden(true)
      Text("Needs you")
    }
    .font(.caption2.weight(.bold))
    .foregroundStyle(colors.waiting)
    .lineLimit(1)
    .padding(.horizontal, 7)
    .frame(height: 20)
    .background(colors.waiting.opacity(0.18), in: Capsule())
    .widgetAccentable()
  }
}

/// A large count with its glyph and word below: the small widget and the medium widget's left side.
struct BigCount: View {
  let state: GhostexWidgetSnapshot.State
  let count: Int
  let colors: WidgetColors

  var body: some View {
    let status = ActivityStatus(widgetState: state)
    HStack(alignment: .center, spacing: 6) {
      Text("\(count)")
        .font(.system(size: 32, weight: .bold, design: .rounded))
        .monospacedDigit()
        .minimumScaleFactor(0.6)
        .widgetAccentable()
      HStack(spacing: 3) {
        StatusGlyph(status: status, size: 12, tint: colors.color(state))
          .widgetAccentable()
        Text(status.word)
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(colors.secondary)
    }
    .lineLimit(1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(count) \(Text(status.word))"))
  }
}

/// The small widget's content: mark and marker, the two counts, the data time.
struct SummaryColumn: View {
  let snapshot: GhostexWidgetSnapshot
  let colors: WidgetColors

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        GhostexMark()
        Spacer(minLength: 4)
        if snapshot.attention { AttentionMarker(colors: colors) }
      }
      Spacer(minLength: 2)
      VStack(alignment: .leading, spacing: 0) {
        BigCount(state: .working, count: snapshot.counts.working, colors: colors)
        BigCount(state: .waiting, count: snapshot.counts.waiting, colors: colors)
      }
      Spacer(minLength: 2)
      DataTime(writtenAt: snapshot.writtenAt, colors: colors)
    }
  }
}

struct SmallStatus: View {
  let snapshot: GhostexWidgetSnapshot
  let colors: WidgetColors

  var body: some View {
    SummaryColumn(snapshot: snapshot, colors: colors)
  }
}

/// The agent list's place when it has no row: "No agent is working or waiting." only when both counts are 0; with
/// counted agents that have no row the place stays empty and the counts speak.
struct EmptyAgents: View {
  let snapshot: GhostexWidgetSnapshot
  let colors: WidgetColors

  var body: some View {
    VStack(spacing: 6) {
      if snapshot.noAgentWorkingOrWaiting {
        Image(systemName: "checkmark.circle").font(.body).accessibilityHidden(true)
        Text("No agent is working or waiting.").font(.caption).multilineTextAlignment(.center)
      }
    }
    .foregroundStyle(colors.secondary)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// The state's glyph and word in the state's colour.
struct StateLabel: View {
  let state: GhostexWidgetSnapshot.State
  let colors: WidgetColors

  var body: some View {
    let status = ActivityStatus(widgetState: state)
    HStack(spacing: 3) {
      StatusGlyph(status: status, size: 11, tint: colors.color(state)).widgetAccentable()
      Text(status.word).fontWeight(.semibold)
    }
    .lineLimit(1)
  }
}

struct MediumStatus: View {
  let snapshot: GhostexWidgetSnapshot
  let colors: WidgetColors
  private let shownAgents = 3

  var body: some View {
    HStack(spacing: 12) {
      SummaryColumn(snapshot: snapshot, colors: colors)
        .frame(width: 124)
      Rectangle().fill(colors.line).frame(width: 1)
      if snapshot.agents.isEmpty {
        EmptyAgents(snapshot: snapshot, colors: colors)
      } else {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(snapshot.agents.prefix(shownAgents).enumerated()), id: \.offset) { _, agent in
            VStack(alignment: .leading, spacing: 2) {
              HStack(spacing: 6) {
                AgentMarkView(agentName: agent.agentName)
                Text(agent.agentName).font(.footnote.weight(.semibold))
              }
              HStack(spacing: 6) {
                StateLabel(state: agent.state, colors: colors)
                Text(agent.project).foregroundStyle(colors.secondary)
              }
              .font(.caption2)
              .padding(.leading, 24)
            }
            .lineLimit(1)
            .accessibilityElement(children: .combine)
            .frame(maxHeight: .infinity, alignment: .center)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

/// A count in the large widget's head: glyph, number and word on one line.
struct InlineCount: View {
  let state: GhostexWidgetSnapshot.State
  let count: Int
  let colors: WidgetColors

  var body: some View {
    let status = ActivityStatus(widgetState: state)
    HStack(spacing: 4) {
      StatusGlyph(status: status, size: 13, tint: colors.color(state))
        .widgetAccentable()
      Text("\(count)").font(.subheadline.weight(.bold)).monospacedDigit()
      Text(status.word).font(.footnote)
    }
    .lineLimit(1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(count) \(Text(status.word))"))
  }
}

struct LargeAgentRow: View {
  let agent: GhostexWidgetSnapshot.Agent
  let colors: WidgetColors

  var body: some View {
    HStack(spacing: 8) {
      AgentMarkView(agentName: agent.agentName)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(agent.agentName).font(.footnote.weight(.semibold)).layoutPriority(1)
        Text(agent.project).font(.caption).foregroundStyle(colors.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      StateLabel(state: agent.state, colors: colors).font(.caption)
      Text("since \(Text(agent.sinceAt, style: .time))")
        .font(.caption2)
        .monospacedDigit()
        .foregroundStyle(colors.secondary)
    }
    .lineLimit(1)
    .accessibilityElement(children: .combine)
  }
}

/// A bar's countdown to its reset: live where the system counts it (iOS 18), a timer before; gone once it passed.
struct ResetText: View {
  let resetsAt: Date
  let now: Date

  private static let units = Duration.UnitsFormatStyle(
    allowedUnits: [.days, .hours, .minutes], width: .narrow, maximumUnitCount: 2)

  var body: some View {
    if resetsAt > now {
      if #available(iOS 18.0, *) {
        Text("Resets \(Text(.durationOffset(to: resetsAt), format: Self.units))")
      } else {
        Text("Resets \(Text(timerInterval: now...resetsAt, countsDown: true))")
      }
    }
  }
}

struct UsageBars: View {
  let bars: [GhostexWidgetSnapshot.UsageBar]
  let now: Date
  let colors: WidgetColors

  var body: some View {
    LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible())], alignment: .leading, spacing: 6) {
      ForEach(Array(bars.enumerated()), id: \.offset) { _, bar in
        VStack(alignment: .leading, spacing: 3) {
          HStack {
            Text(bar.label)
            Spacer(minLength: 4)
            Text(bar.percentText).monospacedDigit()
          }
          .font(.caption2.weight(.semibold))
          GeometryReader { proxy in
            Capsule().fill(colors.track)
              .overlay(alignment: .leading) {
                Capsule().fill(colors.bar).frame(width: proxy.size.width * bar.usedPercent / 100).widgetAccentable()
              }
          }
          .frame(height: 5)
          if let resetsAt = bar.resetsAt {
            ResetText(resetsAt: resetsAt, now: now).font(.caption2).foregroundStyle(colors.secondary)
          }
        }
        .lineLimit(1)
        .accessibilityElement(children: .combine)
      }
    }
  }
}

struct LargeStatus: View {
  let snapshot: GhostexWidgetSnapshot
  /// The timeline entry's date: a reset that passed by then shows no countdown.
  let now: Date
  let colors: WidgetColors
  private let rowHeight: CGFloat = 24

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 10) {
        GhostexMark()
        InlineCount(state: .working, count: snapshot.counts.working, colors: colors)
        InlineCount(state: .waiting, count: snapshot.counts.waiting, colors: colors)
        Spacer(minLength: 4)
        if snapshot.attention { AttentionMarker(colors: colors) }
      }
      if snapshot.agents.isEmpty {
        EmptyAgents(snapshot: snapshot, colors: colors)
      } else {
        // As many of the (at most eight) agents as the space leaves room for.
        GeometryReader { proxy in
          let fitting = max(1, Int(proxy.size.height / rowHeight))
          VStack(spacing: 0) {
            ForEach(Array(snapshot.agents.prefix(fitting).enumerated()), id: \.offset) { index, agent in
              LargeAgentRow(agent: agent, colors: colors)
                .frame(height: rowHeight)
                .overlay(alignment: .top) {
                  if index > 0 { Rectangle().fill(colors.line).frame(height: 1) }
                }
            }
          }
        }
      }
      if !snapshot.usageBars.isEmpty {
        Rectangle().fill(colors.line).frame(height: 1)
        UsageBars(bars: snapshot.usageBars, now: now, colors: colors)
      }
      HStack {
        Spacer()
        DataTime(writtenAt: snapshot.writtenAt, colors: colors)
      }
    }
  }
}
