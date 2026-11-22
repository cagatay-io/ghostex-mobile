//
//  GhostexTerminalUnsentKeys.swift
//  GhostexNative
//
//  The "not sent" sign (`onTerminalInputNotSent`, `onTerminalInputSent`), decided where a typed key or a sent text
//  enters the terminal: the key paths (the module's sendKey, the view's terminal keys and character keys, the software
//  keyboard's input, a hardware keyboard's keys) and the text paths (the module's sendText for the pad's text editor and
//  an upload's link, the terminal's Paste) ask `GhostexTerminalNotSent.admit` before they hand it to Ghostty. What
//  arrives while the terminal has no link is counted here and dropped, so it is never sent later. Bytes the terminal
//  writes (typed keys already handed on, and the terminal's own replies) are never counted: they carry no sign of where
//  they came from, because Ghostty encodes a key and writes it later from its own I/O thread. Foundation only, so it
//  compiles on its own.
//

import Foundation

/// What the sign counts: Return, Backspace and Esc by name, every other key as one; a text sent whole (the pad's text
/// editor, a paste, an upload's link) as one item of its kind. Never the characters: only these counts and an upload's
/// title ("Image #1", made by the app) leave this type.
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

    /// A text sent whole rather than typed key by key.
    enum TextItem: Equatable {
        /// The pad's text editor's draft.
        case text
        /// The terminal's Paste.
        case paste
        /// An upload's `[Title](path)` reference, by its title.
        case link(String)
    }

    var keys = 0
    var returns = 0
    var backspaces = 0
    var escapes = 0
    var texts = 0
    var pastes = 0
    var links: [String] = []

    var isEmpty: Bool { keys + returns + backspaces + escapes + texts + pastes == 0 && links.isEmpty }

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

    /// One text sent whole.
    init(item: TextItem) {
        switch item {
        case .text: texts = 1
        case .paste: pastes = 1
        case let .link(title): links = [title]
        }
    }

    /// The item the module's `sendText` is told it sends: "text" (the pad's text editor) or "link" with its title (an
    /// upload's reference); nil for anything else, which the sign does not count.
    init?(sentText kind: String, title: String?) {
        switch (kind, title) {
        case ("text", _): self.init(item: .text)
        case let ("link", title?) where !title.isEmpty: self.init(item: .link(title))
        default: return nil
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
        [
            "sessionKey": sessionKey, "keys": keys, "returns": returns, "backspaces": backspaces, "escapes": escapes,
            "texts": texts, "pastes": pastes, "links": links,
        ]
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

    /// Keys the software keyboard's boundary (`GhostexSoftwareInputGate`) kept back: counted as not sent, whatever the
    /// link is now (a composition begun without a link is not sent when it ends after the link is back).
    func lost(_ key: GhostexTerminalUnsentKeys, sessionKey: String) -> Report? {
        guard !key.isEmpty else { return nil }
        marked.insert(sessionKey)
        return .notSent(key)
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

/// The software keyboard's operations at the not-sent boundary, taken before the local text model
/// (TerminalTextInputModel) turns them into key calls, so the user's operation is what counts, once: a Backspace over a
/// selection is one Backspace, a caret or selection change counts nothing. Without a link an operation leaves the model
/// as it was, so nothing typed then can be sent later as part of other text. An IME composition that begins or changes
/// without a link is held out of the model until it ends; its commit is counted as not sent, also when the link is
/// back by then. Foundation only.
struct GhostexSoftwareInputGate {
    enum Operation: Equatable {
        /// Typed or committed text (a line break is a Return).
        case insert(String)
        case deleteBackward
        /// The keyboard replaces a range; empty text deletes it.
        case replace(String)
        case setMarked(String?)
        case unmark
        /// The caret or selection moves.
        case select
    }

    struct Decision: Equatable {
        /// The model takes the operation (the terminal has a link and no held composition).
        var takes: Bool
        /// Counted as not sent.
        var unsent = GhostexTerminalUnsentKeys()
        /// Applied to the view instead of the operation; never a key.
        var effects: [TerminalTextInputModel.Effect] = []
    }

    /// The marked text of a composition held out of the model.
    private(set) var heldComposition: String?

    mutating func decide(
        _ operation: Operation,
        linked: Bool,
        model: inout TerminalTextInputModel
    ) -> Decision {
        if let held = heldComposition {
            switch operation {
            case let .setMarked(text):
                heldComposition = (text ?? "").isEmpty ? nil : text
                return Decision(takes: false)
            case .unmark:
                heldComposition = nil
                return Decision(takes: false, unsent: GhostexTerminalUnsentKeys(typed: held))
            case let .insert(text), let .replace(text):
                heldComposition = nil
                return Decision(takes: false, unsent: GhostexTerminalUnsentKeys(typed: text))
            case .deleteBackward, .select:
                return Decision(takes: false)
            }
        }
        guard !linked else { return Decision(takes: true) }
        switch operation {
        case let .insert(text):
            return Decision(takes: false, unsent: GhostexTerminalUnsentKeys(typed: text), effects: Self.cancel(&model))
        case let .replace(text):
            let unsent = text.isEmpty ? GhostexTerminalUnsentKeys(.backspace) : GhostexTerminalUnsentKeys(typed: text)
            return Decision(takes: false, unsent: unsent, effects: Self.cancel(&model))
        case .deleteBackward:
            return Decision(takes: false, unsent: GhostexTerminalUnsentKeys(.backspace))
        case let .setMarked(text):
            heldComposition = (text ?? "").isEmpty ? nil : text
            return Decision(takes: false, effects: Self.cancel(&model))
        case .unmark:
            let committed = model.hasActiveIMEComposition ? model.markedText : ""
            return Decision(takes: false, unsent: GhostexTerminalUnsentKeys(typed: committed), effects: Self.cancel(&model))
        case .select:
            return Decision(takes: false)
        }
    }

    /// Ends the model's own composition without committing it (its text was never sent).
    private static func cancel(_ model: inout TerminalTextInputModel) -> [TerminalTextInputModel.Effect] {
        guard model.hasActiveIMEComposition else { return [] }
        return model.handleSetMarkedText(nil, selectedRangeLocation: 0)
    }
}
