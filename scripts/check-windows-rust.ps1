Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Cargo {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & cargo @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "cargo $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

Push-Location (Join-Path $RepoRoot "apps\desktop\src-tauri")
try {
  Invoke-Cargo test --no-run --locked
  Invoke-Cargo test workbench_core --lib --locked
} finally {
  Pop-Location
}
