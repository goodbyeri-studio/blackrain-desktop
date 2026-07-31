param(
  [string]$ArchivePath,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ResourceRoot = Join-Path $RepoRoot "apps\desktop\resources\node-runtime"
$RuntimeRoot = Join-Path $ResourceRoot "windows-x64"
$LockPath = Join-Path $ResourceRoot "runtime-lock.json"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-Sha256([string]$Path, [string]$Expected, [string]$Label) {
  $actual = Get-Sha256 $Path
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "$Label SHA-256 不匹配：期望 $Expected，实际 $actual"
  }
}

function Assert-ChildPath([string]$Parent, [string]$Candidate, [string]$Label) {
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  $candidatePath = [IO.Path]::GetFullPath($Candidate)
  if (-not $candidatePath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label 越出允许目录：$candidatePath"
  }
  return $candidatePath
}

$lock = Get-Content -Raw -LiteralPath $LockPath | ConvertFrom-Json
if ($lock.schemaVersion -ne 1 -or $lock.upstream.license -ne "MIT") {
  throw "Node runtime lock 非法"
}
$version = [string]$lock.upstream.version
$platform = $lock.platforms.'windows-x64'
if (-not $platform) { throw "Node runtime lock 缺少 windows-x64" }

if ($ArchivePath) {
  $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
} else {
  $cacheRoot = Join-Path $RepoRoot ".scratch\node-runtime-cache"
  New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
  $archive = Assert-ChildPath $cacheRoot (Join-Path $cacheRoot $platform.archive.fileName) "Node archive"
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    Invoke-WebRequest -Uri $platform.archive.url -OutFile $archive -UseBasicParsing
  }
}
Assert-Sha256 $archive $platform.archive.sha256 "Node archive"

$extractParent = Join-Path $RepoRoot ".scratch\node-runtime-extract"
$extractRoot = Assert-ChildPath $extractParent (Join-Path $extractParent ([Guid]::NewGuid().ToString('N'))) "Node extract"
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

try {
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot
  $packageRoot = Join-Path $extractRoot "node-v$version-win-x64"
  $nodePath = Assert-ChildPath $packageRoot (Join-Path $packageRoot "node.exe") "Node executable"
  $licensePath = Assert-ChildPath $packageRoot (Join-Path $packageRoot "LICENSE") "Node license"
  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $licensePath -PathType Leaf)) {
    throw "Node archive 缺少 node.exe 或 LICENSE"
  }
  foreach ($required in $platform.requiredFiles) {
    $source = Assert-ChildPath $packageRoot (Join-Path $packageRoot $required.path) "Node required file"
    Assert-Sha256 $source $required.sha256 $required.path
  }
  $reportedVersion = (& $nodePath --version).Trim()
  if ($reportedVersion -ne "v$version") {
    throw "Node executable 版本不匹配：$reportedVersion"
  }

  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $existing = @(Get-ChildItem -LiteralPath $RuntimeRoot -Force | Where-Object { $_.Name -ne ".gitkeep" })
  if ($existing.Count -gt 0 -and -not $Force) {
    throw "Electron Node runtime 已存在；确认替换时使用 -Force"
  }
  foreach ($item in $existing) {
    Remove-Item -LiteralPath $item.FullName -Recurse -Force
  }
  Copy-Item -LiteralPath $nodePath -Destination (Join-Path $RuntimeRoot "node.exe")
  Copy-Item -LiteralPath $licensePath -Destination (Join-Path $RuntimeRoot "LICENSE")

  $manifest = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTimeOffset]::UtcNow.ToString("O")
    version = $version
    license = "MIT"
    archiveSha256 = [string]$platform.archive.sha256
    files = @($platform.requiredFiles | ForEach-Object {
      [ordered]@{ path = [string]$_.path; sha256 = [string]$_.sha256 }
    })
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $RuntimeRoot "runtime-manifest.json") -Encoding UTF8
  Write-Host "Node runtime 已锁定：v$version"
  Write-Host "Runtime 目录：$RuntimeRoot"
} finally {
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
}
