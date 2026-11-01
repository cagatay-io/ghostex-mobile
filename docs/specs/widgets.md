# Home Screen widgets — Implementation Spec (iOS)

One Ghostex widget in three sizes on the Home Screen; StandBy shows the small one. It shows the app's last view of the
agents on the computers: no push reaches it, so it is as fresh as the app's last session refresh, and every size says
when that was. Code: `src/notifications/widgetSnapshot.ts`, `widgetWriter.ts`, `widgets.ts`; native
`modules/ghostex-widgets` (app side and the widget's SwiftUI in `ios/Extension`), compiled into the WidgetKit extension
of `plugins/withWidgets.js` together with the Live Activity.

## 1. Sizes and content

| Size                 | Shows                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small (also StandBy) | Ghostex mark; "Needs you" with a bell while an agent waits; the number of working agents and the number of waiting agents, each with its glyph and word; "Updated {time}"                                                                                                             |
| Medium               | Left: the small widget's content. Right: the first three agents in two lines (mark and name; state glyph and word, project) or, with none working or waiting, "No agent is working or waiting."                                                                                       |
| Large                | Head: mark, "{n} working", "{n} waiting", "Needs you" while one waits. Rows: up to eight agents, as many as the height leaves room for, one line each (mark, name, project, state glyph and word, "since {time}"). Usage bars where the app has usage (below). Foot: "Updated {time}" |

- Agents: working and waiting, waiting first; inside a state the longest wait and the longest work first. Finished
  agents are neither counted nor listed. A waiting agent with a question says "waiting" (the snapshot carries no
  question field).
- "No agent is working or waiting." (medium and large, in the agents' place) only when both counts are 0. An agent
  counted without a row (a computer that sends no start time, an approval without a time) leaves that place empty;
  the counts still show it.
- Text level: event and session only. Agent name, project, state and times; no prompt, reply or session title.
- No data written yet (or a snapshot of another version): the Ghostex mark only, no numbers.
- Colour never carries meaning alone: every state colour comes with its glyph (open arc working, clock waiting, bell
  "Needs you") and word, so the tinted Home Screen and StandBy at night (red) keep the meaning. Dark: the app's
  surface and state colours; light: white surface, the darker state tones the app uses on light surfaces. StandBy and
  tinted mode remove the background (`containerBackground`).
- Tapping a widget opens the app.

## 2. Usage bars (large)

- From the selected computer (the one the Sessions list shows): its saved, enabled Claude and Codex accounts as the
  usage pane lists them (`agentAccounts` with `operation: "list"`, `src/usage/client.ts`), one bar per usage window in
  the pane's order, the first six. Label "{Provider} {window}" ("Claude 5h"); where the computer has more than one
  account of a provider, "{account name} {window}". Percent as the pane rounds it, kept within 0 to 100; "Resets
  {time left}" counting down (iOS 18; a timer before), gone once the reset has passed.
- Read while the summary poll runs, when no read of the selected computer started in the last 2 minutes, also after
  switching to another computer and back; the computer answers from a reading of up to 2 minutes anyway. Never in the
  background. Each computer keeps its last reading, so switching back shows its bars again while they are fresh.
- No bars without usage: no account, no usage window, a window without a readable percent, a reading older than
  5 minutes, or a reading of another computer. No empty bars, no 0 %.

## 3. Data path

- After every session refresh the app builds the snapshot (`buildSnapshot`, `widget-snapshot` format version 1:
  `schemaVersion`, `writtenAt`, `counts`, `attention`, `agents` (at most 8), optional `usage.bars` (at most 6)) over
  every enabled computer's summary, with the Live Activity's classification of a session (`candidateFor` in
  `contentState.ts`), and writes it as `widget-snapshot.json` into the App Group container (atomic), then asks
  WidgetKit to reload the widget (`reloadTimelines(ofKind: "GhostexStatus")`), once per write.
- Data time (`writtenAt`): when the oldest summary used was read; the refresh time when every computer answered.
- A refresh that changes nothing shown, compared with the data time to the minute, writes nothing; while the poll runs
  an unchanged state is written once a minute, so the shown time stays current.
- Nothing is written before the first summary was read. Removing the last computer deletes the file.
- Not written while the app is in the background (no refresh runs). `refreshWidgets()` reads every summary again and
  writes, for a background wake.
- An agent of a computer that does not send a start time (`workingStartedAt`, `attention.enteredAt`) is counted but
  gets no row. On a computer that does not send `attention.kind`, every agent in attention counts as waiting.

## 4. App Group and signing

- `com.apple.security.application-groups` in app.json's `ios.entitlements` (`group.<bundle id>`); the plugin gives the
  extension the same group (`GhostexLiveActivityExtension.entitlements`) and both Info.plists the key
  `GhostexAppGroup = $(GHOSTEX_APP_GROUP)`, the build setting it sets from app.json. A build signed by another team
  overrides `GHOSTEX_APP_GROUP` (and its app entitlements) with a group of its own; the code reads only the key.
- The extension keeps one bundle id (`<app bundle id>.liveactivity`) for the Live Activity and the widgets.
