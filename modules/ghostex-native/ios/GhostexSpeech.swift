//
//  GhostexSpeech.swift
//  GhostexNative
//
//  Read aloud's speaker on iOS, the twin of GhostexSpeech.kt: the phone's own speech synthesizer, one
//  utterance at a time for the whole app (docs/2026-10-20/voice-mode/read-aloud-client-contract.md,
//  sections 3 and 6). JavaScript hands over an utterance as a token and its segments; this object
//  speaks them in order with the phone's Voice and Speed and reports one `ended` event per token,
//  natural or cut off.
//
//  CDXC:VoiceMode 2026-11-04 WHY: every segment is queued into the synthesizer at once, so a reply
//  keeps playing to its end with the phone locked (the `audio` background mode). The session is
//  `playback` in `spokenAudio` mode with others ducked, so music ducks under a reply and a navigation
//  prompt interrupts it; the reply pauses then and goes on from the word it was at when the prompt
//  is over. A phone call, or a pause longer than `pauseLimit`, ends it as interrupted, so the chat core
//  never waits on a reply that will not finish (Android's rule).
//  SEE-ALSO: GhostexVoiceAudio.swift (the shared audio session), src/voice/readAloud.ts.
//

import AVFoundation
import CallKit
import Foundation
import UserNotifications

