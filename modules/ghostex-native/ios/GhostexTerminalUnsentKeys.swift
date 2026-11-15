//
//  GhostexTerminalUnsentKeys.swift
//  GhostexNative
//
//  The "not sent" sign (`onTerminalInputNotSent`, `onTerminalInputSent`), decided where a typed key enters the
//  terminal: the key paths (the module's sendKey, the view's terminal keys and character keys, the software keyboard's
//  input, a hardware keyboard's keys) ask `GhostexTerminalNotSent.admit` before they hand a key to Ghostty. A key that
//  arrives while the terminal has no link is counted here and dropped, so it is never sent later. Bytes the terminal
//  writes (typed keys already handed on, and the terminal's own replies) are never counted: they carry no sign of where
//  they came from, because Ghostty encodes a key and writes it later from its own I/O thread. Foundation only, so it
//  compiles on its own.
//

import Foundation

/// Keys counted for the sign: Return, Backspace and Esc by name, every other key as one. Never the characters: only
/// these four counts leave this type.
struct GhostexTerminalUnsentKeys: Equatable {
    /// What a key is, as far as the sign names it; a modifier key on its own (Shift, Control, Option, Command, Caps
    /// Lock) is not a typed key.
    enum Name {
        case enter, backspace, escape, other, modifier
    }

    /// A key event's action; a release is not a key.
    enum Action {
        case press, repeated, release
    }

    var keys = 0
    var returns = 0
    var backspaces = 0
    var escapes = 0

    var isEmpty: Bool { keys + returns + backspaces + escapes == 0 }

    init() {}

    /// One key event: a press or a repeat counts once, a release or a modifier key on its own not at all.
    init(_ name: Name, _ action: Action = .press) {
        guard action != .release else { return }
        switch name {
        case .enter: returns = 1
        case .backspace: backspaces = 1
        case .escape: escapes = 1
        case .other: keys = 1
        case .modifier: break
        }
    }

    /// The key the module's `sendKey` names (the command pad and the key bar).
    init(keyName: String) {
        switch keyName {
        case "enter": self.init(.enter)
        case "backspace": self.init(.backspace)
        case "escape": self.init(.escape)
        default: self.init(.other)
        }
    }

    /// Text the software keyboard typed: each character one key, a line break a Return.
    init(typed text: String) {
        for character in text {
            if character == "\r" || character == "\n" || character == "\r\n" {
                returns += 1
            } else {
                keys += 1
            }
        }
    }

    func payload(sessionKey: String) -> [String: Any] {
        ["sessionKey": sessionKey, "keys": keys, "returns": returns, "backspaces": backspaces, "escapes": escapes]
    }
}

/// Which terminals may show the sign, for the module's lifetime (a JavaScript reload starts a new module and a new
/// JavaScript side, both without a sign). Main actor only.
final class GhostexTerminalNotSent {
    /// What `admit` tells the module to report.
    enum Report: Equatable {
        case notSent(GhostexTerminalUnsentKeys)
        case sent
    }

    /// Terminals whose next key that goes on takes the sign down: one that lost a key, and one opened again (a
    /// terminal reattached while its view was not on screen still shows its sign on the JavaScript side).
    private var marked: Set<String> = []

    /// A key at `sessionKey`'s input boundary. Without a link it is counted and stays here (false); with one it goes on
    /// (true), and the first such key after a loss or a reopen also reports that the sign can go.
    func admit(_ key: GhostexTerminalUnsentKeys, sessionKey: String, linked: Bool) -> (goesOn: Bool, report: Report?) {
        guard linked else {
            guard !key.isEmpty else { return (false, nil) }
            marked.insert(sessionKey)
            return (false, .notSent(key))
        }
        guard !key.isEmpty, marked.remove(sessionKey) != nil else { return (true, nil) }
        return (true, .sent)
    }

    /// `sessionKey`'s terminal was opened (again).
    func opened(_ sessionKey: String) {
        marked.insert(sessionKey)
    }

    /// `sessionKey`'s terminal was closed (its tab closed, or it is detached before it opens again).
    func closed(_ sessionKey: String) {
        marked.remove(sessionKey)
    }

    func isMarked(_ sessionKey: String) -> Bool {
        marked.contains(sessionKey)
    }

    /// A hardware keyboard's event that counts nothing (a release, or a modifier key on its own) is not a typed key: it
    /// goes on to Ghostty without asking, so Ghostty never misses the end of a key it saw begin. Without a link its
    /// bytes are dropped by the write callback like any other write. A press or a repeat is asked through `admit`.
    static func hardwareKeyGoesOnUncounted(_ key: GhostexTerminalUnsentKeys) -> Bool {
        key.isEmpty
    }
}
