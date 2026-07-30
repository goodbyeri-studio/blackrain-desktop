# 一键启动本地客户端(开发模式,Windows)
#   壳(CodexMonitor fork) + 翻译网关 + DeepSeek
#
# 用法(仓库根目录)：
#   pwsh scripts/dev-client.ps1
#   $env:DEV_MODEL = "deepseek-v4-pro"; pwsh scripts/dev-client.ps1
#   $env:GW_PORT = "9000"; pwsh scripts/dev-client.ps1
#
# 与 dev-client.sh 对等(PowerShell 版,见 .specs/007-windows-client)。
# 前提：① cp .env.example .env 并填好 DEEPSEEK_API_KEY
#       ② 内核已编译(见 docs/commands.md「内核构建」Windows 段)
#       ③ apps\desktop 已 npm install
#       ④ choco install cmake llvm(whisper-rs 需要)
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo

# ── 1. 加载 .env ──
if (-not (Test-Path .env)) {
  Write-Host "✗ 缺 .env。先 cp .env.example .env 并填 DEEPSEEK_API_KEY" -ForegroundColor Red
  exit 1
}
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)\s*=\s*(.*)$') {
    $val = $Matches[2].Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($Matches[1], $val, 'Process')
  }
}
if (-not $env:DEEPSEEK_API_KEY) {
  Write-Host "✗ .env 里 DEEPSEEK_API_KEY 为空" -ForegroundColor Red
  exit 1
}

# ── 2. 内核入 PATH ──
$kernelDir = Join-Path $repo "codex-upstream\codex-rs\target\debug"
$codexExe = Join-Path $kernelDir "codex.exe"
if (-not (Test-Path $codexExe)) {
  Write-Host "✗ 找不到 codex 内核：$codexExe" -ForegroundColor Red
  Write-Host "  先编译：cd codex-upstream\codex-rs; `$env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true'; cargo build -p codex-cli --bin codex" -ForegroundColor Yellow
  exit 1
}
$env:PATH = "$kernelDir;$env:PATH"
Write-Host "✓ codex 内核：$codexExe" -ForegroundColor Green

# ── 3. 前置依赖自检(早失败) ──
if (-not (Test-Path "apps\desktop\node_modules")) {
  Write-Host "✗ apps/desktop 未安装依赖。先：cd apps\desktop; npm install" -ForegroundColor Red
  exit 1
}
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) {
  Write-Host "✗ 找不到 python(网关需要)。从 https://www.python.org/ 装 Python 3.10+" -ForegroundColor Red
  exit 1
}
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  Write-Host "✗ 找不到 cmake(whisper-rs 构建必需)。choco install cmake" -ForegroundColor Red
  exit 1
}

# ── 4. 准备 dev 用 CODEX_HOME(Codex 只认识 BlackRain Gateway) ──
$devModel = if ($env:DEV_MODEL) { $env:DEV_MODEL } else { "deepseek-v4-flash" }
$gwPort = if ($env:GW_PORT) { [int]$env:GW_PORT } else { 8899 }
$devContextWindow = if ($env:DEV_CONTEXT_WINDOW) { [int]$env:DEV_CONTEXT_WINDOW } else { 1000000 }
$devHome = Join-Path $repo ".scratch\dev-codex-home"
New-Item -ItemType Directory -Force -Path $devHome | Out-Null
if (-not $env:BLACKRAIN_GATEWAY_API_KEY) {
  $env:BLACKRAIN_GATEWAY_API_KEY = [guid]::NewGuid().ToString("N")
}
@"
model = "$devModel"
model_provider = "blackrain_gateway"
model_context_window = $devContextWindow

[model_providers.blackrain_gateway]
name = "BlackRain Gateway"
base_url = "http://127.0.0.1:$gwPort/v1"
env_key = "BLACKRAIN_GATEWAY_API_KEY"
wire_api = "responses"
"@ | Set-Content -Path (Join-Path $devHome "config.toml") -Encoding UTF8
$env:CODEX_HOME = $devHome
Write-Host "✓ CODEX_HOME: $devHome (模型: $devModel, 上下文: $devContextWindow)" -ForegroundColor Green

# ── 5. 端口预检 + 起翻译网关(后台) ──
$inUse = Get-NetTCPConnection -LocalPort $gwPort -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
  Write-Host "✗ 端口 $gwPort 已被占用：" -ForegroundColor Red
  $inUse | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  PID $($_.OwningProcess) ($($proc.ProcessName))" -ForegroundColor Yellow
  }
  Write-Host "  清理：Stop-Process -Id <PID> -Force" -ForegroundColor Yellow
  exit 1
}
$gwLog = Join-Path $env:TEMP "blackrain-dev-gateway.log"
$gwErr = "$gwLog.err"
if (-not $env:STRIP_TOOLS) { $env:STRIP_TOOLS = "0" }
$env:GW_PORT = "$gwPort"
$env:GW_LOG = $gwLog
$gw = Start-Process -FilePath $python.Source `
  -ArgumentList "`"$repo\gateway\gateway.py`"" `
  -WindowStyle Hidden `
  -RedirectStandardOutput $gwLog `
  -RedirectStandardError $gwErr `
  -PassThru
$gwPid = $gw.Id

# ── 6. 就绪轮询(最多 10 秒) ──
$ready = $false
for ($i = 0; $i -lt 50; $i++) {
  if (-not (Get-Process -Id $gwPid -ErrorAction SilentlyContinue)) {
    Write-Host "✗ 网关进程已退出。日志：" -ForegroundColor Red
    if (Test-Path $gwLog) { Get-Content $gwLog }
    if (Test-Path $gwErr) { Get-Content $gwErr }
    exit 1
  }
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$gwPort/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 200
}
if (-not $ready) {
  Write-Host "✗ 网关 10 秒内未就绪。日志：" -ForegroundColor Red
  if (Test-Path $gwLog) { Get-Content $gwLog }
  if (Test-Path $gwErr) { Get-Content $gwErr }
  Stop-Process -Id $gwPid -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "✓ 网关：127.0.0.1:$gwPort (PID $gwPid, 日志 $gwLog)" -ForegroundColor Green

# ── 7. 起壳(开发模式,热重载;含 doctor:win 环境自检) ──
Write-Host ""
Write-Host "启动壳 … 首次会编译/打开窗口，按 Ctrl-C 退出(会自动停网关)" -ForegroundColor Cyan
Set-Location (Join-Path $repo "apps\desktop")
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"
try {
  & npm.cmd run tauri:dev:win
} finally {
  Write-Host ""
  Write-Host "停止网关 (PID $gwPid)…" -ForegroundColor Yellow
  Stop-Process -Id $gwPid -Force -ErrorAction SilentlyContinue
}
