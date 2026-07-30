param(
  [string]$LockPath,
  [string]$ArchivePath,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CodexResourceRoot = Join-Path $RepoRoot "apps\desktop\resources\codex"
$RuntimeRoot = Join-Path $CodexResourceRoot "windows-x64"
if (-not $LockPath) {
  $LockPath = Join-Path $CodexResourceRoot "runtime-lock.json"
}
$LockPath = (Resolve-Path -LiteralPath $LockPath).Path

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

function Save-PinnedFile([string]$Url, [string]$Destination, [string]$Sha256) {
  if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and
      (Get-Sha256 $Destination) -eq $Sha256.ToLowerInvariant()) {
    return
  }

  $partial = "$Destination.partial-$PID"
  try {
    Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
    Assert-Sha256 $partial $Sha256 $Url
    Move-Item -LiteralPath $partial -Destination $Destination -Force
  } finally {
    if (Test-Path -LiteralPath $partial) {
      Remove-Item -LiteralPath $partial -Force
    }
  }
}

$lock = Get-Content -Raw -LiteralPath $LockPath | ConvertFrom-Json
if ($lock.schemaVersion -ne 1) {
  throw "不支持的 Codex runtime lock schemaVersion：$($lock.schemaVersion)"
}
$platform = $lock.platforms.'windows-x64'
if (-not $platform -or $platform.target -ne "x86_64-pc-windows-msvc") {
  throw "runtime-lock.json 缺少 Windows x64 平台锁"
}

$archive = $null
if ($ArchivePath) {
  $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
} else {
  $cacheRoot = Join-Path $RepoRoot ".scratch\runtime-cache"
  New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
  $archive = Assert-ChildPath $cacheRoot (Join-Path $cacheRoot $platform.archive.fileName) "runtime archive"
  Save-PinnedFile $platform.archive.url $archive $platform.archive.sha256
}
Assert-Sha256 $archive $platform.archive.sha256 "Codex release archive"

$extractRoot = Join-Path $RepoRoot ".scratch\runtime-extract\$([Guid]::NewGuid().ToString('N'))"
$extractRoot = Assert-ChildPath (Join-Path $RepoRoot ".scratch\runtime-extract") $extractRoot "runtime extract"
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

try {
  & tar.exe -xzf $archive -C $extractRoot
  if ($LASTEXITCODE -ne 0) {
    throw "解压 Codex runtime archive 失败，exit code $LASTEXITCODE"
  }

  $packageManifests = @(Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter "codex-package.json")
  if ($packageManifests.Count -ne 1) {
    throw "Codex runtime archive 必须且只能包含一个 codex-package.json"
  }
  $packageRoot = $packageManifests[0].Directory.FullName
  $packageMetadata = Get-Content -Raw -LiteralPath $packageManifests[0].FullName | ConvertFrom-Json
  $expectedVersion = $lock.upstream.tag -replace '^rust-v', ''
  if ($packageMetadata.version -ne $expectedVersion -or
      $packageMetadata.target -ne $platform.target -or
      $packageMetadata.variant -ne "codex" -or
      $packageMetadata.entrypoint -ne "bin/codex.exe") {
    throw "codex-package.json 与锁定版本、target 或入口不一致"
  }

  foreach ($requiredFile in $platform.requiredFiles) {
    $relativePath = [string]$requiredFile.path
    $candidate = Assert-ChildPath $packageRoot (Join-Path $packageRoot $relativePath) "required runtime file"
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      throw "Codex runtime 缺少文件：$relativePath"
    }
    Assert-Sha256 $candidate $requiredFile.sha256 "required runtime file $relativePath"
  }

  $RuntimeRoot = Assert-ChildPath $CodexResourceRoot $RuntimeRoot "Electron Codex runtime root"
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $existingRuntimeFiles = @(Get-ChildItem -LiteralPath $RuntimeRoot -Force |
    Where-Object { $_.Name -ne ".gitkeep" })
  if ($existingRuntimeFiles.Count -gt 0 -and -not $Force) {
    throw "Electron Codex runtime 已存在；确认替换时使用 -Force"
  }
  foreach ($item in $existingRuntimeFiles) {
    Remove-Item -LiteralPath $item.FullName -Recurse -Force
  }
  Get-ChildItem -LiteralPath $packageRoot -Force |
    Copy-Item -Destination $RuntimeRoot -Recurse -Force

  foreach ($license in $lock.licenses) {
    $destination = Assert-ChildPath $RuntimeRoot (Join-Path $RuntimeRoot $license.path) "runtime license"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Save-PinnedFile $license.url $destination $license.sha256
  }

  $files = @()
  $manifestEntries = @($platform.requiredFiles) + @($lock.licenses)
  foreach ($manifestEntry in $manifestEntries) {
    $relativePath = [string]$manifestEntry.path
    $file = Assert-ChildPath $RuntimeRoot (Join-Path $RuntimeRoot $relativePath) "manifest file"
    Assert-Sha256 $file $manifestEntry.sha256 "manifest file $relativePath"
    $record = [ordered]@{
      path = $relativePath.Replace('\', '/')
      size = (Get-Item -LiteralPath $file).Length
      sha256 = Get-Sha256 $file
    }
    if ($platform.authenticode.files -contains $relativePath) {
      $signature = Get-AuthenticodeSignature -LiteralPath $file
      if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        throw "Authenticode 验证失败：$relativePath ($($signature.Status))"
      }
      if ($signature.SignerCertificate.Subject -ne $platform.authenticode.subject -or
          $signature.SignerCertificate.Thumbprint -ne $platform.authenticode.thumbprint) {
        throw "Authenticode 签名身份与 runtime-lock 不一致：$relativePath"
      }
      $record.authenticode = [ordered]@{
        status = $signature.Status.ToString()
        subject = $signature.SignerCertificate.Subject
        thumbprint = $signature.SignerCertificate.Thumbprint
      }
    }
    $files += [pscustomobject]$record
  }

  $runtimeManifest = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTimeOffset]::UtcNow.ToString("O")
    upstream = [ordered]@{
      repository = $lock.upstream.repository
      tag = $lock.upstream.tag
      commit = $lock.upstream.commit
      license = $lock.upstream.license
    }
    target = $platform.target
    archive = [ordered]@{
      fileName = $platform.archive.fileName
      url = $platform.archive.url
      sha256 = $platform.archive.sha256
    }
    files = $files
  }
  $manifestPath = Join-Path $RuntimeRoot "runtime-manifest.json"
  $runtimeManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  Write-Host "Codex runtime 已锁定：$($lock.upstream.tag) ($($lock.upstream.commit))"
  Write-Host "Runtime 目录：$RuntimeRoot"
  Write-Host "下一步：在 apps\desktop 运行 npm run electron:runtime:verify"
} finally {
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
}
