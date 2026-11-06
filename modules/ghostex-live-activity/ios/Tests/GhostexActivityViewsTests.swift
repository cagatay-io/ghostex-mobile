import SwiftUI
import XCTest

@testable import GhostexLiveActivityModel
@testable import GhostexLiveActivityViews

/// The minimal island shows the counts of working and waiting agents, also in the 28 pt width-limited circle.
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
}
