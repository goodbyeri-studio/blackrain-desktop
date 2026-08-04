param(
  [string]$EnvFile = ".env.production.local",
  [switch]$SkipChecks,
  [switch]$SkipVendor,
  [switch]$Unsigned
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ne 7) {
  throw "BlackRain Electron 发布入口必须使用 PowerShell 7。"
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$desktop = Join-Path $repo "apps\desktop"
$pwsh = "C:\Program Files\PowerShell\7\pwsh.exe"

function Invoke-Checked([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败，exit code=$LASTEXITCODE。"
  }
}

function Import-EnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "缺少发布环境文件：$Path"
  }
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^\s*([^=#\s]+)\s*=\s*(.*)$') {
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($Matches[1], $value, "Process")
    }
  }
}

Import-EnvFile (Join-Path $repo $EnvFile)
foreach ($name in @("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY")) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")?.Trim()) {
    throw "$EnvFile 缺少 $name。"
  }
}

if (-not $SkipVendor) {
  Invoke-Checked {
    & $pwsh -NoLogo -NoProfile -File (Join-Path $repo "scripts\vendor-electron-codex-runtime.ps1") -Force
  }
  Invoke-Checked {
    & $pwsh -NoLogo -NoProfile -File (Join-Path $repo "scripts\vendor-electron-node-runtime.ps1") -Force
  }
}

Push-Location $desktop
try {
  if (-not $SkipChecks) {
    Invoke-Checked { & npm.cmd run typecheck }
    Invoke-Checked { & npm.cmd run test }
    Invoke-Checked { & npm.cmd run lint }
    Invoke-Checked { & npm.cmd run check:host-boundary }
    Invoke-Checked { & npm.cmd run electron:app-server:probe }
    Invoke-Checked { & npm.cmd run electron:smoke }
    Invoke-Checked { & npm.cmd run electron:e2e }
  }

  if ($Unsigned) {
    Invoke-Checked { & npm.cmd run electron:make }
  } else {
    Invoke-Checked { & npm.cmd run electron:make:release }
  }
} finally {
  Pop-Location
}