final class GhostexSpeech: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = GhostexSpeech()
    /// A paused reply longer than this ends instead of waiting for it forever.
    private static let pauseLimit: TimeInterval = 120

    /// Set by the module; every `ended` event for JavaScript goes through it.
    static var emitter: (([String: Any?]) -> Void)?

    // Everything below is touched on the main queue only.
    private lazy var synthesizer: AVSpeechSynthesizer = {
        let synthesizer = AVSpeechSynthesizer()
        synthesizer.delegate = self
        return synthesizer
    }()
    private let callObserver = CXCallObserver()
    /// Activating and deactivating the audio session can block, so it never runs on the main queue.
    private let sessionQueue = DispatchQueue(label: "io.ghostex.speech.session")
    private var current: Utterance?
    /// Tokens stopped before their `speak` arrived (the module's calls may overtake each other).
    private var stoppedEarly: [String] = []
    private var pauseTimer: DispatchWorkItem?
    private var releaseTimer: DispatchWorkItem?
    private var interruptionObserver: NSObjectProtocol?

    private final class Utterance {
        let token: String
        let parts: [AVSpeechUtterance]
        var pausedByInterruption = false

        init(token: String, parts: [AVSpeechUtterance]) {
            self.token = token
            self.parts = parts
        }
    }

    /// The synthesizer is always there on iOS.
    func initialize() -> Bool {
        true
    }

    /**
     * The phone's voices: `name` (the voice's identifier), `label` ("Ava (Premium)"), `language`
     * (ISO 639), `locale` (BCP 47), `localeLabel` (in the phone's language). Novelty voices are left out.
     */
    func voices() -> [String: Any?] {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        var list = AVSpeechSynthesisVoice.speechVoices()
        if #available(iOS 17, *) { list = list.filter { !$0.voiceTraits.contains(.isNoveltyVoice) } }
        let voices = list
            .sorted { ($0.language, $0.name) < ($1.language, $1.name) }
            .map { voice -> [String: Any] in
                let quality: String
                switch voice.quality {
                case .premium: quality = " (Premium)"
                case .enhanced: quality = " (Enhanced)"
                default: quality = ""
                }
                return [
                    "name": voice.identifier,
                    "label": voice.name + quality,
                    "language": voice.language.split(separator: "-").first.map(String.init) ?? voice.language,
                    "locale": voice.language,
                    "localeLabel": Locale.current.localizedString(forIdentifier: voice.language) ?? voice.language,
                    "network": false,
                    "notInstalled": false,
                ]
            }
        let defaultVoice = AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())?.identifier
        return ["voices": voices, "defaultVoice": defaultVoice, "language": language]
    }

    /// Speaks `segments` in order as utterance `token`, replacing whatever is speaking.
    func speak(token: String, segments: [String], voice: String, rate: Double) {
        changeBusy(1)
        sessionQueue.async {
            let held = (try? GhostexAudioSession.shared.acquire(.speech)) != nil
            DispatchQueue.main.async { self.start(token: token, segments: segments, voice: voice, rate: rate, held: held) }
        }
    }

    private func start(token: String, segments: [String], voice: String, rate: Double, held: Bool) {
        if let playing = current { finish(playing, interrupted: true) }
        if let index = stoppedEarly.firstIndex(of: token) {
            stoppedEarly.remove(at: index)
            emitEnded(token, interrupted: true)
            idle()
            return
        }
        let texts = segments.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !texts.isEmpty else {
            emitEnded(token, interrupted: false)
            idle()
            return
        }
        guard held else {
            GhostexVoiceAudio.log.info("utterance \(token, privacy: .public) not spoken: another app holds the audio")
            emitEnded(token, interrupted: true)
            idle()
            return
        }
        releaseTimer?.cancel()
        observeInterruptions()
        let chosen = voice.isEmpty ? nil : AVSpeechSynthesisVoice(identifier: voice)
        let target = chosen ?? AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())
        let speechRate = Self.synthesizerRate(rate)
        let parts = texts.map { text -> AVSpeechUtterance in
            let part = AVSpeechUtterance(string: text)
            part.voice = target
            part.rate = speechRate
            return part
        }
        let utterance = Utterance(token: token, parts: parts)
        current = utterance
        GhostexVoiceAudio.log.info("utterance \(token, privacy: .public): \(texts.count) segment(s), speed \(rate)x")
        parts.forEach { synthesizer.speak($0) }
    }

    /**
     * Read aloud's Speed (0.75x to 2x of the normal rate) on the synthesizer's scale, where 0.5 is
     * normal and 1 is its fastest, about twice as fast.
     */
    static func synthesizerRate(_ rate: Double) -> Float {
        let normal = Double(AVSpeechUtteranceDefaultSpeechRate)
        let fastest = Double(AVSpeechUtteranceMaximumSpeechRate)
        let value = rate >= 1 ? normal + (fastest - normal) * min(rate - 1, 1) : normal * max(rate, 0.25)
        return Float(min(max(value, Double(AVSpeechUtteranceMinimumSpeechRate)), fastest))
    }

    /// Stops utterance `token` if it is still the one speaking (or paused); otherwise nothing.
    func stop(token: String) {
        DispatchQueue.main.async {
            if let playing = self.current, playing.token == token {
                self.finish(playing, interrupted: true)
            } else {
                // Already over, or not spoken yet: tokens are never reused, so remembering it only
                // drops a `speak` that lands after its own stop.
                self.stoppedEarly.append(token)
                if self.stoppedEarly.count > 8 { self.stoppedEarly.removeFirst() }
            }
        }
    }

    /// Ends `utterance`: flushes the synthesizer, gives the audio back and tells JavaScript.
    private func finish(_ utterance: Utterance, interrupted: Bool) {
        guard current === utterance else { return }
        current = nil
        pauseTimer?.cancel()
        pauseTimer = nil
        if synthesizer.isSpeaking || synthesizer.isPaused { synthesizer.stopSpeaking(at: .immediate) }
        emitEnded(utterance.token, interrupted: interrupted)
        idle()
    }

    /// Utterances asked for and not ended yet; the session goes back only at zero.
    private let busyLock = NSLock()
    private var busy = 0

    private func changeBusy(_ delta: Int) {
        busyLock.lock()
        busy = max(0, busy + delta)
        busyLock.unlock()
    }

    /// One utterance is over (spoken, cut, refused or dropped).
    private func idle() {
        changeBusy(-1)
        releaseSoon()
    }

    /// A reply that follows straight away keeps the session; otherwise others come back up.
    private func releaseSoon() {
        releaseTimer?.cancel()
        let release = DispatchWorkItem { [weak self] in
            self?.sessionQueue.async {
                guard let self else { return }
                self.busyLock.lock()
                let quiet = self.busy == 0
                self.busyLock.unlock()
                if quiet { GhostexAudioSession.shared.release(.speech) }
            }
        }
        releaseTimer = release
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: release)
    }

    private func emitEnded(_ token: String, interrupted: Bool) {
        GhostexSpeech.emitter?(["token": token, "kind": "ended", "interrupted": interrupted])
    }

    private func inCall() -> Bool {
        // The voice agent's own call is not a phone call.
        callObserver.calls.contains { !$0.hasEnded && $0.uuid != GhostexVoiceCall.shared.callId }
    }

    private func observeInterruptions() {
        guard interruptionObserver == nil else { return }
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self, let utterance = self.current,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                guard !utterance.pausedByInterruption else { return }
                utterance.pausedByInterruption = true
                self.synthesizer.pauseSpeaking(at: .word)
                let limit = DispatchWorkItem { [weak self] in
                    guard let self, self.current === utterance, utterance.pausedByInterruption else { return }
                    self.finish(utterance, interrupted: true)
                }
                self.pauseTimer = limit
                DispatchQueue.main.asyncAfter(deadline: .now() + GhostexSpeech.pauseLimit, execute: limit)
                // A phone call ends the reply; a navigation prompt only pauses it.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                    guard let self, self.current === utterance, utterance.pausedByInterruption, self.inCall() else { return }
                    self.finish(utterance, interrupted: true)
                }
            case .ended:
                guard utterance.pausedByInterruption else { return }
                utterance.pausedByInterruption = false
                self.pauseTimer?.cancel()
                self.pauseTimer = nil
                if self.inCall() {
                    self.finish(utterance, interrupted: true)
                    return
                }
                GhostexAudioSession.shared.reactivate()
                self.synthesizer.continueSpeaking()
            @unknown default:
                break
            }
        }
    }

    // MARK: AVSpeechSynthesizerDelegate

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let playing = self.current, playing.parts.last === utterance else { return }
            self.finish(playing, interrupted: false)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let playing = self.current, playing.parts.contains(where: { $0 === utterance }) else { return }
            self.finish(playing, interrupted: true)
        }
    }

    // MARK: Read aloud's Voice mode

    /*
     * Read aloud's Voice mode: Android shows "Voice mode on" in a notification while Auto-read reads
     * the chat on screen. iOS has no such notification (`readAloudModeStart` answers true so the chat
     * does not warn about one); a reply that is speaking keeps playing with the phone locked.
     */

    /// A notification of its own saying Voice mode turned itself off, and why.
    func postEnded(title: String, text: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = text
        let request = UNNotificationRequest(identifier: "ghostex-voice-mode-ended", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in }
    }
}
