//
//  GhostexVoiceTalkIntent.swift
//  The push-to-talk Live Activity's Talk / Send button.
//
//  Copied at prebuild (plugins/withVoiceLiveActivity.js) into both the app target and the widget
//  extension: the widget needs the type for `Button(intent:)`, and because the app has it too, iOS
//  runs a LiveActivityIntent's `perform` inside the app, where the call engine is. It only posts
//  the notification GhostexVoiceActivity.swift names; GhostexVoice.swift answers it with
//  `toggleTalking`, so no JavaScript is involved. Keep the two names in step.
//

import AppIntents
import Foundation

@available(iOS 17.0, *)
struct GhostexVoiceTalkIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Talk or Send"
    static let description: IntentDescription? = IntentDescription("Starts talking to the Ghostex voice agent in a push-to-talk call, or sends what you said.")
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: Notification.Name("io.ghostex.voice.toggleTalking"), object: nil)
        return .result()
    }
}
