/**
 * Uploads to a Windows computer: the file's bytes go as base64 on the stdin of a PowerShell command, a piece at a
 * time, over the same exec-with-input route every Windows script takes (`execScript` in commands.ts).
 *
 * CDXC:RemoteMachines 2026-11-17 WHY:
 * The native upload never worked on a Windows computer (issue #647, a Windows user's pictures never sent from the
 * iPhone chat). libssh2 starts SCP as `scp -t '<path>'`, quoted for a POSIX shell; Windows OpenSSH runs it through
 * cmd.exe, which keeps the single quotes, so scp refuses the path. The iPhone then falls back to `cat > '<path>' &&
 * chmod 600 '<path>'`, which no Windows shell runs: a file under 2 MB failed, a bigger one waited forever once the
 * SSH window was used up (measured against Windows 11 OpenSSH, 2026-11-17). This route needs only `execWithInput`,
 * which every phone build that reaches Windows has, so it ships over the air; the piece is read with `$input`
 * (`stdinBase64Bytes`: the `[Console]::In` read hangs when the bytes come late); each piece is bounded by that
 * command's own deadline and checked against the length the computer reports. Android uses it too, so both phones
 * send the same way to Windows.
 * SEE-ALSO: modules/ghostex-native/ios/SSH/SSHUpload.swift (the native upload macOS and Linux keep).
 */

import { powershellCommand, powershellPrelude, powershellQuote, stdinBase64Bytes, windowsProcess } from './powershell';

/** A Windows computer's side: PowerShell writes the file, or the selected WSL distribution does. */
export type WindowsUploadTarget = { kind: 'powershell' } | { kind: 'wsl'; distribution: string };

/** Raw bytes per PowerShell call: 4 MiB, about 5.6 MB of base64 on its stdin. */
export const WINDOWS_UPLOAD_PIECE_BYTES = 4 * 1024 * 1024;

const UPLOADED_MARKER = '__GHOSTEX_UPLOADED__';

/** A Windows path PowerShell and .NET take as is: the phone hands paths around with forward slashes. */
export function windowsPath(path: string): string {
  return path.replace(/\//gu, '\\');
}

/**
 * The command that writes one piece read as base64 from its stdin: the first piece creates (or empties) the file,
 * the others append. It prints the file's length afterwards, which the phone checks.
 * - PowerShell: `path` is a Windows path, written by .NET.
 * - WSL: `path` is the Linux path. The `\\wsl.localhost` share is not there in an SSH logon session ("The network
 *   name cannot be found"), so the piece goes to a file in the Windows temp folder, which a shell in the
 *   distribution appends to `path` and removes; `WSLENV`'s `/p` hands it that file's Linux path.
 */
export function windowsUploadPieceCommand(target: WindowsUploadTarget, path: string, first: boolean): string {
  if (target.kind === 'powershell') {
    return powershellCommand(
      powershellPrelude +
        `$path=${powershellQuote(windowsPath(path))}; ` +
        `$bytes=${stdinBase64Bytes}; ` +
        `$stream=[IO.File]::Open($path,[IO.FileMode]::${first ? 'Create' : 'Append'},[IO.FileAccess]::Write); ` +
        'try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }; ' +
        `Write-Output ('${UPLOADED_MARKER}' + [IO.FileInfo]::new($path).Length)`,
    );
  }
  const append = [
    'part="$GX_UPLOAD_PART"',
    `if [ "$2" = first ]; then cat "$part" > "$1" && chmod 600 "$1"; else cat "$part" >> "$1"; fi`,
    'status=$?',
    'rm -f "$part"',
    '[ "$status" = 0 ] || exit "$status"',
    `printf '${UPLOADED_MARKER}%s\\n' "$(wc -c < "$1" | tr -d ' ')"`,
  ].join('\n');
  return powershellCommand(
    powershellPrelude +
      "$part=Join-Path $env:TEMP ('ghostex-upload-' + [guid]::NewGuid().ToString('N') + '.part'); " +
      `[IO.File]::WriteAllBytes($part, ${stdinBase64Bytes}); ` +
      '$env:GX_UPLOAD_PART=$part; ' +
      "$env:WSLENV=if ($env:WSLENV) { $env:WSLENV + ':GX_UPLOAD_PART/p' } else { 'GX_UPLOAD_PART/p' }; " +
      windowsProcess("'wsl.exe'", [
        '--distribution',
        target.distribution,
        '--exec',
        'sh',
        '-c',
        append,
        'sh',
        path,
        first ? 'first' : 'more',
      ]),
  );
}

/** Removes what a failed upload left behind; errors are ignored. */
export function windowsUploadCleanupCommand(target: WindowsUploadTarget, path: string): string {
  if (target.kind === 'powershell') {
    return powershellCommand(
      `Remove-Item -LiteralPath ${powershellQuote(windowsPath(path))} -Force -ErrorAction SilentlyContinue`,
    );
  }
  return powershellCommand(
    windowsProcess("'wsl.exe'", ['--distribution', target.distribution, '--exec', 'rm', '-f', '--', path]),
  );
}

/** The file length a piece's command reported, or null when its output has none. */
export function uploadedLength(stdout: string): number | null {
  const line = stdout.split(/\r?\n/u).find((value) => value.startsWith(UPLOADED_MARKER));
  if (line === undefined) return null;
  const length = Number(line.slice(UPLOADED_MARKER.length).trim());
  return Number.isSafeInteger(length) ? length : null;
}

/** `bytes` as base64, in slices so no call gets millions of arguments. */
export function base64Bytes(bytes: Uint8Array): string {
  let binary = '';
  const slice = 0x8000;
  for (let index = 0; index < bytes.length; index += slice) {
    binary += String.fromCharCode(...bytes.subarray(index, index + slice));
  }
  return btoa(binary);
}

/** How long one piece may take: a minute, plus its base64 at 32 KB/s. */
export function windowsPieceTimeoutMs(pieceBytes: number): number {
  return 60_000 + Math.ceil((pieceBytes * 4) / 3 / 32);
}
