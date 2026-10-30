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
    inventory/                # inventory client (exec over native ssh), 5s polling on every screen (summaryRefresh.ts), per-machine fan-out
    notifications/            # Live Activity: content state from the summaries, start/update/end controller (modules/ghostex-live-activity)
    terminal/                 # tab/session state, warm-session policy (max 7, within a scrollback-row budget), attach orchestration
    commands/                 # ghostex CLI command builders (login-shell wrapping, quoting)
    notifications/            # agent notifications + attention list (see "Agent notifications" below)
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

## Native module contract (`modules/ghostex-native`)

Both platforms implement this API, except the iOS-only bar layout functions and event (`observeBarLayout`, `stopObservingBarLayout`, `onBarLayoutChange`), which the shared layer calls only behind `Platform.OS === 'ios'`. TS bindings in `modules/ghostex-native/src/index.ts`.

### Concepts

- **machineId** (string): key for one SSH client connection (multiplexed channels). Reconnecting with new config replaces it.
- **sessionKey** (string, JS-chosen, e.g. `${machineId}:${sessionId}` or `${machineId}:tab:${uuid}`): key for one _terminal entry_ in the native registry. An entry owns: terminal engine instance + SSH PTY shell channel. Entries survive view unmount (warm sessions); JS enforces the max-7 warm policy by calling `closeTerminal`.
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

### Error codes (rejections carry `code`)

`E_AUTH_FAILED` · `E_HOST_KEY_MISMATCH` · `E_UNREACHABLE` · `E_REFUSED` · `E_TIMEOUT` · `E_NOT_CONNECTED` · `E_CHANNEL_FAILED` · `E_SFTP_FAILED`. JS maps these to the human copy in `docs/specs/sessions-drawer.md` §5.

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

### Keyboard accessory ("2 rows of keys")

