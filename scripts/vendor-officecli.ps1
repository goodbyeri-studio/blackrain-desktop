$ErrorActionPreference = "Stop"

$repo = "iOfficeAI/OfficeCLI"
$baseDir = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\resources\office-cli"
$baseDir = [System.IO.Path]::GetFullPath($baseDir)

$assets = @(
  @{ name = "officecli-win-x64.exe"; target = "windows-x64\officecli.exe" },
  @{ name = "officecli-mac-arm64"; target = "macos-arm64\officecli" },
  @{ name = "officecli-mac-x64"; target = "macos-x64\officecli" }
)

$version = $null
try {
  $resp = Invoke-WebRequest -Uri "https://github.com/$repo/releases/latest" -MaximumRedirection 5 -TimeoutSec 30 -ErrorAction Stop
  $finalUrl = $resp.BaseResponse.ResponseUri.AbsoluteUri
  if ($finalUrl -match '/releases/tag/(v[0-9]+\.[0-9]+\.[0-9]+)') {
    $version = $matches[1]
  }
} catch {
  if ($_.Exception.Response -and $_.Exception.Response.ResponseUri) {
    $finalUrl = $_.Exception.Response.ResponseUri.AbsoluteUri
    if ($finalUrl -match '/releases/tag/(v[0-9]+\.[0-9]+\.[0-9]+)') {
      $version = $matches[1]
    }
  }
}

if (-not $version) {
  throw "Unable to resolve latest OfficeCLI version."
}

Write-Host "Resolved OfficeCLI version: $version"

$releaseBase = "https://github.com/$repo/releases/download/$version"
New-Item -ItemType Directory -Force -Path $baseDir | Out-Null

foreach ($asset in $assets) {
  $targetPath = Join-Path $baseDir $asset.target
  $targetDir = Split-Path $targetPath -Parent
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $url = "$releaseBase/$($asset.name)"
  Write-Host "Downloading $($asset.name) -> $targetPath"
  Invoke-WebRequest -Uri $url -OutFile $targetPath -TimeoutSec 600
}

$shaTarget = Join-Path $baseDir "SHA256SUMS"
$shaLines = foreach ($asset in $assets) {
  $targetPath = Join-Path $baseDir $asset.target
  $hash = (Get-FileHash -Algorithm SHA256 -Path $targetPath).Hash.ToLowerInvariant()
  $normalizedTarget = $asset.target -replace '\\', '/'
  "$hash  $normalizedTarget"
}
$shaLines | Set-Content -Path $shaTarget -Encoding ascii

$licenseUrl = "https://raw.githubusercontent.com/$repo/main/LICENSE"
$licenseTarget = Join-Path $baseDir "LICENSE-OfficeCLI.txt"
Invoke-WebRequest -Uri $licenseUrl -OutFile $licenseTarget -TimeoutSec 120

Write-Host "OfficeCLI assets vendored into $baseDir"
