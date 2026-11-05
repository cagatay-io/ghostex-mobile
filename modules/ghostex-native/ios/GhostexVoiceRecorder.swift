//
//  GhostexVoiceRecorder.swift
//  GhostexNative
//
//  Dictate's first step on iOS, the twin of GhostexVoiceRecorder.kt: the microphone written to a WAV
//  file as it is captured (24 kHz mono PCM16, about 2.9 MB a minute, in Application Support under
//  `dictation-recordings/`), so nothing said is lost to a refused key, an empty xAI account, a
//  dropped SSH link or the app being closed. JavaScript then uploads the finished file to the
//  computer's gxserver in pieces (`readPiece`) and deletes this copy (`forget`) only once gxserver
//  has all of it; a recording it never confirmed is sent again on the next Dictate (`unsent`).
//
//  CDXC:VoiceMode 2026-11-04 SEE-ALSO: the user's decision on recording first and transcribing second
//  is in the computer's `server/src/voice_agent/recordings.rs`; JavaScript drives this from
//  `src/voice/dictation.ts`.
//

import Foundation

enum GhostexVoiceRecorder {
    /// How often the header's sizes are brought up to date while recording.
    private static let headerEvery: TimeInterval = 2

    /// Set by the module; a microphone failure after the start goes through it.
    static var emitter: (([String: Any?]) -> Void)?

    private static let lock = NSLock()
    private static var active: Active?

    private final class Active {
        let id: String
        let url: URL
        let createdAt: Int64
        let output: FileHandle
        var dataBytes: Int64 = 0
        var lastHeader = Date()
        var engine: GhostexVoiceEngine?

        init(id: String, url: URL, createdAt: Int64, output: FileHandle) {
            self.id = id
            self.url = url
            self.createdAt = createdAt
            self.output = output
        }
    }

    private static func folder() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("dictation-recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Starts recording. Answers the recording's id. Replaces (and keeps) one still running.
    static func start() throws -> String {
        _ = stop(dismissed: true)
        let createdAt = Int64(Date().timeIntervalSince1970 * 1000)
        let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(8)
        let id = "p\(createdAt)-\(suffix)"
        let url = folder().appendingPathComponent("\(id).wav")
        FileManager.default.createFile(atPath: url.path, contents: header(dataBytes: 0))
        let output = try FileHandle(forWritingTo: url)
        output.seekToEndOfFile()
        writeSidecar(url, createdAt: createdAt, dismissed: false)
        let recording = Active(id: id, url: url, createdAt: createdAt, output: output)
        let engine = GhostexVoiceEngine(
            conversation: false,
            onChunk: { chunk in append(recording, chunk) },
            onError: { message in
                emitter?(["sessionId": id, "mode": "dictation", "kind": "status", "status": "micError", "message": message])
            }
        )
        recording.engine = engine
        lock.lock()
        active = recording
        lock.unlock()
        do {
            try GhostexAudioSession.shared.acquire(.recording)
            try engine.start()
        } catch {
            _ = stop(dismissed: true)
            throw error
        }
        return id
    }

    private static func append(_ recording: Active, _ chunk: Data) {
        lock.lock()
        defer { lock.unlock() }
        guard active === recording else { return }
        recording.output.write(chunk)
        recording.dataBytes += Int64(chunk.count)
        if Date().timeIntervalSince(recording.lastHeader) >= headerEvery {
            recording.lastHeader = Date()
            writeSizes(recording.output, dataBytes: recording.dataBytes)
        }
    }

    /// Stops recording and closes the file. Answers the finished recording, or nil if none ran.
    static func stop(dismissed: Bool) -> [String: Any]? {
        lock.lock()
        let recording = active
        active = nil
        lock.unlock()
        guard let recording else { return nil }
        recording.engine?.stop()
        GhostexAudioSession.shared.release(.recording)
        writeSizes(recording.output, dataBytes: recording.dataBytes)
        try? recording.output.close()
        if dismissed { writeSidecar(recording.url, createdAt: recording.createdAt, dismissed: true) }
        return describe(recording.url, id: recording.id, createdAt: recording.createdAt, dataBytes: recording.dataBytes, dismissed: dismissed)
    }

    /// Recordings gxserver never confirmed, oldest first (not the one being made).
    static func unsent() -> [[String: Any]] {
        lock.lock()
        let recordingId = active?.id
        lock.unlock()
        let files = (try? FileManager.default.contentsOfDirectory(at: folder(), includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])) ?? []
        return files
            .filter { $0.pathExtension == "wav" && $0.deletingPathExtension().lastPathComponent != recordingId }
            .compactMap { url -> [String: Any]? in
                let length = Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
                if length <= 44 {
                    forgetFile(url)
                    return nil
                }
                let sidecar = readSidecar(url)
                let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
                let createdAt = (sidecar["createdAt"] as? NSNumber)?.int64Value ?? Int64(modified.timeIntervalSince1970 * 1000)
                return describe(url, id: url.deletingPathExtension().lastPathComponent, createdAt: createdAt, dataBytes: length - 44, dismissed: sidecar["dismissed"] as? Bool ?? true)
            }
            .sorted { ($0["createdAt"] as? Int64 ?? 0) < ($1["createdAt"] as? Int64 ?? 0) }
    }

