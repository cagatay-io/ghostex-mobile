//
//  GhostexVoiceCall.swift
//  GhostexNative
//
//  A voice agent conversation as a CallKit call: the iOS stand-in for Android's "Voice mode on"
//  notification with Mute and Hang up.
//
//  CDXC:VoiceMode 2026-11-04 DECISION: Coordinator brief for issue #412: "the right iOS pieces
//  (AVAudioSession play-and-record, the audio background mode, CallKit or a Live Activity; pick what
//  fits and explain)". CallKit, because a conversation with the voice agent is a two-way audio call:
//  CallKit gives it the lock screen and Dynamic Island call screen with Mute and End, the green call
//  pill, the call audio route (Bluetooth headsets, the car's hands-free and CarPlay), and the
//  system's answer to a phone call coming in (hold, or end, the conversation), none of which a Live
//  Activity can do; a Live Activity would need a widget extension and still no audio route. The calls
//  stay out of the Phone app's Recents. CallKit is not offered in mainland China, so there (and
//  wherever the call cannot be placed) the conversation runs on the audio background mode alone,
//  with the voice screen's controls only. Push-to-talk's Talk / Send has no CallKit button, so it
//  stays on the voice screen. CallKit refuses a call (as "unentitled") from an app without the `voip`
//  background mode, so app.json lists it beside `audio`; Ghostex uses no VoIP pushes.
//  SEE-ALSO: GhostexVoice.swift (the conversation), GhostexForegroundService.kt (Android's notification).
//

import AVFoundation
import CallKit
import Foundation

/// What the call asks of the conversation it carries. Every callback runs on the main queue.
protocol GhostexVoiceCallDelegate: AnyObject {
    /// CallKit activated the audio session: the microphone and speaker can start.
    func callAudioActivated()
    /// CallKit took the audio session away (another call, the call ending).
    func callAudioDeactivated()
    func callMuted(_ muted: Bool)
    func callHeld(_ held: Bool)
    /// Ended from the call screen, the lock screen, a headset, the car, or a call that replaced it.
    func callEndedBySystem()
}

final class GhostexVoiceCall: NSObject, CXProviderDelegate {
    static let shared = GhostexVoiceCall()

    private lazy var provider: CXProvider = {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        let provider = CXProvider(configuration: configuration)
        provider.setDelegate(self, queue: .main)
        return provider
    }()
    private let controller = CXCallController(queue: .main)

    /// The call placed now, and the conversation it belongs to.
    private(set) var callId: UUID?
    private weak var delegate: GhostexVoiceCallDelegate?
    /// The end came from CallKit (or was reported to it): nothing more to tell it.
    private var ended = false

    /// CallKit is not offered in mainland China (App Store rule); the call runs without it there.
    static var available: Bool {
        let region: String?
        if #available(iOS 16, *) { region = Locale.current.region?.identifier } else { region = Locale.current.regionCode }
        return region != "CN"
    }

    /**
     * Places the call. `done(true)` once CallKit accepted it (the audio session then arrives in
     * `callAudioActivated`), `done(false)` when it refused (the conversation activates the session itself).
     */
    func start(title: String, delegate: GhostexVoiceCallDelegate, done: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            if let previous = self.callId { self.provider.reportCall(with: previous, endedAt: nil, reason: .remoteEnded) }
            let id = UUID()
            self.callId = id
            self.ended = false
            self.delegate = delegate
            let handle = CXHandle(type: .generic, value: "Ghostex voice agent")
            let action = CXStartCallAction(call: id, handle: handle)
            action.isVideo = false
            self.controller.request(CXTransaction(action: action)) { error in
                if let error {
                    GhostexVoiceAudio.log.warning("CallKit refused the call: \(error.localizedDescription, privacy: .public)")
                    if self.callId == id {
                        self.callId = nil
                        self.delegate = nil
                    }
                    done(false)
                    return
                }
                self.update(title: title)
                done(true)
            }
        }
    }

    /// The conversation is talking: the call screen's timer starts.
    func connected() {
        DispatchQueue.main.async {
            guard let id = self.callId, !self.ended else { return }
            self.provider.reportOutgoingCall(with: id, connectedAt: Date())
        }
    }

    /// The name the call screen shows ("Voice agent · About Voice mode").
    func update(title: String) {
        DispatchQueue.main.async {
            guard let id = self.callId, !self.ended else { return }
            let update = CXCallUpdate()
            update.localizedCallerName = "Voice agent · \(title)"
            update.remoteHandle = CXHandle(type: .generic, value: "Ghostex voice agent")
            update.hasVideo = false
            update.supportsHolding = true
            update.supportsGrouping = false
            update.supportsUngrouping = false
            update.supportsDTMF = false
            self.provider.reportCall(with: id, updated: update)
        }
    }

    /// Mute from the voice screen: CallKit's own button follows.
    func setMuted(_ muted: Bool) {
        DispatchQueue.main.async {
            guard let id = self.callId, !self.ended else { return }
            self.controller.request(CXTransaction(action: CXSetMutedCallAction(call: id, muted: muted))) { _ in }
        }
    }

    /// The conversation ended on the phone's side or gxserver's: the call ends with it.
    func finish(failed: Bool) {
        DispatchQueue.main.async {
            guard let id = self.callId else { return }
            self.callId = nil
            self.delegate = nil
            if self.ended { return }
            self.ended = true
            self.provider.reportCall(with: id, endedAt: nil, reason: failed ? .failed : .remoteEnded)
        }
    }

    // MARK: CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        let delegate = self.delegate
        callId = nil
        self.delegate = nil
        ended = true
        delegate?.callEndedBySystem()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        guard action.callUUID == callId else {
            action.fail()
            return
        }
        // The category is set; CallKit activates the session and says so in didActivate.
        action.fulfill()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard action.callUUID == callId else {
            action.fail()
            return
        }
        ended = true
        let delegate = self.delegate
        callId = nil
        self.delegate = nil
        action.fulfill()
        delegate?.callEndedBySystem()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        guard action.callUUID == callId else {
            action.fail()
            return
        }
        delegate?.callMuted(action.isMuted)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        guard action.callUUID == callId else {
            action.fail()
            return
        }
        delegate?.callHeld(action.isOnHold)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        delegate?.callAudioActivated()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        delegate?.callAudioDeactivated()
    }
}
