import { GhostexNative, type ExecResult } from '../../modules/ghostex-native/src';
import { isDemoMachineId } from '../demo/identity';
import { execDemoCommand } from '../demo/world';
import { loginShellCommand, shellQuote } from '../commands/ghostexCli';
import {
  cliArguments,
  powershellCommand,
  powershellPrelude,
  powershellQuote,
  readablePowerShellError,
  stdinBase64,
  stdinBase64Bytes,
  windowsCliScript,
  windowsEnvironmentProbe,
  windowsProcess,
} from './powershell';
import { noteLinkAnswer, trackLinkTransfer } from './linkActivity';
import { MAX_ADMISSION_WAIT_MS, withCommandChannel } from './channelBudget';
import { resetAfterAbandonedUpload } from './channelPressure';
import { logAppEvent } from '../app/appLog';
import { File, FileMode } from 'expo-file-system';
import {
  WINDOWS_UPLOAD_PIECE_BYTES,
  base64Bytes,
  uploadedLength,
  windowsPieceTimeoutMs,
  windowsUploadCleanupCommand,
  windowsUploadPieceCommand,
  type WindowsUploadTarget,
} from './windowsUpload';

export type RemoteEnvironment = { kind: 'posix' } | { kind: 'powershell' } | { kind: 'wsl'; distribution: string };

export type RemoteScript = { posix: string; powershell: string };
const environments = new Map<string, Promise<RemoteEnvironment>>();
const resolved = new Map<string, RemoteEnvironment>();
const PROBE_TIMEOUT = 15000;

/** A command over the machine's connection; its answer proves the connection alive (`linkActivity.ts`). */
function exec(machineId: string, command: string, timeoutMs: number): Promise<ExecResult> {
  return logFailedCommand(
    machineId,
    command,
    withCommandChannel(machineId, timeoutMs, () =>
      noteLinkAnswer(machineId, GhostexNative.exec(machineId, command, timeoutMs)),
    ),
  );
}

function execWithInput(machineId: string, command: string, input: string, timeoutMs: number): Promise<ExecResult> {
  return logFailedCommand(
    machineId,
    command,
    withCommandChannel(machineId, timeoutMs, () =>
      noteLinkAnswer(machineId, GhostexNative.execWithInput(machineId, command, input, timeoutMs)),
    ),
  );
}

/** The verb of a command for the log (`ghostex sessions`), never its arguments. */
function commandVerb(command: string): string {
  const ghostex = /\bghostex(?:\.exe)?\s+([a-z][a-z-]*)/u.exec(command);
  if (ghostex !== null) return `ghostex ${ghostex[1]}`;
  return command.trim().split(/\s+/u)[0]?.slice(0, 24) ?? 'command';
}

function logFailedCommand<T>(machineId: string, command: string, settled: Promise<T>): Promise<T> {
  return settled.catch((error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    const text = error instanceof Error ? error.message : String(error);
    logAppEvent(
      `Command: ${machineId}: ${commandVerb(command)} failed (${typeof code === 'string' ? code : 'error'}: ${text.slice(0, 120)})`,
    );
    throw error;
  });
}

/** The longest an upload keeps a quiet link from being judged, and the longest any upload may take. */
const UPLOAD_TRANSFER_MAX_MS = 10 * 60_000;
/** Every upload may take this long on top of its bytes (opening its channel, the computer's answers). */
const UPLOAD_BASE_MS = 60_000;
/**
 * The slowest rate an upload is allowed before it is given up: 64 KB/s, over twice its bytes, since iPhone builds
 * before the issue #647 fix send a picture twice (SCP, then the exec upload).
 */
const UPLOAD_FLOOR_BYTES_PER_MS = 64;
const UPLOAD_SENDS = 2;

/** The phone file at `localPath`, or null when it is not there (or cannot be named as a URI). */
function localFile(localPath: string): File | null {
  for (const uri of [`file://${encodeURI(localPath)}`, `file://${localPath}`]) {
    try {
      const file = new File(uri);
      if (file.exists) return file;
    } catch {
      // The other spelling of the URI.
    }
  }
  return null;
}

