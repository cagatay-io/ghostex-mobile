export function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function powershellCommand(script: string, interactive = false): string {
  let bytes = '';
  for (let index = 0; index < script.length; index += 1) {
    const unit = script.charCodeAt(index);
    bytes += String.fromCharCode(unit & 255, unit >>> 8);
  }
  return `powershell.exe -NoLogo ${interactive ? '' : '-NoProfile -NonInteractive '}-EncodedCommand ${btoa(bytes)}`;
}

export const powershellPrelude =
  "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; ";

export const windowsStorage = `
$gxData = Join-Path $env:LOCALAPPDATA 'Ghostex/Data'
$gxConfig = Join-Path $env:APPDATA 'Ghostex'
if ($env:GHOSTEX_HOME -and [IO.Path]::IsPathRooted($env:GHOSTEX_HOME)) {
  $gxData=$env:GHOSTEX_HOME
  $gxConfig=$env:GHOSTEX_HOME
}
`;

export const windowsEnvironmentProbe = `${powershellPrelude}${windowsStorage}
$settingsPath=Join-Path $gxConfig 'native-sidebar-settings.json'
$settings=$null
if (Test-Path -LiteralPath $settingsPath) { $settings=Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json }
$backend='powershell'
if ($settings.windowsTerminalBackend -eq 'wsl') { $backend='wsl' }
Write-Output ('__GHOSTEX_REMOTE_WINDOWS__' + (@{backend=$backend; distribution=$settings.windowsWslDistribution} | ConvertTo-Json -Compress))
`;

/**
 * CDXC:RemoteMachines 2026-09-14 WHY:
 * PowerShell 5.1 drops literal quotes when it marshals native argv. Construct
 * the Windows command line explicitly so JSON, empty values and Unicode
 * prompts survive unchanged, including when SSH uses cmd as its default shell.
 * Keep simple arguments unquoted: wsl.exe treats a quoted option name as the Linux command to run.
 */
export function windowsProcess(programExpression: string, argv: string[], interactive = false): string {
  return String.raw`
$gxArgs=@(${argv.map(powershellQuote).join(',')})
$gxQuoted=@($gxArgs | ForEach-Object {
  if ($_ -match '^[A-Za-z0-9_./:=+-]+$') { return $_ }
  $value=[regex]::Replace($_, '(\\*)"', '$1$1\"')
  $value=[regex]::Replace($value, '(\\+)$', '$1$1')
  '"'+$value+'"'
})
$gxStart=[Diagnostics.ProcessStartInfo]::new()
$gxStart.FileName=${programExpression}
$gxStart.Arguments=$gxQuoted -join ' '
$gxStart.UseShellExecute=$false
$gxStart.CreateNoWindow=$${interactive ? 'false' : 'true'}
${
  interactive
    ? ''
    : String.raw`$gxStart.RedirectStandardOutput=$true
$gxStart.RedirectStandardError=$true
$gxStart.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$gxStart.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)`
}
$gxProcess=[Diagnostics.Process]::Start($gxStart)
${interactive ? '' : '$gxStdout=$gxProcess.StandardOutput.ReadToEndAsync(); $gxStderr=$gxProcess.StandardError.ReadToEndAsync()'}
$gxProcess.WaitForExit()
${interactive ? '' : '[Console]::Out.Write($gxStdout.Result); [Console]::Error.Write($gxStderr.Result)'}
exit $gxProcess.ExitCode
`;
}

/**
 * CDXC:RemoteMachines 2026-10-14 WHY:
 * An SSH login does not see the app's PATH, so the per-user install's CLI (`%LOCALAPPDATA%\Ghostex\current\resources\native`) was invisible and Easy Connect failed with "Ghostex CLI not found". Read the app folder the desktop records on every gxserver start first (its CLI matches the running gxserver), then the managed package, then the per-user and machine-wide install folders, then PATH. The CLI install only writes `ghostex.cmd` shims to `~\.local\bin`, never an exe. The failure goes to stderr as plain text because a `throw` reaches the phone as CLIXML.
 * SEE-ALSO: apps/desktop/src/app/helpers/remote/windows.rs (`gpui_remote_windows_cli_setup`), packages/paths `windows_app_dir_file`.
 */
