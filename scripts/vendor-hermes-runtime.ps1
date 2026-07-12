param(
  [string]$UvExe = "uv",
  [switch]$Force
)

# 在 Windows 构建机生成可搬移的 Hermes WORK runtime。
# 构建机需要 uv；最终客户端运行不依赖系统 Python、uv 或 Node。
$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "vendor-hermes-runtime.ps1 只能在 Windows x64 构建机执行。"
}
if (-not [Environment]::Is64BitOperatingSystem) {
  throw "Hermes runtime 只支持 Windows x64。"
}

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$hermes = Join-Path $repo "hermes-upstream"
$manifestPath = Join-Path $repo "apps\desktop\src-tauri\resources\hermes-runtime\windows-x64.manifest.json"
$target = Join-Path $repo "apps\desktop\src-tauri\resources\hermes-runtime\windows-x64"
$inventoryScript = Join-Path $repo "scripts\hermes-runtime-inventory.py"
$routerSource = Join-Path $repo "apps\desktop\src-tauri\resources\mcp-router\blackrain_mcp_router.py"

function Invoke-Checked([scriptblock]$Command, [string]$Label) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Normalize-PackageName([string]$Name) {
  return ($Name.ToLowerInvariant() -replace '[_.]+', '-')
}

if (-not (Get-Command $UvExe -ErrorAction SilentlyContinue)) {
  throw "找不到 uv。它只用于构建 runtime，不会随客户端运行。"
}
if (-not (Test-Path (Join-Path $hermes ".git"))) {
  throw "缺少 hermes-upstream。先运行 scripts/fetch-references.sh 或按 docs/commands.md 拉取锁定上游。"
}
if (-not (Test-Path $manifestPath)) {
  throw "缺少 Hermes runtime manifest: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not (Test-Path $routerSource)) {
  throw "缺少 BlackRain MCP router 源文件: $routerSource"
}
if ((Get-Sha256 $routerSource) -ne $manifest.blackrainMcpRouter.sha256) {
  throw "BlackRain MCP router hash 与 manifest 不一致。"
}
$actualCommit = (& git -C $hermes rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $manifest.hermes.commit) {
  throw "Hermes commit 不匹配。期望 $($manifest.hermes.commit)，实际 $actualCommit。"
}
$actualTag = (& git -C $hermes describe --tags --exact-match HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualTag -ne $manifest.hermes.tag) {
  throw "Hermes tag 不匹配。期望 $($manifest.hermes.tag)，实际 $actualTag。"
}
if ((Get-Sha256 (Join-Path $hermes "pyproject.toml")) -ne $manifest.hermes.pyprojectSha256) {
  throw "Hermes pyproject.toml hash 与 manifest 不一致。"
}
if ((Get-Sha256 (Join-Path $hermes "LICENSE")) -ne $manifest.hermes.licenseSha256) {
  throw "Hermes LICENSE hash 与 manifest 不一致；升级前必须重新完成许可证审计。"
}
if ((Get-Sha256 (Join-Path $hermes "uv.lock")) -ne $manifest.hermes.uvLockSha256) {
  throw "Hermes uv.lock hash 与 manifest 不一致。"
}

if ((Test-Path (Join-Path $target "venv\Scripts\hermes.exe")) -and -not $Force) {
  Write-Host "✓ Hermes runtime 已存在：$target（使用 -Force 重建）"
  exit 0
}

