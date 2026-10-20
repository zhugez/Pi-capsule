# Snapshot ~\.pi\agent config into .\agent (Windows). Secrets are never copied.
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\export.ps1
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot
$Src     = if ($env:PI_CODING_AGENT_DIR) { $env:PI_CODING_AGENT_DIR }
           elseif ($env:PI_AGENT_DIR)    { $env:PI_AGENT_DIR }
           else { Join-Path $HOME '.pi\agent' }
$Dst     = Join-Path $Root 'agent'
$HomeDst = Join-Path $Root 'home'
$Utf8    = New-Object Text.UTF8Encoding $false   # no BOM, same bytes as the bash export

function Write-Json($obj, $path) {
  [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 100) + "`n", $Utf8)
}

# Recursive copy that follows symlinks/junctions (cp -rL equivalent).
function Copy-Deref($from, $to) {
  robocopy $from $to /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $from" }
  $global:LASTEXITCODE = 0
}

if (Test-Path $Dst) { Remove-Item $Dst -Recurse -Force }
New-Item -ItemType Directory -Path $Dst | Out-Null

foreach ($f in 'settings.json','pi-fff.json','subscription-usage-prefs.json','mcp.json','AGENTS.md','SYSTEM.md','keybindings.json') {
  $p = Join-Path $Src $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $Dst $f) }
}

# Local package paths only exist on this machine: rewrite to git:<origin> when possible.
$settingsPath = Join-Path $Dst 'settings.json'
if (Test-Path $settingsPath) {
  $settings = Get-Content -Raw $settingsPath | ConvertFrom-Json
  $changed  = $false
  function Resolve-Pkg($src) {
    if ($src -notmatch '^([A-Za-z]:[\\/]|[\\/]|~|\.)') { return $src }   # npm:/git:/https: stay
    $dir = $src -replace '^~', $HOME
    $url = git -C $dir remote get-url origin 2>$null
    if (-not $url) { Write-Warning "local package $src has no git origin, left as-is"; return $src }
    $url = $url -replace '^https://', '' -replace '^git@', '' -replace '^([^/:]+):', '$1/' -replace '\.git$', ''
    $script:changed = $true
    return "git:$url"
  }
  if ($settings.packages) {
    $settings.packages = @($settings.packages | ForEach-Object {
      if ($_ -is [string]) { Resolve-Pkg $_ }
      else { if ($_.source) { $_.source = Resolve-Pkg $_.source }; $_ }
    })
  }
  if ($changed) { Write-Json $settings $settingsPath }
}

# models.json: replace literal apiKeys with an env var reference ($<PROVIDER>_API_KEY).
# Keys already written as "$ENV_VAR" or "!command" are kept.
$modelsPath = Join-Path $Src 'models.json'
if (Test-Path $modelsPath) {
  $models = Get-Content -Raw $modelsPath | ConvertFrom-Json
  if ($models.providers) {
    foreach ($p in $models.providers.PSObject.Properties) {
      $k = $p.Value.apiKey
      if ($k -is [string] -and $k -notmatch '^(\$.*|!.*)?$') {
        $p.Value.apiKey = '$' + ($p.Name.ToUpper() -replace '[^A-Z0-9]', '_') + '_API_KEY'
      }
    }
  }
  Write-Json $models (Join-Path $Dst 'models.json')
}

# Skills, prompts, and loose extensions: dereference links so the repo is self-contained.
foreach ($d in 'skills','prompts','extensions') {
  $p = Join-Path $Src $d
  if (Test-Path $p) { Copy-Deref $p (Join-Path $Dst $d) }
}

# Companion tool configs, mirrored under .\home. State/caches stay local.
$DotFiles = '.no-mistakes/config.yaml','.config/rtk/config.toml','.config/rtk/filters.toml',
            '.config/treehouse/config.toml','.gemini/GEMINI.md','.config/git/hooks/pre-commit',
            '.agent-browser/config.json'
$DotDirs  = '.gemini/references','.gemini/domains','.gemini/scripts'
if (Test-Path $HomeDst) { Remove-Item $HomeDst -Recurse -Force }
foreach ($rel in $DotFiles) {
  $from = Join-Path $HOME $rel
  if (Test-Path $from) {
    $to = Join-Path $HomeDst $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    Copy-Item $from $to
  }
}
foreach ($rel in $DotDirs) {
  $from = Join-Path $HOME $rel
  if (Test-Path $from) { Copy-Deref $from (Join-Path $HomeDst $rel) }
}

Write-Host "exported to $Dst"
