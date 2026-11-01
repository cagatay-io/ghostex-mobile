//
//  GhosttyConfigTests.swift
//  GhostexNative
//
//  The Ghostty config the phone's terminal is built from carries the colours of the chosen palette:
//  background, foreground and the sixteen palette entries, and its identity (config cache key and
//  temp file name) differs whenever the colours do. Expected values are the palettes' own colours
//  (Catppuccin Mocha and Latte, as the theme presets carry them), not output of the code under test.
//

import XCTest
@testable import GhostexNative

@MainActor
final class GhosttyConfigTests: XCTestCase {
    private let mochaANSI = [
        "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
        "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
    ]
    private let latteANSI = [
        "#5c5f77", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#acb0be",
        "#6c6f85", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#bcc0cc",
    ]

    /// Palette A: a dark terminal on Catppuccin Mocha.
    private var mocha: TerminalColors {
        TerminalColors.validated(
            light: false,
            background: "#1e1e2e",
            foreground: "#cdd6f4",
            cursor: "#f5e0dc",
            cursorText: "#11111b",
            selectionBackground: "#353749",
            palette: mochaANSI
        )!
    }

    /// Palette B: a light terminal on Catppuccin Latte (light terminals send no selection background).
    private var latte: TerminalColors {
        TerminalColors.validated(
            light: true,
            background: "#eff1f5",
            foreground: "#4c4f69",
            cursor: "#dc8a78",
            cursorText: "#eff1f5",
            selectionBackground: nil,
            palette: latteANSI
        )!
    }

    private func config(_ colors: TerminalColors, fontSize: Double = 13) -> String {
        Ghostty.ConfigBuilder.configContent(
            fontSize: fontSize,
            cursorStyle: .bar,
            cursorBlink: true,
            scrollbackRows: 2000,
            colors: colors
        )
    }

    private func lines(_ content: String) -> [String] {
        content.split(separator: "\n").map(String.init)
    }

    func testPaletteAWritesItsBackgroundForegroundAndSixteenPaletteLines() {
        let written = lines(config(mocha))
        XCTAssertTrue(written.contains("background = #1e1e2e"))
        XCTAssertTrue(written.contains("foreground = #cdd6f4"))
        let palette = written.filter { $0.hasPrefix("palette = ") }
        XCTAssertEqual(palette, mochaANSI.enumerated().map { "palette = \($0.offset)=\($0.element)" })
        XCTAssertTrue(written.contains("cursor-color = #f5e0dc"))
        XCTAssertTrue(written.contains("cursor-text = #11111b"))
        XCTAssertTrue(written.contains("selection-background = #353749"))
        // Selected text keeps each cell's colour instead of Ghostty's default (the background colour).
        XCTAssertTrue(written.contains("selection-foreground = cell-foreground"))
        XCTAssertEqual(written.filter { $0.hasPrefix("background = ") }.count, 1)
    }

    func testALightPaletteWithoutASelectionBackgroundWritesNoSelectionLines() {
        let written = lines(config(latte))
        XCTAssertTrue(written.contains("background = #eff1f5"))
        XCTAssertTrue(written.contains("foreground = #4c4f69"))
        XCTAssertEqual(written.filter { $0.hasPrefix("palette = ") }.count, 16)
        XCTAssertFalse(written.contains { $0.hasPrefix("selection-") })
    }

    func testPalettesAAndBGiveDifferentConfigsAndIdentities() {
        let a = config(mocha)
        let b = config(latte)
        XCTAssertNotEqual(a, b)
        XCTAssertNotEqual(Ghostty.ConfigBuilder.identity(of: a), Ghostty.ConfigBuilder.identity(of: b))
    }

    func testSwitchingBackToAPaletteYieldsItsOwnConfigAgain() {
        let first = config(mocha)
        _ = config(latte)
        let again = config(mocha)
        XCTAssertEqual(again, first)
        XCTAssertEqual(Ghostty.ConfigBuilder.identity(of: again), Ghostty.ConfigBuilder.identity(of: first))
        XCTAssertTrue(lines(again).contains("background = #1e1e2e"))
    }

    func testOneColourChangesTheIdentity() {
        var other = mocha
        other.palette[15] = "#ffffff"
        XCTAssertNotEqual(
            Ghostty.ConfigBuilder.identity(of: config(mocha)),
            Ghostty.ConfigBuilder.identity(of: config(other))
        )
    }

    func testAFontSizeOverrideKeepsTheColours() {
        let base = lines(config(mocha))
        let zoomed = lines(config(mocha, fontSize: 20))
        XCTAssertTrue(zoomed.contains("font-size = 20"))
        XCTAssertEqual(base.filter { !$0.hasPrefix("font-size") }, zoomed.filter { !$0.hasPrefix("font-size") })
    }

    func testUnthemedTerminalsKeepTheEarlierBlackConfig() {
        let written = lines(config(.unthemed))
        XCTAssertTrue(written.contains("background = #000000"))
        // No colour role but the background (`cursor-style` is the cursor setting, not a colour).
        let colourRoles = ["foreground", "cursor-color", "cursor-text", "selection-", "palette"]
        XCTAssertFalse(written.contains { line in colourRoles.contains { line.hasPrefix($0) } })
    }

    func testOnlyHashHexColoursAndSixteenOrNoPaletteEntriesAreAccepted() {
        func accepted(background: String = "#000000", foreground: String? = nil, palette: [String] = []) -> Bool {
            TerminalColors.validated(
                light: false,
                background: background,
                foreground: foreground,
                cursor: nil,
                cursorText: nil,
                selectionBackground: nil,
                palette: palette
            ) != nil
        }
        XCTAssertTrue(accepted())
        XCTAssertFalse(accepted(background: "#000000\nshell-integration = zsh"))
        XCTAssertFalse(accepted(background: "000000"))
        XCTAssertFalse(accepted(background: "#00000g"))
        XCTAssertFalse(accepted(background: "#0000000"))
        XCTAssertFalse(accepted(foreground: "#fff"))
        XCTAssertFalse(accepted(palette: Array(mochaANSI.prefix(15))))
        XCTAssertFalse(accepted(palette: Array(mochaANSI.prefix(15)) + ["red"]))
        XCTAssertEqual(
            TerminalColors.validated(
                light: false,
                background: "#1E1E2E",
                foreground: nil,
                cursor: nil,
                cursorText: nil,
                selectionBackground: nil,
                palette: []
            )?.background,
            "#1e1e2e"
        )
    }
}
