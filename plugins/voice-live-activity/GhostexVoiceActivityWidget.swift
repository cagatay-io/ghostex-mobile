//
//  GhostexVoiceActivityWidget.swift
//  The widget extension that draws the push-to-talk call's Live Activity: the call's line and
//  Talk / Send on the lock screen and in the Dynamic Island.
//
//  Copied into ios/GhostexVoiceActivity/ at prebuild by plugins/withVoiceLiveActivity.js, with
//  GhostexVoiceActivityAttributes.swift (the native module's copy) and GhostexVoiceTalkIntent.swift.
//  SEE-ALSO: modules/ghostex-native/ios/GhostexVoiceActivity.swift (starts and updates it).
//

import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct GhostexVoiceActivityBundle: WidgetBundle {
    var body: some Widget {
        GhostexVoiceLiveActivity()
    }
}

/// The voice screen's colours (src/theme/palette.ts: ACCENT, ACCENT_FOREGROUND, MUTED, CARD).
private enum Palette {
    static let accent = Color(red: 0x7D / 255, green: 0xD3 / 255, blue: 0xFC / 255)
    static let accentForeground = Color(red: 0x18 / 255, green: 0x18 / 255, blue: 0x18 / 255)
    static let muted = Color(red: 0xB5 / 255, green: 0xB5 / 255, blue: 0xB5 / 255)
    static let card = Color(red: 0x19 / 255, green: 0x19 / 255, blue: 0x19 / 255)
}

struct GhostexVoiceLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GhostexVoiceActivityAttributes.self) { context in
            HStack(spacing: 12) {
                MicGlyph(state: context.state, size: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Voice agent")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(context.state.line)
                        .font(.subheadline)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                TalkButton(state: context.state)
            }
            .padding(16)
            .activityBackgroundTint(Palette.card)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    MicGlyph(state: context.state, size: 26)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TalkButton(state: context.state)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Voice agent")
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.line)
                        .font(.subheadline)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
            } compactLeading: {
                MicGlyph(state: context.state, size: 14)
            } compactTrailing: {
                Text(context.state.talking ? "Send" : "Talk")
                    .font(.caption.bold())
                    .foregroundStyle(context.state.talking ? Palette.accent : .white)
            } minimal: {
                MicGlyph(state: context.state, size: 14)
            }
            .keylineTint(Palette.accent)
        }
    }
}

/// The microphone: lit while Talk is held, struck through while muted.
private struct MicGlyph: View {
    let state: GhostexVoiceActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        Image(systemName: state.muted && !state.talking ? "mic.slash.fill" : "mic.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(state.talking ? Palette.accent : state.muted ? Palette.muted : .white)
    }
}

/// Talk, or Send while talking. iOS 16 has no buttons in a Live Activity: the line says to open Ghostex.
private struct TalkButton: View {
    let state: GhostexVoiceActivityAttributes.ContentState

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: GhostexVoiceTalkIntent()) {
                Label(state.talking ? "Send" : "Talk", systemImage: state.talking ? "paperplane.fill" : "mic.fill")
                    .font(.subheadline.bold())
                    .padding(.horizontal, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(state.talking ? Palette.accent : Color.white.opacity(0.18))
            .foregroundStyle(state.talking ? Palette.accentForeground : .white)
            .disabled(state.muted)
        } else {
            Text("Open Ghostex to talk")
                .font(.caption)
                .foregroundStyle(Palette.muted)
        }
    }
}
