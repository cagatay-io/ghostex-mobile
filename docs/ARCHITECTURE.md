# ghostex-mobile Architecture

One React Native (Expo, New Architecture) app for iOS + Android. The UI, session inventory, machine management, and orchestration are shared TypeScript. Only two things are native per platform:

1. **The terminal surface** — iOS: Ghostty `libghostty` (ported wrapper from the VVTerm fork). Android: Termux `terminal-emulator` + `terminal-view` (copied from the Android fork).
2. **The SSH transport** — iOS: libssh2 (ported `SSHClient` subset from VVTerm). Android: SSHJ + BouncyCastle (ported `GhostexSshTransport` from the Android fork).

**Golden rule: PTY bytes never cross the JS bridge.** The SSH shell channel is piped into the terminal engine entirely in native code. JS only orchestrates: connect, run non-interactive commands (`ghostex sessions --json --mobile-summary`), open/close terminals, send discrete keys/text, receive lifecycle events.

## Repo layout

```
mobile/
  App.tsx                     # entry → navigation
  src/
    theme/                    # GhostexPalette tokens (docs/specs/sessions-drawer.md §0)
    contract/                 # mobile-summary TS types + parser + displayStatus()
    machines/                 # machine store (AsyncStorage) + credentials (expo-secure-store)
    inventory/                # inventory client (exec over native ssh), 5s polling, per-machine fan-out
    terminal/                 # tab/session state, warm-session policy (max 7, within a scrollback-row budget), attach orchestration
    commands/                 # ghostex CLI command builders (login-shell wrapping, quoting)
    docs/                     # document page builder, remote-file mirror and renderers
    files/                    # project browser policy, listing, search, share and session-context actions
    components/               # shared UI (action sheets, state cards, chips, key bar)
    screens/
      WelcomeScreen.tsx       # docs/specs/onboarding.md §1
      SessionsScreen.tsx      # docs/specs/sessions-drawer.md
      MachinesScreen.tsx      # docs/specs/sessions-drawer.md §4
      MachineFormScreen.tsx   # onboarding.md §2 (VVTerm form) merged w/ Android editor fields
      TerminalScreen.tsx      # docs/specs/terminal-screen.md
      SettingsScreen.tsx      # minimal v1 (Android defaults)
  modules/ghostex-native/     # Expo local module (autolinked)
    expo-module.config.json
    src/                      # TS bindings: GhostexNative module + GhostexTerminalView
    ios/                      # Swift: GhosttyTerminal port + libssh2 SSHClient + registry
      Vendor/                 # GhosttyKit.xcframework, libssh2 xcframework (copied from iOS fork)
    android/                  # Kotlin glue + Java: termux terminal-emulator/-view + SSHJ transport
  docs/specs/                 # extracted implementation specs (source of truth for UI copy)
  ios/ android/               # expo prebuild output, committed (bare workflow)
```

### Project file previews

`DocsScreen` opens a Ghostex page as its page in the Web preview (`openComputerPage` in `src/docs/openComputerFile.ts`,
as chat file links do) and every other project file in `DocViewerScreen`, also used by chat and terminal file links.
`src/docs/page.ts` (`buildDocPage`) applies the browser's existing preview policy when Files supplies a size:
Markdown and HTML render up to 2 MB; other UTF-8 text opens as numbered source with JavaScript, asset loading
and annotations disabled. Images, binary files and files over the limit show their name, kind, size and full
path instead, with Copy Full Path and Share below the metadata and only Reload in the header. Reload measures
the project file again before choosing its mode. The viewer owns loading, cancellation, failures, retry,
clipboard feedback and sharing for all three modes. File links outside Files keep their existing text,
image and media previews and limits.


## Native module contract (`modules/ghostex-native`)

Both platforms implement this API, except the iOS-only bar layout functions and event (`observeBarLayout`, `stopObservingBarLayout`, `onBarLayoutChange`) and the iOS-only file share sheet (`shareFile`), which the shared layer calls only behind `Platform.OS === 'ios'`. TS bindings in `modules/ghostex-native/src/index.ts`.

### Concepts

- **machineId** (string): key for one SSH client connection (multiplexed channels). Reconnecting with new config replaces it.
- **sessionKey** (string, JS-chosen, e.g. `${machineId}:${sessionId}` or `${machineId}:tab:${uuid}`): key for one *terminal entry* in the native registry. An entry owns: terminal engine instance + SSH PTY shell channel. Entries survive view unmount (warm sessions); JS enforces the max-7 warm policy by calling `closeTerminal`.
- **GhostexTerminalView**: native view with prop `sessionKey`; mounting attaches the view to the registry entry (rendering + touch + IME input). Unmounting detaches without killing the entry.

