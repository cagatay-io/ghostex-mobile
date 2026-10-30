import type { AddProjectSourceId } from '../addProject/client';
import type { ContextSession } from '../files/sessionContext';
import type { SettingsPageId } from '../screens/settings/pages';

/**
 * Add/edit machine form params. `tailcatToken` prefills the Easy Connect
 * address when the scanner read a bare legacy address. `focus` opens the
 * editor with that field focused (Can't reach → Wrong password → Edit machine).
 */
export type MachineFormParams = { machineId?: string; tailcatToken?: string; focus?: 'password' } | undefined;

/** Root native-stack route map. */
export type RootStackParamList = {
  /** First launch: shown only while no machine is saved. */
  Welcome: undefined;
  /** "How does your phone reach your computer?": Easy Connect vs Tailscale. */
  ConnectChoose: undefined;
  /**
   * One scanner for both pairing codes. `rePairMachineId` makes an Easy Connect
   * code replace that machine's address and key instead of adding a machine.
   * `incomingCode` is a pairing link the system camera opened the app with
   * (src/app/deepLinks.ts); `at` tells two openings of the same link apart.
   */
  ScanCode: { rePairMachineId?: string; incomingCode?: { payload: string; at: number } } | undefined;
  /** The Tailscale (plain SSH over the tailnet) form: the manual "type the details" path. */
  TailscaleForm: MachineFormParams;
  /** End of setup: names the computer, the user and the live session count. */
  Connected: { machineId: string };
  /** The "Can't reach <computer>" checklist screen (registered once a machine exists). */
  CantReach: { machineId: string };
  /** Per-OS "turn on SSH access" instructions as a full screen. */
  SshAccessHelp: { platform?: 'macos' | 'windows' | 'linux' } | undefined;
  Sessions: undefined;
  /** The voice agent's conversation screen (the top bar's Voice button, the "Voice mode on" notification). */
  Voice: undefined;
  Machines: undefined;
  /**
   * Add/edit form. `tailcatToken` prefills the Easy Connect address when the
   * scanner read a bare legacy address (the Advanced "Pairing address" row).
   */
  MachineForm: MachineFormParams;
  Terminal: { sessionKey: string; machineId: string; title?: string };
  /** Find Prompts: search every prompt this machine sent to an agent (`gx f`). */
  FindPrompts: { machineId: string };
  /** One Find result in full, addressed by its stable prompt key. */
  FindPrompt: { machineId: string; promptKey: string };
  /** Web preview opening screen: enter an address or select a listening port. */
  WebPreviewPorts: { machineId: string };
  /** Browse a computer-side port through SSH, or an ordinary website directly. */
  WebPreview: { machineId: string } & (
    | {
        remotePort: number;
        path?: string;
        scheme?: 'http' | 'https';
        /** The loopback host the link named (`localhost` when absent), which the computer dials. */
        host?: string;
        url?: never;
      }
    | { url: string; remotePort?: never; path?: never; scheme?: never; host?: never }
  );
  /**
   * Files: a project's file browser, the whole project folder by folder with search, Recently changed on top.
   * `session`: the agent session it was opened from (the terminal screen's menu), which Add to Session Context
   * fills (REQ-FILES-010); absent when opened from a project's menu.
   */
  Docs: {
    machineId: string;
    projectId: string;
    projectName: string;
    projectPath: string;
    session?: ContextSession;
  };
  /**
   * One file the file browser opened that is not Markdown or HTML: as source, or its name and size only
   * (REQ-FILES-002, -006). `entryPath` is its path in the project as gxserver lists it, `path` its full path on
   * the computer, `size` its size in bytes when known, `session` the agent session the browser was opened from,
   * which the source view's Add to Session Context fills (REQ-FILES-010).
   */
  ProjectFile: {
    machineId: string;
    projectId: string;
    entryPath: string;
    path: string;
    size: number | null;
    session?: ContextSession;
  };
  /** A project's Changes, read-only: its diff against main or HEAD, as the desktop Changes tab shows it. */
  Changes: { machineId: string; projectId: string; projectName: string };
  /**
   * One Markdown or HTML file from the computer, by absolute path. `fragment` scrolls to an anchor
   * (a link such as `other.md#setup`).
   */
  DocViewer: {
    machineId: string;
    path: string;
    fragment?: string;
    /** The session's project, whose file link streams a video or audio file (`docs/mediaStream.ts`). */
    projectId?: string;
    /** Opened from Files: the file's path in the project, which Share… fetches (REQ-FILES-009). */
    entryPath?: string;
    /** Opened from Files from an agent session: the session Add to Session Context fills (REQ-FILES-010). */
    session?: ContextSession;
  };
  /**
   * Send Bug / Feedback; `machineId` is the computer the "Collect more data with an agent" switch uses,
   * `crashReportId` a stored crash report to attach (the next-launch crash prompt), `collectWithAgent`
   * starts with that switch on (the chat's Copy Report).
   */
  Feedback: { machineId?: string; crashReportId?: string; collectWithAgent?: boolean } | undefined;
  /** Settings home: the list of Settings pages. */
  Settings: undefined;
  /** One Settings page (Interface, Chat, Terminal, Keyboard, Sounds, Connection, Updates, Advanced). */
  SettingsPage: { page: SettingsPageId };
  ExtraKeysEditor: undefined;
  AgentHotkeysEditor: undefined;
  /** Add Project step 1: pick a source on an already-chosen machine. */
  AddProjectSource: { machineId: string };
  /** Add Project local branch: type or browse a folder, then register it. */
  AddProjectLocal: { machineId: string };
  /** Add Project clone branch: enter a URL or a provider repository path. */
  AddProjectRepository: { machineId: string; source: AddProjectSourceId };
  /** Add Project clone branch: choose where the repository is cloned to. */
  AddProjectDestination: {
    machineId: string;
    remoteUrl: string;
    repositoryTitle: string;
    repositoryUrl: string;
  };
};