$buildRoot = Join-Path $repo ".scratch\hermes-runtime-build-$([Guid]::NewGuid().ToString('N'))"
$stage = Join-Path $buildRoot "runtime"
$pythonInstall = Join-Path $stage "python"
$venv = Join-Path $stage "venv"
$venvPython = Join-Path $venv "Scripts\python.exe"
$constraints = Join-Path $buildRoot "messaging-constraints.txt"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$oldPythonInstallDir = $env:UV_PYTHON_INSTALL_DIR
$oldVirtualEnv = $env:VIRTUAL_ENV
try {
  $env:UV_PYTHON_INSTALL_DIR = $pythonInstall
  Invoke-Checked { & $UvExe python install $manifest.python.version --managed-python } "uv python install"
  $pythonExe = (& $UvExe python find $manifest.python.version --managed-python).Trim()
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pythonExe)) {
    throw "uv 未返回可用的 Python $($manifest.python.version)：$pythonExe"
  }
  $actualPython = (& $pythonExe -c "import platform; print(platform.python_version())").Trim()
  if ($actualPython -ne $manifest.python.version) {
    throw "Python 版本不匹配。期望 $($manifest.python.version)，实际 $actualPython。"
  }

  Invoke-Checked { & $UvExe venv $venv --python $pythonExe --relocatable --clear } "uv venv"
  $env:VIRTUAL_ENV = $venv
  $syncArgs = @("sync", "--frozen", "--no-dev", "--no-editable", "--active", "--project", $hermes, "--python", $venvPython)
  foreach ($extra in @($manifest.install.extras)) {
    $syncArgs += @("--extra", $extra)
  }
  Invoke-Checked {
    & $UvExe @syncArgs
  } "uv sync Hermes core"

  Invoke-Checked {
    & $UvExe export --frozen --no-dev --extra messaging --no-emit-project --project $hermes --output-file $constraints
  } "uv export constraints"
  foreach ($package in @($manifest.install.additionalPackages)) {
    Invoke-Checked {
      & $UvExe pip install --python $venvPython --constraint $constraints $package
    } "uv pip install $package"
  }

  Invoke-Checked {
    & $venvPython -c "import asyncio, importlib.metadata as m, importlib.util, sys; import aiohttp, mcp, yaml, hermes_cli; import gateway.platforms.api_server; import tools.mcp_tool; assert m.version('hermes-agent') == '$($manifest.hermes.version)'; assert m.version('mcp') == '$($manifest.requiredDistributions.mcp)'; assert importlib.util.find_spec('uvloop') is None; compile(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1], 'exec'); asyncio.run(asyncio.sleep(0))" $routerSource
  } "Hermes import smoke"

  $installedJson = (& $UvExe pip list --python $venvPython --format json) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "uv pip list failed."
  }
  $installed = $installedJson | ConvertFrom-Json
  $installedNames = @{}
  foreach ($package in $installed) {
    $installedNames[(Normalize-PackageName $package.name)] = $package.version
  }
  foreach ($forbidden in @($manifest.forbiddenDistributions)) {
    $normalized = Normalize-PackageName $forbidden
    if ($installedNames.ContainsKey($normalized)) {
      throw "禁止依赖进入 Hermes runtime：$forbidden==$($installedNames[$normalized])"
    }
  }
  foreach ($required in $manifest.requiredDistributions.PSObject.Properties) {
    $normalized = Normalize-PackageName $required.Name
    if (-not $installedNames.ContainsKey($normalized)) {
      throw "Hermes runtime 缺少必需依赖：$($required.Name)==$($required.Value)"
    }
    if ($installedNames[$normalized] -ne [string]$required.Value) {
      throw "Hermes runtime 必需依赖版本不匹配：$($required.Name)，期望 $($required.Value)，实际 $($installedNames[$normalized])"
    }
  }

  $packageLock = $installed |
    Sort-Object { Normalize-PackageName $_.name } |
    ForEach-Object { "$($_.name)==$($_.version)" }
  Set-Content -LiteralPath (Join-Path $stage "packages.lock.txt") -Value (($packageLock -join "`n") + "`n") -Encoding UTF8

  $licenses = Join-Path $stage "LICENSES"
  $provenanceDir = Join-Path $stage "provenance"
  New-Item -ItemType Directory -Force -Path $licenses | Out-Null
  New-Item -ItemType Directory -Force -Path $provenanceDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $hermes "LICENSE") -Destination (Join-Path $licenses "Hermes-Agent-MIT.txt")
  Invoke-Checked {
    & $venvPython $inventoryScript --output (Join-Path $stage "provenance\python-distributions.json") --licenses $licenses
  } "Python License inventory"

  $notice = @"
BlackRain Hermes WORK runtime

This runtime includes Hermes Agent $($manifest.hermes.version) from
$($manifest.hermes.repository) at commit $actualCommit, licensed under MIT.
Its license is included at LICENSES/Hermes-Agent-MIT.txt.

Python distribution versions, declared license metadata, and collected license
files are recorded in provenance/python-distributions.json and LICENSES/.
"@
  Set-Content -LiteralPath (Join-Path $stage "NOTICE.txt") -Value ($notice.Trim() + "`n") -Encoding UTF8

  Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $provenanceDir "runtime-manifest.json")
  Copy-Item -LiteralPath $routerSource -Destination (Join-Path $stage $manifest.blackrainMcpRouter.runtimePath)
  $uvVersion = (& $UvExe --version).Trim()
  $buildInfo = [ordered]@{
    schemaVersion = 1
    platform = "windows-x64"
    builtAtUtc = [DateTime]::UtcNow.ToString("o")
    hermesCommit = $actualCommit
    hermesTag = $actualTag
    hermesVersion = $manifest.hermes.version
    pythonVersion = $actualPython
    uvVersion = $uvVersion
    extras = @($manifest.install.extras)
    additionalPackages = @($manifest.install.additionalPackages)
    inventoryScriptSha256 = Get-Sha256 $inventoryScript
    mcpRouterSha256 = Get-Sha256 $routerSource
  } | ConvertTo-Json -Depth 5
  Set-Content -LiteralPath (Join-Path $provenanceDir "build.json") -Value $buildInfo -Encoding UTF8

  $checksumPath = Join-Path $stage "SHA256SUMS"
  $checksums = Get-ChildItem -LiteralPath $stage -Recurse -File |
    Where-Object { $_.FullName -ne $checksumPath } |
    Sort-Object FullName |
    ForEach-Object {
      $relative = [IO.Path]::GetRelativePath($stage, $_.FullName).Replace('\', '/')
      "$(Get-Sha256 $_.FullName)  $relative"
    }
  Set-Content -LiteralPath $checksumPath -Value ($checksums -join "`n") -Encoding UTF8

  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -LiteralPath $target -Force |
    Where-Object { $_.Name -ne ".gitkeep" } |
    Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $stage -Force | Move-Item -Destination $target
  Write-Host "✓ Hermes runtime vendored: $target"
} finally {
  $env:UV_PYTHON_INSTALL_DIR = $oldPythonInstallDir
  $env:VIRTUAL_ENV = $oldVirtualEnv
  Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
}
