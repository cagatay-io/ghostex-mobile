import XCTest

@testable import GhostexLiveActivityModel

/// REQ-LIVEACT-001 AC12/AC13 (the 4 KB budget of attributes plus content state, measured on the real types
/// with JSON escaping), REQ-LIVEACT-009 AC1 (the row link, the same literals as `src/app/deepLinks.test.ts`)
/// and REQ-LIVEACT-002 AC1/AC2 / REQ-LIVEACT-011 AC6 on the decoding side (schema instances).
final class GhostexActivityContentTests: XCTestCase {
  /// 64 characters cycling through the worst encodings: a quote (2 bytes escaped), a backslash (2), a control
  /// character (6 as `\u0001`) and a four-byte character (4).
  private static let worstName: String = {
    let pieces = ["\"", "\\", "\u{01}", "\u{1F916}"]
    return (0..<64).map { pieces[$0 % pieces.count] }.joined()
  }()

  /// 64 bytes of printable ASCII (the schema's id pattern) that JSON escapes: quote, backslash, slash.
  private static let worstId: String = {
    let pieces = ["\"", "\\", "/"]
    return (0..<64).map { pieces[$0 % pieces.count] }.joined()
  }()

  /// Four rows of the largest kind (finished: three times) with worst-case names, projects and ids.
  private static func worstCase() -> GhostexActivityContent {
    let start = Date(timeIntervalSince1970: 1_793_000_000.123)
    let rows = (0..<4).map { index in
      GhostexActivityRow(
        target: GhostexActivityTarget(machineId: worstId, sessionId: String(worstId.dropLast()) + "\(index)"),
        agentName: worstName,
        project: worstName,
        state: .finished,
        startedAt: start,
        finishedAt: start.addingTimeInterval(600),
        expiresAt: start.addingTimeInterval(720)
      )
    }
    return GhostexActivityContent(
      updatedAt: start.addingTimeInterval(650), counts: GhostexActivityCounts(working: 999, waiting: 999),
      agents: rows, moreCount: 9_999)
  }

  func testWorstCaseFitsTheBudget_REQ_LIVEACT_001_AC12() throws {
    let content = Self.worstCase()
    XCTAssertEqual(Self.worstName.count, 64)
    XCTAssertEqual(Self.worstId.utf8.count, 64)
    let raw = try GhostexActivityContent.encodedSize(content, with: GhostexActivityAttributes())
    let fitted = try content.fitted(with: GhostexActivityAttributes())
    let size = try GhostexActivityContent.encodedSize(fitted, with: GhostexActivityAttributes())
    print("REQ-LIVEACT-001 AC12: worst case \(raw) bytes with 4 rows; fitted \(size) bytes with \(fitted.agents.count) rows")
    XCTAssertLessThanOrEqual(size, 4096)
    // What the fitter keeps is the front of the list; what it drops is counted.
    XCTAssertEqual(fitted.agents, Array(content.agents.prefix(fitted.agents.count)))
    XCTAssertEqual(fitted.moreCount, content.moreCount + content.agents.count - fitted.agents.count)
  }

  /// Static attributes enlarged for the test (the real attributes carry nothing), so that four rows exceed 4 KB.
  private struct EnlargedAttributes: Encodable {
    let padding = String(repeating: "a", count: 3_200)
  }

  func testOverBudgetDropsRowsFromTheEndAndRaisesMoreCount_REQ_LIVEACT_001_AC13() throws {
    let start = Date(timeIntervalSince1970: 1_793_000_000)
    let rows = (0..<4).map { index in
      GhostexActivityRow(
        target: GhostexActivityTarget(machineId: "m1", sessionId: "s\(index)"),
        agentName: String(repeating: "n", count: 64), project: String(repeating: "p", count: 64),
        state: .working, startedAt: start)
    }
    let content = GhostexActivityContent(
      updatedAt: start, counts: GhostexActivityCounts(working: 6, waiting: 0), agents: rows, moreCount: 2)
    let attributes = EnlargedAttributes()
    XCTAssertGreaterThan(try GhostexActivityContent.encodedSize(content, with: attributes), 4096)

    let fitted = try content.fitted(with: attributes)
    XCTAssertLessThanOrEqual(try GhostexActivityContent.encodedSize(fitted, with: attributes), 4096)
    XCTAssertLessThan(fitted.agents.count, 4)
    XCTAssertEqual(fitted.agents.map(\.target.sessionId), Array(["s0", "s1", "s2", "s3"].prefix(fitted.agents.count)))
    XCTAssertEqual(fitted.moreCount, 2 + 4 - fitted.agents.count)
    XCTAssertEqual(fitted.counts, content.counts)
    // Only as many rows as needed are dropped: one row more would not fit.
    var oneMore = fitted
    oneMore.agents = Array(rows.prefix(fitted.agents.count + 1))
    XCTAssertGreaterThan(try GhostexActivityContent.encodedSize(oneMore, with: attributes), 4096)
  }