export function windowsCliScript(argv: string[], interactive = false): string {
  return `${powershellPrelude}${windowsStorage}
$gxCandidates=@()
$gxAppDirFile=Join-Path $gxData 'gxserver/windows-app-dir'
if (Test-Path -LiteralPath $gxAppDirFile -PathType Leaf) {
  $gxAppDir=[IO.File]::ReadAllText($gxAppDirFile).Trim()
  if ($gxAppDir) { $gxCandidates+=Join-Path $gxAppDir 'resources/native/ghostex.exe' }
}
$gxCandidates+=Join-Path $gxData 'gxserver/package/bin/ghostex.exe'
if ($env:LOCALAPPDATA) { $gxCandidates+=Join-Path $env:LOCALAPPDATA 'Ghostex/current/resources/native/ghostex.exe' }
foreach ($gxRoot in @($env:ProgramW6432, $env:ProgramFiles)) { if ($gxRoot) { $gxCandidates+=Join-Path $gxRoot 'Ghostex/resources/native/ghostex.exe' } }
$gxCommand=Get-Command ghostex.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gxCommand) { $gxCandidates+= $gxCommand.Source }
$gxExe=$gxCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$gxExe) { [Console]::Error.WriteLine('Ghostex CLI not found. Install Ghostex on this Windows machine.'); exit 127 }
${windowsProcess('$gxExe', argv, interactive)}`;
}

/**
 * CDXC:RemoteMachines 2026-10-14 WHY:
 * Windows PowerShell 5.1 writes its error stream as CLIXML whenever stdin and stderr are redirected, which is every Easy Connect or SSH exec (`-OutputFormat Text` does not change it). Decode the `<S S="Error">` text and its `_xHHHH_` escapes, and drop the position and `+ CategoryInfo` lines, so the phone shows the message itself.
 */
export function readablePowerShellError(stderr: string): string {
  if (!stderr.includes('#< CLIXML')) return stderr;
  return stderr
    .replace(/#< CLIXML\s*(<Objs[\s\S]*?(?:<\/Objs>|$))?/gu, (_, objects: string | undefined) => {
      let text = '';
      for (const match of (objects ?? '').matchAll(/<S S="Error">([\s\S]*?)<\/S>/gu)) text += match[1] ?? '';
      const lines = text
        .replace(/&lt;/gu, '<')
        .replace(/&gt;/gu, '>')
        .replace(/&quot;/gu, '"')
        .replace(/&apos;/gu, "'")
        .replace(/&amp;/gu, '&')
        .replace(/_x([0-9A-Fa-f]{4})_/gu, (__, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .split(/\r?\n/u);
      // The line before the first `+ ` source excerpt is the localized "At line:… char:…".
      const excerpt = lines.findIndex((line) => line.startsWith('+ '));
      return `\n${(excerpt > 0 ? lines.slice(0, excerpt - 1) : lines).join('\n').trim()}\n`;
    })
    .trim();
}

/** Decode only the literal argv grammar emitted by the existing CLI builders. */
export function cliArguments(command: string): string[] {
  const words: string[] = [];
  let word = '';
  let started = false;
  let quote: "'" | '"' | null = null;
  for (const character of command) {
    if (quote !== null) {
      if (character === quote) quote = null;
      else {
        if (quote === '"' && /[$`\\]/u.test(character)) throw new Error('Expected literal CLI arguments.');
        word += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/u.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      if (/[;&|<>$`\\()]/u.test(character)) throw new Error('Expected literal CLI arguments.');
      word += character;
      started = true;
    }
  }
  if (quote !== null) throw new Error('Unterminated CLI argument.');
  if (started) words.push(word);
  if (words.shift() !== 'ghostex') throw new Error('Expected a Ghostex CLI command.');
  return words;
}
