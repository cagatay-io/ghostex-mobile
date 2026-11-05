//
//  GhostexVoiceActivity.swift
//  GhostexNative
//
//  The push-to-talk call's Live Activity: Talk / Send on the lock screen and in the Dynamic Island,
//  the iOS stand-in for the Talk / Send button of Android's "Voice mode on" notification.
//
//  CDXC:VoiceMode 2026-11-04 DECISION: User (Q2 of the iPhone voice mode questions): "Add a Live
//  Activity with Talk / Send for push-to-talk on the lock screen and Dynamic Island". CallKit still
//  carries the call itself (Mute, End, the audio route); this activity appears only while the call is
//  push-to-talk, and its Talk / Send button is a LiveActivityIntent that iOS runs inside the app,
//  which reaches the call engine through `toggleTalking` without JavaScript.
//  SEE-ALSO: GhostexVoiceActivityAttributes.swift, plugins/withVoiceLiveActivity.js (the widget
//  extension and the intent), GhostexVoice.swift (`refreshNotice`).
//

import ActivityKit
import Foundation

enum GhostexVoiceActivity {
    /// Posted by the Talk / Send intent (plugins/voice-live-activity/GhostexVoiceTalkIntent.swift).
    static let toggleTalking = Notification.Name("io.ghostex.voice.toggleTalking")

    private static let lock = NSLock()
    /// The running `Activity<GhostexVoiceActivityAttributes>`, and what it shows now.
    private static var current: Activity<GhostexVoiceActivityAttributes>?
    private static var shown: GhostexVoiceActivityAttributes.ContentState?

    /**
     * Starts the activity, or brings it up to date. Starting needs the app in front (a call begins
     * there); an update or end works from the background.
     */
    static func show(computer: String, state: GhostexVoiceActivityAttributes.ContentState) {
        lock.lock()
        defer { lock.unlock() }
        if let activity = current {
            guard shown != state else { return }
            shown = state
            Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            GhostexVoiceAudio.log.info("Live Activities are off for Ghostex; Talk / Send stays on the voice screen")
            return
        }
        do {
            current = try Activity.request(
                attributes: GhostexVoiceActivityAttributes(computer: computer),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            shown = state
        } catch {
            GhostexVoiceAudio.log.warning("the push-to-talk Live Activity did not start: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The call ended or stopped being push-to-talk.
    static func end() {
        lock.lock()
        let activity = current
        current = nil
        shown = nil
        lock.unlock()
        guard let activity else { return }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
