# 本机 Windows 发布构建。GitHub Actions 只做检查，不打安装包。
#
# 用法：
#   Copy-Item .env.production.example .env.production.local
#   # 填 VITE_SUPABASE_ANON_KEY
#   pwsh scripts/release-client-win.ps1
param(
  [string]$EnvFile = ".env.production.local",
  [switch]$SkipChecks,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo

function Import-EnvFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "缺少 $Path。先复制：Copy-Item .env.production.example $Path，然后填 VITE_SUPABASE_ANON_KEY。"
  }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*([^=#\s]+)\s*=\s*(.*)$') {
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($Matches[1], $value, "Process")
    }
  }
}

function Invoke-Checked([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE."
  }
}

Import-EnvFile $EnvFile

$required = @("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY")
foreach ($name in $required) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if (-not $value -or -not $value.Trim()) {
    throw "$EnvFile 缺少 $name。"
  }
}

$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $python) {
  throw "找不到 Python；Hermes contract 与 Windows runtime vendor 需要 Python 3.11+。"
}

Invoke-Checked {
  & $python.Source (Join-Path $repo "scripts\check-hermes-contract.py") --static-only
}

& pwsh -NoProfile -File (Join-Path $repo "scripts\vendor-windows-runtime.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Vendor Windows runtime failed with exit code $LASTEXITCODE."
}
& pwsh -NoProfile -File (Join-Path $repo "scripts\vendor-hermes-runtime.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Vendor Hermes runtime failed with exit code $LASTEXITCODE."
}

Push-Location (Join-Path $repo "apps\desktop")
try {
  if (-not $SkipChecks) {
    Invoke-Checked { & npm.cmd run typecheck }
    Invoke-Checked { & npm.cmd run test }
    Invoke-Checked { & npm.cmd run lint }
    Invoke-Checked { & npm.cmd run lint:ds }
    Invoke-Checked { & npm.cmd run codemod:ds:dry }
    Invoke-Checked { & npm.cmd run doctor:win }
    Invoke-Checked {
      & pwsh -NoProfile -File (Join-Path $repo "scripts\check-windows-rust.ps1")
    }
  }

  if (-not $SkipBuild) {
    Invoke-Checked { & npm.cmd run tauri:build:win }
  }
} finally {
  Pop-Location
}
