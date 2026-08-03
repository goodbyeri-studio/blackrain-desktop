param(
  [Parameter(Mandatory = $true)]
  [string]$MsixPath,
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath,
  [Parameter(Mandatory = $true)]
  [string]$ResultPath
)

$ErrorActionPreference = "Stop"

try {
  Import-Certificate -FilePath $CertificatePath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
  Import-Certificate -FilePath $CertificatePath -CertStoreLocation "Cert:\LocalMachine\TrustedPeople" | Out-Null
  Add-AppxPackage -Path $MsixPath -ForceApplicationShutdown
  $package = Get-AppxPackage -Name "cc.goodbyeri.blackrain" -ErrorAction Stop
  $manifest = Get-AppxPackageManifest -Package $package
  $result = [ordered]@{
    ok = $true
    packageFullName = $package.PackageFullName
    packageFamilyName = $package.PackageFamilyName
    version = $package.Version.ToString()
    status = $package.Status.ToString()
    installLocation = $package.InstallLocation
    applicationId = $manifest.Package.Applications.Application.Id
  }
} catch {
  $result = [ordered]@{
    ok = $false
    error = $_.Exception.ToString()
  }
}

$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultPath -Encoding utf8
if (-not $result.ok) { exit 1 }