  func testRowLinkNamesExactlyItsSession_REQ_LIVEACT_009_AC1() {
    let second = GhostexActivityTarget(machineId: "f3b2c1d0-1111-4222-8333-944445555666", sessionId: "sess&2")
    XCTAssertEqual(
      second.deepLink?.absoluteString,
      "ghostex://session?machineId=f3b2c1d0-1111-4222-8333-944445555666&sessionId=sess%262")
    XCTAssertEqual(
      GhostexActivityTarget(machineId: "m1", sessionId: "sess&1").deepLink?.absoluteString,
      "ghostex://session?machineId=m1&sessionId=sess%261")
    XCTAssertEqual(
      GhostexActivityTarget(machineId: "a#b=c", sessionId: "x+y%z?w/").deepLink?.absoluteString,
      "ghostex://session?machineId=a%23b%3Dc&sessionId=x%2By%25z%3Fw%2F")
  }

  /// `schemas/instances/live-activity-content-state.valid-6.json` (a question, a working and a finished row).
  private static let schemaInstance = """
    {"updatedAt":"2026-10-24T10:42:00Z","counts":{"working":1,"waiting":1},"agents":[\
    {"target":{"machineId":"m1","sessionId":"s1"},"agentName":"a","project":"p1","state":"waiting",\
    "startedAt":"2026-10-24T10:30:00Z","hasQuestion":true},\
    {"target":{"machineId":"m1","sessionId":"s2"},"agentName":"b","project":"p2","state":"working",\
    "startedAt":"2026-10-24T10:30:00Z"},\
    {"target":{"machineId":"m1","sessionId":"s3"},"agentName":"c","project":"p3","state":"finished",\
    "startedAt":"2026-10-24T10:30:00Z","finishedAt":"2026-10-24T10:41:00Z","expiresAt":"2026-10-24T10:43:00Z"}],\
    "moreCount":0}
    """

  func testSchemaInstanceDecodesAndRoundTrips_REQ_LIVEACT_002_AC1() throws {
    let content = try JSONDecoder().decode(GhostexActivityContent.self, from: Data(Self.schemaInstance.utf8))
    XCTAssertEqual(content.agents.map(\.state), [.waiting, .working, .finished])
    XCTAssertTrue(content.agents[0].asksQuestion)
    XCTAssertFalse(content.agents[1].asksQuestion)
    XCTAssertEqual(content.agents[2].expiresAt, ActivityTime.parse("2026-10-24T10:43:00Z"))
    let again = try JSONDecoder().decode(GhostexActivityContent.self, from: JSONEncoder().encode(content))
    XCTAssertEqual(again, content)
  }

  /// The schema requires `startedAt` on every row (REQ-LIVEACT-002: elapsed time per row; D-063 keeps it).
  func testRowWithoutStartIsRejected_REQ_LIVEACT_002_AC1() {
    let json = """
      {"updatedAt":"2026-10-24T10:42:00.000Z","counts":{"working":1,"waiting":0},"agents":[\
      {"target":{"machineId":"m1","sessionId":"s1"},"agentName":"a","project":"p","state":"working"}],"moreCount":0}
      """
    XCTAssertThrowsError(try JSONDecoder().decode(GhostexActivityContent.self, from: Data(json.utf8)))
  }

  func testQuestionFlagThatIsNotABooleanIsRejected_REQ_LIVEACT_011_AC6() {
    let json = Self.schemaInstance.replacingOccurrences(of: "\"hasQuestion\":true", with: "\"hasQuestion\":\"yes\"")
    XCTAssertThrowsError(try JSONDecoder().decode(GhostexActivityContent.self, from: Data(json.utf8)))
  }

  /// The Lock Screen's "No agent is working or waiting" follows the counts, not the rows: an approval wait is
  /// counted without a row (waiting 1, no rows, "+1 more"), and a finished agent without a row is in "+N more" only.
  func testNoAgentWorkingOrWaitingOnlyWhenBothCountsAreZero() {
    func content(working: Int, waiting: Int, moreCount: Int) -> GhostexActivityContent {
      GhostexActivityContent(
        updatedAt: Date(timeIntervalSince1970: 0), counts: GhostexActivityCounts(working: working, waiting: waiting),
        agents: [], moreCount: moreCount)
    }
    XCTAssertFalse(content(working: 0, waiting: 1, moreCount: 1).noAgentWorkingOrWaiting, "approval wait, no row")
    XCTAssertFalse(content(working: 1, waiting: 0, moreCount: 1).noAgentWorkingOrWaiting, "working, no row")
    XCTAssertTrue(content(working: 0, waiting: 0, moreCount: 0).noAgentWorkingOrWaiting, "nothing at all")
    XCTAssertTrue(content(working: 0, waiting: 0, moreCount: 1).noAgentWorkingOrWaiting, "finished, no row")
  }
}
