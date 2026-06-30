param(
  [string]$PythonVersion = "3.12.8",
  [switch]$Force
)

# Vendors Windows-only runtime files used by the local release build.
# Generated binaries stay gitignored; rerun before `tauri:build:win`.
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$resourceRoot = Join-Path $repo "apps\desktop\src-tauri\resources"

function Copy-CodexRuntime {
  $targetDir = Join-Path $resourceRoot "codex\windows-x64"
  $target = Join-Path $targetDir "codex.exe"
  if ((Test-Path $target) -and -not $Force) {
    Write-Host "✓ codex.exe already vendored: $target"
    return
  }

  $candidates = @()
  if ($env:BLACKRAIN_CODEX_EXE) {
    $candidates += $env:BLACKRAIN_CODEX_EXE
  }
  $candidates += Join-Path $repo "codex-upstream\codex-rs\target\release\codex.exe"
  $candidates += Join-Path $repo "codex-upstream\codex-rs\target\debug\codex.exe"

  $source = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $source) {
    throw "找不到 codex.exe。先编译：cd codex-upstream\codex-rs; cargo build -p codex-cli --bin codex"
  }

  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "✓ vendored codex.exe: $target"
}

function Install-PythonRuntime {
  $targetDir = Join-Path $resourceRoot "python\windows-x64"
  $target = Join-Path $targetDir "python.exe"
  if ((Test-Path $target) -and -not $Force) {
    Write-Host "✓ Python runtime already vendored: $target"
    return
  }

  $url = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
  $workDir = Join-Path $env:TEMP "blackrain-python-$PythonVersion"
  $zip = Join-Path $workDir "python-embed.zip"
  $extractDir = Join-Path $workDir "extract"
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $workDir
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

  Write-Host "Downloading Python $PythonVersion embeddable runtime..."
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $extractDir -Force

  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $resolvedResourceRoot = (Resolve-Path $resourceRoot).Path
  $resolvedTargetDir = (Resolve-Path $targetDir).Path
  if (-not $resolvedTargetDir.StartsWith($resolvedResourceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean unexpected runtime directory: $resolvedTargetDir"
  }
  Get-ChildItem -LiteralPath $targetDir -Force |
    Where-Object { $_.Name -ne ".gitkeep" } |
    Remove-Item -Recurse -Force
  Copy-Item -Recurse -Force -Path (Join-Path $extractDir "*") -Destination $targetDir

  $vendor = @{
    name = "Python embeddable runtime"
    version = $PythonVersion
    url = $url
    sha256 = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
  } | ConvertTo-Json -Depth 3
  Set-Content -Path (Join-Path $targetDir "VENDOR.json") -Value $vendor -Encoding UTF8

  if (-not (Test-Path $target)) {
    throw "Python runtime download did not produce $target"
  }
  Write-Host "✓ vendored Python runtime: $target"
}

Copy-CodexRuntime
Install-PythonRuntime