    /// `length` bytes of the file from `offset`, as base64 (empty at the end).
    static func readPiece(path: String, offset: Int64, length: Int) throws -> String {
        let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
        defer { try? handle.close() }
        let size = Int64(handle.seekToEndOfFile())
        guard offset < size else { return "" }
        handle.seek(toFileOffset: UInt64(offset))
        return handle.readData(ofLength: Int(min(Int64(length), size - offset))).base64EncodedString()
    }

    /// Marks a finished recording dismissed (the reader cancelled before gxserver had it).
    static func dismiss(path: String) {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else { return }
        let createdAt = (readSidecar(url)["createdAt"] as? NSNumber)?.int64Value ?? Int64(Date().timeIntervalSince1970 * 1000)
        writeSidecar(url, createdAt: createdAt, dismissed: true)
    }

    /// gxserver has it: this copy goes.
    static func forget(path: String) {
        forgetFile(URL(fileURLWithPath: path))
    }

    private static func describe(_ url: URL, id: String, createdAt: Int64, dataBytes: Int64, dismissed: Bool) -> [String: Any] {
        let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? (dataBytes + 44)
        return [
            "id": id,
            "path": url.path,
            "createdAt": createdAt,
            "durationMs": dataBytes / Int64(GhostexVoiceAudio.bytesPerMs),
            "bytes": bytes,
            "dismissed": dismissed,
        ]
    }

    private static func sidecarURL(_ url: URL) -> URL {
        url.deletingPathExtension().appendingPathExtension("json")
    }

    private static func readSidecar(_ url: URL) -> [String: Any] {
        guard let data = try? Data(contentsOf: sidecarURL(url)),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
        return json
    }

    private static func writeSidecar(_ url: URL, createdAt: Int64, dismissed: Bool) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["createdAt": createdAt, "dismissed": dismissed]) else { return }
        try? data.write(to: sidecarURL(url), options: .atomic)
    }

    private static func forgetFile(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
        try? FileManager.default.removeItem(at: sidecarURL(url))
    }

    private static func writeSizes(_ output: FileHandle, dataBytes: Int64) {
        let position = output.offsetInFile
        let data = UInt32(min(dataBytes, 0xFFFF_FFDB))
        output.seek(toFileOffset: 4)
        output.write(littleEndian(data + 36))
        output.seek(toFileOffset: 40)
        output.write(littleEndian(data))
        output.seek(toFileOffset: position)
        output.synchronizeFile()
    }

    private static func littleEndian(_ value: UInt32) -> Data {
        withUnsafeBytes(of: value.littleEndian) { Data($0) }
    }

    private static func littleEndian16(_ value: UInt16) -> Data {
        withUnsafeBytes(of: value.littleEndian) { Data($0) }
    }

    private static func header(dataBytes: UInt32) -> Data {
        let rate = UInt32(GhostexVoiceAudio.sampleRate)
        var data = Data("RIFF".utf8)
        data.append(littleEndian(36 + dataBytes))
        data.append(Data("WAVE".utf8))
        data.append(Data("fmt ".utf8))
        data.append(littleEndian(16))
        data.append(littleEndian16(1))
        data.append(littleEndian16(1))
        data.append(littleEndian(rate))
        data.append(littleEndian(rate * 2))
        data.append(littleEndian16(2))
        data.append(littleEndian16(16))
        data.append(Data("data".utf8))
        data.append(littleEndian(dataBytes))
        return data
    }
}
