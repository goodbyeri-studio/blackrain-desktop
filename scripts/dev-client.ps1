param(
  [switch]$SkipRuntimeVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ne 7) {
  throw "BlackRain Electron 开发入口必须使用 PowerShell 7。"
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$desktop = Join-Path $repo "apps\desktop"
if (-not (Test-Path -LiteralPath (Join-Path $desktop "node_modules") -PathType Container)) {
  throw "apps/desktop 尚未安装依赖；请先在该目录运行 npm.cmd install。"
}

Push-Location $desktop
try {
  if (-not $SkipRuntimeVerification) {
    & npm.cmd run electron:runtime:verify
    if ($LASTEXITCODE -ne 0) { throw "Codex runtime 校验失败。" }
    & npm.cmd run electron:node-runtime:verify
    if ($LASTEXITCODE -ne 0) { throw "Node runtime 校验失败。" }
    & npm.cmd run electron:browser-client:verify
    if ($LASTEXITCODE -ne 0) { throw "Browser client 校验失败。" }
  }

  & npm.cmd run electron:start
  if ($LASTEXITCODE -ne 0) { throw "Electron 开发进程退出，code=$LASTEXITCODE。" }
} finally {
  Pop-Location
}