Rendered in **RN** (shared component `components/TerminalKeyBar.tsx`), pinned above the keyboard via keyboard-height tracking (not a UIKit inputAccessoryView, which keeps it cross-platform). On iOS it stands in `KeyBarDock`, which moves with the keyboard (`useKeyboardMetrics`: a layout animation approximating the keyboard's measured motion (spring on show, ease-out on hide; `keyboardMotion.ts`; Fabric has no keyboard curve) and at once with Reduce Motion on) instead of appearing at once; on Android it stays in the layout flow. Discrete keys go through `sendKey` (low rate, bridge OK). Layout/behavior per `docs/specs/terminal-screen.md` §2: 2×7 grid, default rows [Esc, Shift, NEWLN(Ctrl-J), Home, ↑, End, PGUP] / [Tab, Ctrl, Alt, ←, ↓, →, PGDN], one-shot modifier latching, repeat-on-hold (350ms then 50ms) for arrows/backspace/home/end/page keys, height 88, theme background.

## Ghostex CLI contract

Same as both existing apps — JSON over SSH, no gxserver wire protocol:
- Inventory: `"$SHELL" -lc 'ghostex sessions --json --mobile-summary'` (5s poll on every screen while the app is in the foreground and a machine is selected, `src/inventory/summaryRefresh.ts`; scan stdout for first JSON object containing `sessions`; keep provider=="zmx" only).
- Attach: `openTerminal` with the `ghostex attach --session-id …` command wrapped in a login shell; after first render send `\x1b]1337;ZMX_REFRESH\x07` once (~2s).
- Actions: `create-session`, `create-agent`, `run-action`, `move-project`, `restore-recent-project`, `rename-session`, wake/sleep/kill/focus via `ghostex` CLI; machine health: `ghostex android-check --json` (works for any mobile client).
- Quoting: single-quote with `'"'"'` escaping; login-shell wrapper `"$SHELL" -lc '<cmd>'`.

## Agent notifications and the attention list (`src/notifications/`)

Local notifications while the app runs and the attention list (the computer's notification feed, the desktop bell's list with its read state). No push: nothing reaches a suspended app, and the list is the reliable view after a reconnect.

- **Wiring.** `feedStore.ts` is the only module that touches the app: `initAttentionNotifications()` (called once from `App.tsx`) runs the one-time permission ask, installs the tap handler and starts one `FeedEventSource` for the app's lifetime; its zustand store (`feeds` per enabled computer, iOS `permission`) feeds the list, the bell and Settings. Whenever a read brings a session row that is new or changed its kind (also on a first read and with notifications off), and on an explicit refresh (the list comes into view or is pulled, the app comes back) when the feed has a `needsInput` row, the computer's session list is read again (`refreshMachineFresh`), so the list's join ("has a question", agent, project) is current; polls alone do not read it. A session-list read serves only feed rows that arrived before it started; rows that arrive during it wait for one more read after it.
- **Reading the feed.** Over the warm link to the computer's gxserver: `POST /api/readNotificationFeed`, changes through `POST /api/updateNotificationFeed` (`markRead`, `markUnread`, `dismiss`, `markAllRead`, `clearAll`) (`feedClient.ts`). `eventSource.ts` reads every 5 s, every 30 s while a computer cannot be read; a computer whose `ghostex server endpoint` lists `notificationStream` announces changes on `/api/events?stream=notifications` (`feedStream.ts`) and is read on each announcement, otherwise every 60 s. That channel is open only while its computer is shown and the app is in front, one per computer: hiding or removing the computer, or the app going to the background, closes it, also while its forward is still being looked up, so the lookup's answer opens no channel then (`ensureStream` in `feedStore.ts`). A computer without the feed on the phone's route shows a notice in the list (`legacy`). `feedContract.ts` is the trust boundary: it never copies a row's message text. Failures go to the app log as a fixed word (`refused`, `unreadable`, `legacy`, `unreachable`, `unexpected`), never the computer's or iOS's error text.
- **From row to notification.** An unread row is a new event when its id was not there at the previous read or its kind changed (the host turns a session's unread `finished` row into `needsInput` in place); a row only marked read or unread again is none. While the app runs, also briefly in the background, new rows notify. The first read of a computer, the first after a failed one, and the first read after the app comes back from the background (from the first app state after `background`; iOS returns through `inactive`) only record what is there; a read still under way when the app starts returning from the background is dropped, so it neither notifies nor counts as that first read. `notify.ts` (`processHostEvents`) maps it (`events.ts`): only sessions in that computer's session list notify, only `finished`, `needsInput` (waiting, or "has a question" when the session has an open question card, `awaitingAnswer`, read only when the summary's `capabilities` announce it, or its `pendingQuestionCount` is above zero) and `failed` (written by the computer after its five quick retries of a transient error, at once for a permanent one or a program error, never on a user abort; the session's state is not read for it); then the Settings switches (`settings.ts`, `settings.v1` key `notifications`), none for the session open on screen (the app active and the focused Terminal screen showing its terminal or Chat View, `sessionOnScreen` in `src/terminal/zmxDisplay.ts`; its row stays in the list, and its event counts as seen, so a later copy announces nothing), and the gate of the record of announced events (`eventIdentity.ts`): one notification and one sound per event, within the rate limit (`rateLimit.ts`: one notification per session per 20 s, 8 per 60 s, counting every notification and every Sessions-list attention sound, kept across launches; a row's notification within 20 s after the attention sound of the event that named that row is part of that sound). The text is "agent · project" plus the event, never the agent's text.
- **One event, one notification, one sound.** `eventIdentity.ts` keeps the app's record of announced events, states its three invariants (an event gets at most one notification and at most one sound, across feed, live-channel, push and Sessions-list copies, delays, reordering and restarts, as far as its copies can be told apart; a first delivery is announced or held back by an existing rule, never dropped because the record is full or still loading; the record stays within its bound), the two accepted exceptions below and the identity contract the push route depends on, and is the one gate every announcing route goes through (`announce`): the feed's notifications and later the push through `processHostEvents`, the Sessions list's attention sound through `announceAttentionTransitions` (both in `notify.ts`; `src/app/alerts.ts` calls the second). An event is announced once any route made it seen or heard; a later copy gets only what it has not had yet (its notification, which carries the sound when the sound is still due, or the attention sound), each once. The record owns the app's one rate limit and stores its grants with the events. The limit counts what the person gets: every notification and every attention sound takes a grant, except a row's notification within 20 s after the attention sound of the same event, which the computer links by naming that row for the attention: that is the same announcement. Later than that, in the other order (the sound after a notification that came without it), and without that link, every part takes a grant of its own. What the limit or the switches hold back adds nothing (an event that already sounded keeps its sound), so a later copy brings it. A copy held back for the session open on screen makes its event seen (`seenOnScreen`): no later copy announces it, by notification or sound, also after the person left the session; seeing takes no grant and adds no announced event. The seen events are kept apart per computer as ids under the same identity: the row and kind (while the row is in the feed, or for two hours from when it was seen), or the row the Sessions list named until a kind of it comes; in the attention a copy provably came in, that attention's event of the kind (two hours), for a push without the row id; and the attention whose Sessions-list copy was seen, with the row that copy named, until the session leaves it or another attention of the session is seen. A seen copy covers only its own event: the Sessions list's copy covers its attention's later list copies and the row it named, never another row, and a row seen on screen does not cover a Sessions-list copy that named no row. At most 363 ids per computer (three for one event a minute over the window's 121 minutes); past that the oldest go first, so the worst case is one late notification or sound for an event the person saw, never a second announcement of an announced event. A feed row is the event: computer + session + row id + the host kind it entered (an in-place `finished` → `needsInput` is a second event of the row); it stays one event whatever the session list shows when it comes again. The Sessions list names no kind. From a computer that sends the feed row written for the attention (`attention.notificationId`, optional in the session summary, the same id a push carries) and announces it (`capabilities.attentionNotificationId`), the list's copy is that row's first event, exactly. From a computer that does not send it, or sends it without that flag (the id is then not used), the list's copy is an event of its own, its attention's: no row is matched to it, nothing is swallowed, and the sound and the row's notification are two announcements, each within the rate limit. Both count for the same session, so the one-per-session rule holds back the row's notification when it comes within 20 s after the sound; the app reads the session list before it handles a new row, so the sound normally comes first. With such a computer and the attention sound on, an attention event therefore usually brings the sound and its row in the attention list, but no notification, unless a later copy of the row comes. A push without `data.notificationId` is matched only within the session's attention it came in, as the event of the same kind there, never to the Sessions list's copy. A row joins an attention only when the session list read after it shows the session in attention since no later than the row was written. What is remembered rests on the host's push contract: gxserver sends each alert push once, at the event, with a time-to-live of at most 3600 s and never again, and a feed row can be read again only while it is in the feed. So the record keeps each announced event while its row is in its computer's feed as last read, and for two hours after its first announcement (the push's hour and an hour of margin), judged at the time a copy arrived, not when it is handled: while a copy waits (for the stored record, for the session list, while iOS pauses the app) the record forgets nothing it kept when the copy arrived. A Sessions-list copy that the named row's kind took over later is kept for two hours from that takeover instead, because the kind's event (a row turned into `needsInput` in place) and its push can come long after the sound; one that names its row is kept like that row's events. A session's current attention keeps its first event (the Sessions list's copy, else the first row linked to it) until the Sessions list shows the session out of it, because the list may see the session enter it late. The bound follows from the rate limit, since every first announcement took a grant: at most 968 events from the window (8 a minute over the window's 121 minutes), plus per computer the events of its feed's 40 rows, one per session in attention, and for events kept from a takeover within the window whose sound came before it, one per session plus one per row of the feed; the record checks it after every change and, should it ever hold more, keeps every event and logs it. Nothing is rejected for its age: a first delivery is always handled. The record is kept in AsyncStorage (`notifications.announced.v1`) across launches: ids, kinds, channels, times, the rate limit's grants of the last minute and the ids of events seen on screen, never text; `initAttentionNotifications` reads it once the saved computers are loaded (that load can merge two records of one computer and move what was saved under the dropped id, this record included, to the one it keeps), and every notification and attention sound that arrives before it is read waits for it and then goes out in the order it came (a stored record that cannot be read is reported, and the waiting events are handled all the same). Two accepted exceptions. The app shows a notification or plays a sound first and writes the record right after: if iOS ends the app in between, the next launch does not know, so that event can be announced a second time but is never lost, the grants lost with that write let up to one more batch of other notices through in the minute after that launch, and a Sessions-list sound that a row's kind took in that moment can be taken by the row's next kind instead, which then comes without its own sound. And if the person changes the phone's clock by hand: set back, the record moves all its times back by as much as the latest of them lies ahead of the clock and stores that, so it forgets nothing early and the limit holds notices back for at most one more minute; set forward, an event can be forgotten early and announced a second time, and up to one more batch of notices than the limit allows can come in the minute after the change, for a change of any size (the phone's clock alone cannot tell a clock set forward from time that passed). A hidden computer keeps its record; a removed one keeps its events and the rows and kinds it saw on screen until their window ends (added again it is a new computer). A push without a row id outside its attention, or a copy outside the host contract (sent again, or later than an hour), is announced again: the push route sends `notificationId` for exactly one notification.
- **Posting and taps.** `notificationCentre.ts` is the only `expo-notifications` user (iOS only; local notifications, config plugin `enableRemoteNotifications: false`). A notification's `data` is `{kind, machineId, sessionId, url, notificationId}`; a tap opens `ghostex://session?machineId=&sessionId=` (`&view=question` opens the Chat View at its question card when the session has one; at a cold start the link waits until the saved computers, Settings and the terminal's saved views are loaded (`deepLinkStoresReady` in `src/app/deepLinks.ts`), then the session is attached and switched to its Chat View once the session list shows it, read anew right after the attach when it is not there yet; `src/app/deepLinkHandler.ts`) and marks the row read. `firstAsk.ts`: the iOS prompt once on the first launch with notifications; Allow turns the master and the three switches on, Don't Allow leaves them off.
- **UI.** `attentionRows.ts` builds the rows (newest first, joined to the session list for agent, project and "has a question"); `AttentionList.tsx` draws them in Unread and Read groups with the row menu at the held row, and takes `onOpenSession`, so the screen (`src/screens/AttentionListScreen.tsx`, with Mark All Read and Clear All in the "…" menu, which stands under its button) and a later pane can mount it; `NotificationsBell.tsx` is the Sessions header's bell with the unread count; Settings › Notifications is `src/screens/settings/NotificationsPage.tsx`. In the shared `ContextMenu` each command, a command's (i) (beside it, not inside it), the lifted row and the dimmed screen ("Close menu") are separate VoiceOver elements.
- **Tests.** Pure modules under `bun test src/notifications` (and `src/app/deepLinks.test.ts`), including the record's randomized model test (`eventIdentity.model.test.ts`: both announcing routes against an independent reference that counts every notification and sound as the person gets it and matches copies by the host's own origin (the row id, and the row a computer names for an attention; without that name the list's copy is its attention's own event), over seeded sequences of feed reads, pushes, the Sessions list's attention sound, the sound switched off and on, sessions open on screen and leaving attention, restarts (also over a hundred an hour, and the app ended before its write) with stored records that load at once, after seconds or after hours, clock changes back and forward, rate-limit pressure and computers hidden, removed and added again; the invariants, the rate and the bound are checked after every step, each failure naming its seed, and the only deviations allowed are those the two exceptions describe, a clock set forward, by any amount, letting one more batch through in the minute after it; a separate test checks that bound for forward changes of less than a minute; fixed cases replay the counterexamples earlier versions failed); the summary's capabilities and question fields (`src/contract/mobileSummary.test.ts`); the list, the screen's menu, the bell, the Settings page and the app wiring (`feedStore.rntl.ts`: the real `initAttentionNotifications` with AppState, the alerts sound and the feed endpoint faked at their boundaries) as `*.rntl.ts(x)` under `bun run test:jest`.

## Defaults (from the Android app)

autoScroll=true · doneNotificationSound=true · refreshButton=false · fileUploadButton=true · keyboardButton=false · hideKeyboardOnStartup=true · terminal dark-only theme, background `#000000` fallback ("Aizen Dark" port later).

## Licensing

GPL-3.0 (inherits from Termux-derived Java and VVTerm-derived Swift/spec).
