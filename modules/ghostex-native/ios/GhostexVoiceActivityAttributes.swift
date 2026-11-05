//
//  GhostexVoiceActivityAttributes.swift
//  GhostexNative
//
//  What the push-to-talk call's Live Activity shows. ActivityKit matches an activity to its widget
//  by this type, so the widget extension compiles this same file:
//  plugins/withVoiceLiveActivity.js copies it into ios/GhostexVoiceActivity/ at prebuild. Keep it
//  free of anything but the type.
//  SEE-ALSO: GhostexVoiceActivity.swift (starts and updates it), plugins/voice-live-activity/.
//

import ActivityKit
import Foundation

struct GhostexVoiceActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Talk is held: the next press sends.
        var talking: Bool
        var muted: Bool
        /// The call's state line ("Push-to-talk · Mac mini", "Reconnecting to Mac mini…").
        var line: String
    }

    /// The computer the call is with.
    var computer: String
}
