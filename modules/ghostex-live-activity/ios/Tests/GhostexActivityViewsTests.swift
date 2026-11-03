import SwiftUI
import XCTest

@testable import GhostexLiveActivityModel
@testable import GhostexLiveActivityViews

/// The minimal island shows the counts of working and waiting agents, also in the 28 pt width-limited circle, and
/// the agent mark at the start of a row (the design): resolved by name as the app's session list does, unknown
/// names neutral.
@MainActor
final class GhostexActivityViewsTests: XCTestCase {
  private typealias Line = MinimalLayout.Line

  /// Both counts, in both widths, also when one of them is 0.
  func testMinimalShowsBothCountsInBothWidths() {
    for (working, waiting) in [(4, 2), (4, 0), (0, 2), (12, 7)] {
      let counts = GhostexActivityCounts(working: working, waiting: waiting)
      for limited in [false, true] {
        XCTAssertEqual(
          MinimalLayout.of(counts, limitedWidth: limited).lines,
          [Line(kind: .working, count: working), Line(kind: .waiting, count: waiting)],
          "\(working) working, \(waiting) waiting, limited width \(limited)")
      }
    }
  }

  /// In the 28 pt circle: two-digit counts fit the circle's 28 pt frame at their
  /// own size, without being scaled down.
  func testLimitedWidthMinimalFitsItsFrame() throws {
    let layout = MinimalLayout.of(GhostexActivityCounts(working: 88, waiting: 88), limitedWidth: true)
    let renderer = ImageRenderer(content: StackedCounts(layout: layout))
    renderer.scale = 3
    let image = try XCTUnwrap(renderer.uiImage)
    XCTAssertLessThanOrEqual(image.size.width, 28, "width \(image.size.width)")
    XCTAssertLessThanOrEqual(image.size.height, 28, "height \(image.size.height)")
  }

  /// The row's agent mark: the name branch of the app's `resolveAgentArtId`.
  func testAgentMarkResolvesNamesAsTheApp() {
    XCTAssertEqual(AgentMark.id(forAgentName: "Claude Code"), "claude", "alias, any case")
    XCTAssertEqual(AgentMark.id(forAgentName: "Claude (cloud)"), "claude-cloud", "the Claude (cloud) agent's cloud")
    XCTAssertEqual(AgentMark.id(forAgentName: "  droid \n"), "factory-droid", "alias, trimmed")
    XCTAssertEqual(AgentMark.id(forAgentName: "empryo"), "empryo", "a name that is an icon id")
    XCTAssertEqual(AgentMark.id(forAgentName: "aider"), "terminal", "unknown name: the neutral mark")
    XCTAssertEqual(AgentMark.id(forAgentName: ""), "terminal", "no name: the neutral mark")
    XCTAssertEqual(AgentMark.neutral, "terminal")
    XCTAssertNotNil(AgentMark.tints[AgentMark.neutral], "the neutral mark has its own tint")
  }
}
