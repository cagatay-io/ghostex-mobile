//
//  ScrollbackLimit.swift
//  GhostexNative
//

import Foundation

/// Turns the Scrollback setting (rows) into libghostty's `scrollback-limit`, which is in bytes.
///
/// CDXC:Terminal 2026-10-31 WHY: the setting's row count was written into `scrollback-limit` as is,
/// and the bundled libghostty reads that key as bytes ("The size of the scrollback buffer in bytes.
/// This also includes the active screen"). 2,000 meant 2,000 bytes; Ghostty then fell back to its
/// floor of two pages (the active screen plus one, about 0.8 MB), so every iOS terminal kept a few
/// hundred rows whatever the slider said. A row costs 8 bytes a cell plus 8 for the row, plus the
/// page's style, grapheme and link tables: about 1.8 KB at the 200-column width a parked terminal
/// rests at, less at the narrower width it is shown at. 2 KiB a row holds at least the chosen rows
/// even parked, and the extra 1 MiB covers the active screen and the partly filled page Ghostty drops
/// whole when it trims. 20,000 rows (the maximum) caps one terminal at about 42 MB; the warm terminals
/// share the Android row budget (src/terminal/warmBudget.ts), so all of them together stay under 65 MB.
/// Ghostty only allocates pages as output arrives, so a quiet terminal costs its screen, not its cap.
/// SEE-ALSO: src/terminal/warmBudget.ts, Ghostty.App.swift `configContent`.
enum ScrollbackLimit {
    static let bytesPerRow = 2048
    static let activeScreenAndPageBytes = 1 << 20

    nonisolated static func bytes(forRows rows: Int) -> Int {
        max(0, rows) * bytesPerRow + activeScreenAndPageBytes
    }
}