### Module functions (all Promises)

```ts
type SshConfig = {
  host: string; port: number; username: string;
  password?: string; privateKey?: string; passphrase?: string;
};
connect(machineId: string, config: SshConfig): Promise<void>;
disconnect(machineId: string): Promise<void>;
isConnected(machineId: string): Promise<boolean>;
// Non-interactive command in a channel; used for inventory + ghostex CLI actions.
exec(machineId: string, command: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }>;

// PTY terminal lifecycle. command==null → interactive login shell; else run command in PTY.
openTerminal(sessionKey: string, machineId: string, opts: {
  command?: string; termType?: string;      // default "xterm-256color"
  fontSize?: number;                        // initial pt/sp
}): Promise<void>;
closeTerminal(sessionKey: string): Promise<void>;
listTerminals(): Promise<string[]>;

sendText(sessionKey: string, text: string): Promise<void>;   // paste/insert (no newline added)
sendKey(sessionKey: string, key: TerminalKey, mods?: { ctrl?: boolean; alt?: boolean; shift?: boolean; cmd?: boolean }): Promise<void>;
setFontSize(sessionKey: string, size: number): Promise<void>;
scrollToBottom(sessionKey: string): Promise<void>;

uploadFile(machineId: string, localPath: string, remotePath: string): Promise<void>; // SFTP, 0600
generateSshKey(type: 'ed25519' | 'rsa4096', comment: string, passphrase?: string):
  Promise<{ privateKey: string; publicKey: string; fingerprint: string }>;
resetHostKey(host: string, port: number): Promise<void>;

// Terminal keyboard focus. Resolves true when the terminal holds the keyboard focus afterwards; false when no view is
// attached or the platform refused the focus (iOS: `requestKeyboardFocus`; Android: `View.requestFocus()`).
focusTerminal(sessionKey: string): Promise<boolean>;

// iOS only (iOS 27.1 SDK; before iOS 27.1 the layout carries only size and insets). Where the system's bars sit in the
// app's window, now and from then on through `onBarLayoutChange`. A new call replaces the running observation.
observeBarLayout(sideExtent: number, topExtent: number): Promise<{ id: number; layout: BarLayout }>;
stopObservingBarLayout(id: number): Promise<void>;

// iOS only. Share… in the project file browser: the share sheet for one `file://` copy in the app's temporary storage.
// Settles once, when the share is over: the sheet has left the screen and UIKit has reported its last activity's final
// result (an activity cancelled while the sheet stayed open is no end; React Native 0.88's `Share` ignores that
// completion). Resolves when that activity reported no error (shared or cancelled); rejects with `E_SHARE_FAILED` when it
// failed, `E_SHARE_UNAVAILABLE` when no sheet could be shown, `E_SHARE_INTERRUPTED` when its presenting screen went away
// before a result or the module was torn down (reload; OnDestroy ends and dismisses the module's open sheets). Nothing
// settles from a released controller. The caller deletes the copy and releases its one-share lock on either answer.
shareFile(fileUri: string): Promise<void>;
```

`TerminalKey`: `'escape'|'tab'|'enter'|'backspace'|'delete'|'insert'|'home'|'end'|'pageUp'|'pageDown'|'up'|'down'|'left'|'right'|'f1'..'f12'` or a single character (e.g. `'c'` with `{ctrl:true}` → ^C).

### Events (module-level subscriptions)

```ts
onTerminalState: { sessionKey: string; state: 'opening'|'open'|'closed'|'failed'; error?: string; errorCode?: GhostexErrorCode };
onTerminalTitle: { sessionKey: string; title: string };     // OSC title
onTerminalBell:  { sessionKey: string };
onFontSizeChange:{ sessionKey: string; fontSize: number };  // from native pinch-to-zoom
onConnectionState: { machineId: string; state: 'connecting'|'connected'|'disconnected'|'failed'; error?: string; errorCode?: GhostexErrorCode };
onBarLayoutChange: BarLayout;   // iOS only: bar regions, window size and insets, size classes, fold divisions (types in GhostexNative.types.ts)
```

### iPhone Duo chrome (iOS, built with the iOS 27.1 SDK)

The app uses the whole window on the Duo and draws its own header controls next to the status items.

- **Vertical bar disabled app-wide.** `GhostexRootViewController` (`modules/ghostex-native/ios/`, supplied to Expo through the public `ExpoReactDelegateHandler`, registered under `reactDelegateHandlers` in `expo-module.config.json`) answers `preferredVerticalBarBehavior = .disabled` from the first frame, so the status items stand in one row along the top in every pose. Controllers presented over the root (React Native `Modal`, `Alert.alert`) would otherwise flip the status items into a column while shown; `StatusBar.setVerticalBarBehaviorIOS('disabled')` in `index.ts` is Expo's own switch for them (it swizzles `UIViewController.preferredVerticalBarBehavior` inside `expo-status-bar` 58.0.4, the one swizzle the app accepts, for exactly this mechanism). Both are no-ops before iOS 27.1.
- **Placement.** `headerPlacement` (`src/components/common/verticalBar/layout.ts`) reads the reported bar layout: `band` where the system's top bar region lies inside the top safe-area inset (beside the status items), otherwise `top` (the screen's own header under the status bar, as on every other iPhone). The side bar placement (`rail`) stays compiled for a system that stands a vertical bar, but with the bar disabled it is unreachable on the Duo.
- **Band overflow.** Header buttons that do not fit the band row move, last first, into the screen's "More options" menu (`bandSplit`, `useBandOverflow`); Back and "More options" stay. Terminal, Web Preview and the stack header (`StackHeader`) use it.
- **Settings** show two columns when the chrome is in place and the content width holds a 320 pt list and a 375 pt page (`twoColumnWindow`); otherwise one column, at most 640 pt wide.
- **Fold.** Divisions are read natively with `reservedRegions(kind: .division, options: .includeInactive)` and delivered in `BarLayout.divisions`. The band and anchored menus keep off them (menus off the active ones only).
- **Laptop pose.** An active division wider than tall is the laptop pose (`laptopFoldOf` in `layout.ts`; `useLaptopFold` in `verticalBar/laptopFold.ts`, provided by `VerticalBarArea`); a book-pose or inactive division gives none. Gated on it: the terminal and the Befehlspad (`components/terminal/laptopMode.ts`: output above the fold, keyboard up or not, the floating pad in the upper half with its own stored place, the open pad's room reaching below the fold only where the upper half is too short for it even over the header, layers below the fold in the keyboard's place, the text editor above the fold), the chat view above the fold, keyboard up or not (keyboard down: the view ends above the fold, `foldUpperHalfInset`; keyboard up: the composer lifts above it), the keyboard-avoiding layer treating the fold's top as the cover's top (`laptopCoverTop`), sheets starting below the fold and centred cards below or above it, held to that band with longer content scrolling inside, in the window or in the frame of the area they cover (the chat's account-switch card; `components/common/foldAvoidance.ts`), the page sheet's and Web Preview's page ending above the fold (`foldUpperHalfInset`), and lists kept off the fold, so no row is drawn on it at rest or while scrolling (`FoldListFrame` in `components/common/foldGap.tsx`, from the frame measured in the window). A `FlatList` whose rows take their state from the screen or a store runs across the fold: the list fills the frame down to the fold's top, and a copy of it, hidden from VoiceOver and without pull to refresh, fills the frame below the fold's bottom and follows its scroll (a drag on either moves both, on the JS thread, so during a fast fling the lower part trails by a frame or two); content leaving the upper part at the band appears at once below it, and the band adds no scroll distance (`foldListAcross` and the offsets in `layout.ts`; adopted by the Sessions screen's classic list in `sessions-screen/session-list.tsx` and the work-link picker). A scroll view page, and a list whose rows keep state of their own, end above the fold and the lower half stays empty (`foldUpperHalfInset`; adopted by Settings pages and, through `endAboveFold`, the Sessions screen's Unified list, whose cards keep their swipe state), as a running list does while the keyboard is up or while its content fits above the fold. Development builds show the division read in Settings > Advanced > Debug.

### Error codes (rejections carry `code`)

`E_AUTH_FAILED` · `E_HOST_KEY_MISMATCH` · `E_UNREACHABLE` · `E_REFUSED` · `E_TIMEOUT` · `E_NOT_CONNECTED` · `E_CHANNEL_FAILED` · `E_SFTP_FAILED`. JS maps these to the human copy in `docs/specs/sessions-drawer.md` §5. iOS-only `shareFile`: `E_SHARE_UNAVAILABLE` · `E_SHARE_FAILED` · `E_SHARE_INTERRUPTED`, which `src/files/shareSheet.ts` maps to one notice each (`DocsCopy`); any other rejection counts as interrupted.

### View

```tsx
<GhostexTerminalView
  sessionKey={key}
  style={...}
  onSingleTap={() => ...}   // optional: show keyboard
  onCaretChange={({ nativeEvent }) => ...}   // iOS only: { top } of the cursor row, points from the view's top