/** The local file's size in bytes, or null when it cannot be read (the upload then gets the longest deadline). */
function localFileSize(localPath: string): number | null {
  try {
    const size = localFile(localPath)?.size;
    return typeof size === 'number' && size >= 0 ? size : null;
  } catch {
    return null;
  }
}

function uploadDeadlineMs(size: number | null): number {
  if (size === null) return UPLOAD_TRANSFER_MAX_MS;
  return Math.min(UPLOAD_TRANSFER_MAX_MS, UPLOAD_BASE_MS + (size * UPLOAD_SENDS) / UPLOAD_FLOOR_BYTES_PER_MS);
}

function spokenDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} minutes`;
}

/**
 * Uploads a phone file to `remotePath` over the machine's connection, as one heavy transfer: while it
 * runs, a quiet link is busy, not lost, so no liveness check tears the connection down under it.
 * A Windows computer (PowerShell or WSL) takes it through PowerShell (`windowsUpload.ts`); the native upload,
 * SCP with a `cat >` fallback, cannot write there.
 */
export async function uploadOverLink(machineId: string, localPath: string, remotePath: string): Promise<void> {
  if (!isDemoMachineId(machineId)) {
    const target = await remoteEnvironment(machineId);
    if (target.kind !== 'posix') return uploadToWindows(machineId, target, localPath, remotePath);
  }
  return uploadNatively(machineId, localPath, remotePath);
}

/**
 * CDXC:RemoteMachines 2026-11-17 WHY:
 * An upload always ends (issue #647: a picture sent from the phone's chat never arrived, the chat box waited 6+
 * minutes, no error). iPhone builds without the native fix wait in native code for good when the computer stops
 * taking the bytes (a remote command that ended at once leaves libssh2 answering EAGAIN forever) while the connection
 * answers every check, so the transfer kept checks and the stuck-close reset away and nothing ever failed. Past a
 * deadline from the file's size the upload fails with words the chat shows (it retries once, then the picture stays
 * in the chat box for Send), the transfer stops deferring checks, and the connection gets the planned reset under its
 * usual rules (`resetAfterAbandonedUpload`): only a new connection ends the native upload and gives its slot back.
 * Newer builds fail such an upload natively within a minute (SSHUpload.swift `uploadStallSeconds`).
 */
function uploadNatively(machineId: string, localPath: string, remotePath: string): Promise<void> {
  const size = localFileSize(localPath);
  const deadlineMs = uploadDeadlineMs(size);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startDeadline: () => void = () => undefined;
  const late = new Promise<never>((_, reject) => {
    startDeadline = () => {
      timer = setTimeout(() => {
        logAppEvent(
          `Upload: ${machineId}: not finished after ${Math.round(deadlineMs / 1000)} s ` +
            `(${size === null ? 'size unknown' : `${Math.round(size / 1024)} KB`}); given up`,
        );
        reject(new Error(`the computer did not finish taking it in ${spokenDuration(deadlineMs)}`));
        void resetAfterAbandonedUpload(machineId);
      }, deadlineMs);
    };
  });
  // The deadline starts once the upload has its slot, after its transfer began, so the transfer has ended (it has the
  // same length) when the reset looks for one. The slot is still given back only when the native call settles
  // (`withCommandChannel`), which the reset makes happen.
  const upload = withCommandChannel(machineId, MAX_ADMISSION_WAIT_MS, () =>
    trackLinkTransfer(machineId, deadlineMs, () => {
      startDeadline();
      return GhostexNative.uploadFile(machineId, localPath, remotePath);
    }),
  );
  return Promise.race([upload, late]).finally(() => clearTimeout(timer));
}

/**
 * Sends the file to a Windows computer in pieces, each one PowerShell command fed base64 on its stdin and bounded by
 * its own deadline; the computer's file length is checked after every piece. A failed upload removes what it left.
 */
async function uploadToWindows(
  machineId: string,
  target: WindowsUploadTarget,
  localPath: string,
  remotePath: string,
): Promise<void> {
  const file = localFile(localPath);
  if (file === null) throw new Error('the file is no longer on this phone');
  const handle = file.open(FileMode.ReadOnly);
  let sent = 0;
  try {
    for (let first = true; ; first = false) {
      const piece = await handle.readBytes(WINDOWS_UPLOAD_PIECE_BYTES);
      if (piece.length === 0 && !first) break;
      const command = windowsUploadPieceCommand(target, remotePath, first);
      const timeoutMs = windowsPieceTimeoutMs(piece.length);
      const result = readableResult(
        await logFailedCommand(
          machineId,
          command,
          withCommandChannel(machineId, MAX_ADMISSION_WAIT_MS, () =>
            trackLinkTransfer(machineId, timeoutMs, () =>
              GhostexNative.execWithInput(machineId, command, base64Bytes(piece), timeoutMs),
            ),
          ),
        ),
      );
      sent += piece.length;
      const length = uploadedLength(result.stdout);
      if (result.exitCode !== 0 || length !== sent) {
        throw new Error(
          result.stderr.trim() || `the computer has ${length ?? 'none'} of the ${sent} bytes sent so far`,
        );
      }
      if (piece.length < WINDOWS_UPLOAD_PIECE_BYTES) break;
    }
  } catch (error) {
    logAppEvent(`Upload: ${machineId}: Windows upload stopped after ${Math.round(sent / 1024)} KB`);
    void exec(machineId, windowsUploadCleanupCommand(target, remotePath), 15_000).catch(() => undefined);
    throw error;
  } finally {
    handle.close();
  }
}

export function forgetRemoteEnvironment(machineId: string): void {
  environments.delete(machineId);
  resolved.delete(machineId);
}

export function cachedRemoteEnvironment(machineId: string): RemoteEnvironment | undefined {
  return resolved.get(machineId);
}

/** Each connection pins its login environment, including the selected WSL distribution. */
export function remoteEnvironment(machineId: string): Promise<RemoteEnvironment> {
  const existing = environments.get(machineId);
  if (existing !== undefined) return existing;
  const request = probeEnvironment(machineId)
    .then((target) => {
      if (environments.get(machineId) === request) resolved.set(machineId, target);
      return target;
    })
    .catch((error: unknown) => {
      if (environments.get(machineId) === request) environments.delete(machineId);
      throw error;
    });
  environments.set(machineId, request);
  return request;
}

async function probeEnvironment(machineId: string): Promise<RemoteEnvironment> {
  // A direct SSH login inside WSL stays POSIX, even if Windows interop is available.
  const unix = await exec(machineId, "printf '__GHOSTEX_POSIX__'; uname -s", PROBE_TIMEOUT);
  if (unix.exitCode === 0 && /__GHOSTEX_POSIX__(Linux|Darwin)/u.test(unix.stdout)) return { kind: 'posix' };
  const windows = readableResult(await exec(machineId, powershellCommand(windowsEnvironmentProbe), PROBE_TIMEOUT));
  const line = windows.stdout.split(/\r?\n/u).find((value) => value.startsWith('__GHOSTEX_REMOTE_WINDOWS__'));
  if (windows.exitCode !== 0 || line === undefined) {
    throw new Error(windows.stderr.trim() || unix.stderr.trim() || 'Could not identify the remote SSH shell.');
  }
  const settings = JSON.parse(line.slice('__GHOSTEX_REMOTE_WINDOWS__'.length)) as {
    backend?: string;
    distribution?: string;
  };
  if (settings.backend !== 'wsl') return { kind: 'powershell' };
  const requested = settings.distribution?.trim();
  const argv = [
    ...(requested ? ['--distribution', requested] : []),
    '--exec',
    'sh',
    '-c',
    'printf "__GHOSTEX_WSL__%s\\n" "$WSL_DISTRO_NAME"',
  ];
  const wsl = readableResult(
    await exec(machineId, powershellCommand(powershellPrelude + windowsProcess("'wsl.exe'", argv)), PROBE_TIMEOUT),
  );
  const distribution = wsl.stdout
    .split(/\r?\n/u)
    .find((value) => value.startsWith('__GHOSTEX_WSL__'))
    ?.slice('__GHOSTEX_WSL__'.length)
    .trim();
  if (wsl.exitCode !== 0 || !distribution)
    throw new Error(wsl.stderr.trim() || 'Initialize the WSL distribution selected in Windows Ghostex settings.');
  return { kind: 'wsl', distribution };
}

function wslScript(target: Extract<RemoteEnvironment, { kind: 'wsl' }>, posix: string, interactive = false): string {
  return (
    powershellPrelude +
    windowsProcess(
      "'wsl.exe'",
      ['--distribution', target.distribution, '--exec', 'sh', '-c', loginShellCommand(posix)],
      interactive,
    )
  );
}

/** Windows exec scripts travel over stdin, avoiding OpenSSH's Windows command-line limit. */
async function execScript(machineId: string, script: string, timeoutMs: number): Promise<ExecResult> {
  // The script travels as base64 read through `$input`: a `[Console]::In` read hangs when it arrives late.
  const loader = powershellCommand(
    powershellPrelude + `& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString(${stdinBase64Bytes})))`,
  );
  return readableResult(await execWithInput(machineId, loader, stdinBase64(script), timeoutMs));
}

function readableResult(result: ExecResult): ExecResult {
  return { ...result, stderr: readablePowerShellError(result.stderr) };
}

export async function execRemoteCommand(machineId: string, command: string, timeoutMs: number): Promise<ExecResult> {
  if (isDemoMachineId(machineId)) return execDemoCommand(command);
  const target = await remoteEnvironment(machineId);
  if (target.kind === 'posix') return exec(machineId, loginShellCommand(command), timeoutMs);
  return execScript(
    machineId,
    target.kind === 'powershell' ? windowsCliScript(cliArguments(command)) : wslScript(target, command),
    timeoutMs,
  );
}

export async function execRemoteScript(
  machineId: string,
  script: RemoteScript,
  timeoutMs: number,
): Promise<ExecResult> {
  if (isDemoMachineId(machineId)) return execDemoCommand(script.posix);
  const target = await remoteEnvironment(machineId);
  if (target.kind === 'posix') return exec(machineId, loginShellCommand(script.posix), timeoutMs);
  return execScript(
    machineId,
    target.kind === 'powershell' ? powershellPrelude + script.powershell : wslScript(target, script.posix),
    timeoutMs,
  );
}

export function terminalCommandFor(target: RemoteEnvironment, command: string): string {
  if (target.kind === 'posix') return loginShellCommand(command);
  return powershellCommand(
    target.kind === 'powershell' ? windowsCliScript(cliArguments(command), true) : wslScript(target, command, true),
    true,
  );
}

export async function remoteTerminalCommand(machineId: string, command: string): Promise<string> {
  return terminalCommandFor(await remoteEnvironment(machineId), command);
}

export async function remoteShellCommand(machineId: string, cwd?: string): Promise<string | null> {
  const target = await remoteEnvironment(machineId);
  if (target.kind === 'powershell') {
    const location = cwd ? `Set-Location -LiteralPath ${powershellQuote(cwd)}; ` : '';
    return powershellCommand(
      powershellPrelude +
        "$gxShell=Join-Path $env:ProgramFiles 'PowerShell/7/pwsh.exe'; if (!(Test-Path -LiteralPath $gxShell)) { $gxShell='powershell.exe' }; " +
        location +
        windowsProcess('$gxShell', ['-NoLogo'], true),
      true,
    );
  }
  const script = `${cwd ? `cd ${shellQuote(cwd)} && ` : ''}exec "$SHELL" -l`;
  if (target.kind === 'posix') return cwd ? loginShellCommand(script) : null;
  return powershellCommand(wslScript(target, script, true), true);
}

/**
 * The path `uploadOverLink` is given for `path` on the computer. Uploads to a Windows computer go through PowerShell
 * (`uploadToWindows`), which takes a WSL distribution's own Linux path, so only PowerShell paths change (forward
 * slashes, as the phone hands them around).
 */
export async function remoteUploadPath(machineId: string, path: string): Promise<string> {
  const target = await remoteEnvironment(machineId);
  if (target.kind === 'powershell') return path.replace(/\\/gu, '/');
  return path;
}
