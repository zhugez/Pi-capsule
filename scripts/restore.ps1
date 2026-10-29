# Setup a fresh machine: sync config, install companion CLIs and home dotfiles (Windows).
# Existing files are backed up to <file>.bak first.
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\restore.ps1
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$Src  = Join-Path $Root 'agent'
$Dst  = if ($env:PI_CODING_AGENT_DIR) { $env:PI_CODING_AGENT_DIR }
        elseif ($env:PI_AGENT_DIR)    { $env:PI_AGENT_DIR }
        else { Join-Path $HOME '.pi\agent' }
$Bin  = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force -Path $Dst, $Bin | Out-Null

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Backup($path) {
  if (Test-Path -LiteralPath $path) {
    $bak = "$path.bak"
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Recurse -Force }
    Move-Item -LiteralPath $path -Destination $bak
  }
}

# --- agent config & package setup -------------------------------------------
$syncScript = Join-Path $Root 'scripts\sync-config.mjs'
if (Has 'node') {
  & node $syncScript --models
  if (Has 'pi') {
    try { & pi update --extensions } catch { Write-Warning "pi update: $_" }
  }
} else {
  Write-Warning 'node: Node.js not found. Install Node.js LTS (winget install OpenJS.NodeJS.LTS), then rerun.'
}

# --- companion dotfiles (mirrored from ~, see DOTFILES/DOTDIRS in export) ----
$HomeSrc = Join-Path $Root 'home'
if (Test-Path $HomeSrc) {
  Get-ChildItem -LiteralPath $HomeSrc -Recurse -File -Force | ForEach-Object {
    $rel    = $_.FullName.Substring($HomeSrc.Length + 1)
    $target = Join-Path $HOME $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target "$target.bak" -Force }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
}

# --- PATH: ~\.local\bin for the user, persistently ----------------------------
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $Bin)) {
  $newPath = if ($userPath) { "$Bin;$userPath" } else { $Bin }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
if (-not (($env:Path -split ';') -contains $Bin)) { $env:Path = "$Bin;$env:Path" }

# --- companion CLIs: GitHub release zip -> ~\.local\bin. Skipped when on PATH --
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
function Install-Release($cmd, $repo, $assetPattern) {
  if (Has $cmd) { return }
  try {
    $rel   = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'pi-capsule' }
    $asset = $rel.assets | Where-Object { $_.name -match $assetPattern } | Select-Object -First 1
    if (-not $asset) { Write-Warning "${cmd}: no Windows asset matching '$assetPattern' in $repo"; return }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $file = Join-Path $tmp $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $file -UseBasicParsing
    if ($file -like '*.zip') {
      Expand-Archive -LiteralPath $file -DestinationPath $tmp -Force
      $exe = Get-ChildItem $tmp -Recurse -Filter "$cmd.exe" | Select-Object -First 1
    } else { $exe = Get-Item $file }
    if (-not $exe) { Write-Warning "${cmd}: $cmd.exe not found in $($asset.name)"; return }
    Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $Bin "$cmd.exe") -Force
    Remove-Item $tmp -Recurse -Force
    Write-Host "installed $cmd ($($rel.tag_name))"
  } catch { Write-Warning "${cmd}: install failed: $_" }
}

$gitleaksArch = if ($arch -eq 'arm64') { 'arm64' } else { 'x64' }
Install-Release 'no-mistakes' 'kunchenguid/no-mistakes' "windows-$arch\.zip$"
Install-Release 'rtk'         'rtk-ai/rtk'              '^rtk-x86_64-pc-windows-msvc\.zip$'
Install-Release 'treehouse'   'kunchenguid/treehouse'   "windows-$arch\.zip$"
Install-Release 'gitleaks'    'gitleaks/gitleaks'       "windows_$gitleaksArch\.zip$"

# Pi itself (needs Node.js >= 20).
if (-not (Has 'pi')) {
  if (Has 'npm') { npm install -g @earendil-works/pi-coding-agent }
  else { Write-Warning 'pi: Node.js/npm not found. Install Node.js LTS (winget install OpenJS.NodeJS.LTS), then rerun.' }
}

# agent-browser: browser automation CLI for AI agents.
if (-not (Has 'agent-browser') -and (Has 'npm')) {
  try { npm install -g agent-browser; agent-browser install } catch { Write-Warning "agent-browser: $_" }
}

# exom: ExoMind knowledge & memory runtime.
if (-not (Has 'exom') -and (Has 'cargo')) {
  try { cargo install --git https://github.com/zhugez/ExoMind } catch { Write-Warning "exom: $_" }
}

# --- git ------------------------------------------------------------------------
if (Has 'git') {
  # Global pre-commit hook (gitleaks). Git for Windows runs hooks through its bundled sh.
  $hooks = Join-Path $HOME '.config\git\hooks'
  if (Test-Path (Join-Path $hooks 'pre-commit')) {
    git config --global core.hooksPath ($hooks -replace '\\', '/')
  }
  # crapper + mutator (ub-mode's CRAP and mutation gates, behind pi-pulse's /crap and
# /mutator): POSIX sh launchers, so they are not installed here. Run restore.sh under
# WSL or Git Bash; both read ~/.local/share/ub-tools, which WSL and Windows share.
# `git gate`: enable the no-mistakes gate in a repo and route plain `git push` through it.
  git config --global alias.gate '!no-mistakes init && git config remote.pushDefault no-mistakes'
} else {
  Write-Warning 'git not found: install Git for Windows (winget install Git.Git), then rerun.'
}

# --- summary --------------------------------------------------------------------
Write-Host "restored to $Dst"
$modelsSrc = Join-Path $Src 'models.json'
if (Test-Path $modelsSrc) {
  $json = Get-Content -Raw $modelsSrc | ConvertFrom-Json
  foreach ($p in $json.providers.PSObject.Properties) {
    $k = $p.Value.apiKey
    if ($k -is [string] -and $k.StartsWith('$')) {
      $name = $k -replace '[${}]', ''
      Write-Host "set env var: $name   ->  [Environment]::SetEnvironmentVariable('$name', '...', 'User')"
    }
  }
}
Write-Host 'then open a NEW terminal and run: pi   (missing npm:/git: packages install on first startup), then /login for OAuth providers'
Write-Host 'per repo: git gate   (no-mistakes init + plain git push goes through the gate)'