/>
```

Native view responsibilities (per platform, matching current apps):
- Rendering + scrollback scrolling (iOS: synthetic wheel events w/ momentum per spec §4; Android: Termux TerminalView built-ins).
- IME/soft-keyboard text input directly into the engine (view is the text-input responder).
- Pinch-to-zoom → font size ratchet (±1pt at 1.12/0.89 thresholds) + native HUD ("N pt" / "Font Size") per spec §3, then emit `onFontSizeChange` for JS persistence. Range 4–32, default 13 on every platform.
- Touch text selection (both platforms keep their existing native implementations).
- Scroll-to-bottom on output/keypress (engine behavior; respect autoScroll setting via prop later).
- Cursor row (iOS): `onCaretChange` fires with the top edge of the cursor row (`y - height` of Ghostty v1.3.1 `imePoint`, whose `y` is the cell's bottom) after a draw when its whole-point value changed, and once when the view is attached to the host (`GhosttyTerminalView.reportCaretIfNeeded`). The terminal screen slides the view by it with the keyboard (`docs/specs/terminal-screen.md` §2 "Keyboard: the terminal slides"); the view's own size, and so the grid, does not change with the keyboard. Declared in the iOS module's `Events(...)` and typed in `GhostexTerminalViewProps`; the Android view declares none and JS does not pass the prop there.

### Keyboard accessory: the Befehlspad on iOS, the "2 rows of keys" bar on Android

On iOS the floating pad (`components/terminal/CommandPad.tsx`, state in `useCommandPad.ts`, key logic in `terminalKeyInput.ts`, keys in `commandPadKeys.ts`, geometry and the user's place in `commandPadLayout.ts` (stored per layout as `commandPadPosition`, `settings/commandPad.ts`), layers in `CommandPadLayer.tsx`, editor in `TerminalTextEditor.tsx`) replaces `TerminalKeyBar.tsx` and the floating Upload button; behaviour per `docs/specs/terminal-screen.md` §2 "Befehlspad". Android keeps `TerminalKeyBar.tsx` as before the pad. The paragraph below describes the rows (the key bar's, and on iOS the pad's Keys layer) and the editor.

Both renderers use the same input machine (`terminalKeyInput.ts`, wired to native events, platform haptics and the key haptics setting by `useTerminalKeyInput.ts`), extracted from the key bar. Modifier latching and native sync, repeat timers, custom text actions and agent sequences live there; the bar, pad and layers keep their rendering and gestures. Text actions, sequences and Paste spend one-shot modifiers in both the rendered state and the native keyboard while keeping locks, so the following software-keyboard character cannot inherit a spent modifier.

Rendered in **RN** (the rows in `components/terminal/TerminalKeyBar.tsx` and `CommandPadLayer.tsx`), not a UIKit inputAccessoryView, which keeps it cross-platform. On iOS the pad's text editor stands in `KeyBarDock`, which moves with the keyboard (`useKeyboardMetrics`: a layout animation approximating the keyboard's measured motion (spring on show, ease-out on hide; `keyboardMotion.ts`; Fabric has no keyboard curve) and at once with Reduce Motion on) instead of appearing at once; on Android the key bar stays in the layout flow. Discrete keys go through `sendKey` (low rate, bridge OK). Layout/behavior of the rows per `docs/specs/terminal-screen.md` §2: default rows [Esc, Shift, NEWLN(Ctrl-J), Home, ↑, End, PGUP] / [Tab, Ctrl, Alt, ←, ↓, →, PGDN], one-shot modifier latching, repeat-on-hold (350ms then 50ms) for arrows/home/end/page keys.

## Ghostex CLI contract

Same as both existing apps — JSON over SSH, no gxserver wire protocol:
- Inventory: `"$SHELL" -lc 'ghostex sessions --json --mobile-summary'` (5s poll while sessions screen visible; scan stdout for first JSON object containing `sessions`; keep provider=="zmx" only).
- Attach: `openTerminal` with the `ghostex attach --session-id …` command wrapped in a login shell; after first render send `\x1b]1337;ZMX_REFRESH\x07` once (~2s).
- Actions: `create-session`, `create-agent`, `run-action`, `move-project`, `restore-recent-project`, `rename-session`, wake/sleep/kill/focus via `ghostex` CLI; machine health: `ghostex android-check --json` (works for any mobile client).
- Quoting: single-quote with `'"'"'` escaping; login-shell wrapper `"$SHELL" -lc '<cmd>'`.

## Defaults (from the Android app)

autoScroll=true · doneNotificationSound=true · refreshButton=false · fileUploadButton=true · keyboardButton=false · hideKeyboardOnStartup=true · terminal dark-only theme, background `#000000` fallback ("Aizen Dark" port later).

## Licensing

GPL-3.0 (inherits from Termux-derived Java and VVTerm-derived Swift/spec).
