#!/usr/bin/env bash
# 一键启动本地客户端（开发模式）
#   壳(CodexMonitor fork) + 翻译网关 + DeepSeek
#
# 用法：在仓库根执行
#   ./scripts/dev-client.sh
#   DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh   # 指定模型
#   GW_PORT=9000 ./scripts/dev-client.sh                # 换网关端口（内核会自动跟随）
#
# ⚠️ 会开 GUI 窗口，须在有显示器的本机跑（非 SSH/无头）。
# 前提：① 已 cp .env.example .env 并填好 DEEPSEEK_API_KEY
#       ② 已编译 codex 内核（见 docs/commands.md「内核构建」）
#       ③ apps/desktop 已 npm install
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# ── 1. 加载密钥 ──
if [[ ! -f .env ]]; then
  echo "✗ 缺 .env。先 cp .env.example .env 并填 DEEPSEEK_API_KEY" >&2
  exit 1
fi
set -a; source .env; set +a
if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "✗ .env 里 DEEPSEEK_API_KEY 为空" >&2
  exit 1
fi

# ── 2. 定位内核二进制，prepend 到 PATH（不污染全局）──
KERNEL_DIR="$REPO/codex-upstream/codex-rs/target/debug"
if [[ ! -x "$KERNEL_DIR/codex" ]]; then
  echo "✗ 找不到 codex 内核二进制：$KERNEL_DIR/codex" >&2
  echo "  先编译：cd codex-upstream/codex-rs && cargo build -p codex-cli --bin codex" >&2
  exit 1
fi
export PATH="$KERNEL_DIR:$PATH"
echo "✓ codex 内核：$(command -v codex)"

# ── 3. 前置依赖自检（早失败，别等编译十几分钟才炸）──
if [[ ! -d "$REPO/apps/desktop/node_modules" ]]; then
  echo "✗ apps/desktop 未安装依赖。先：cd apps/desktop && npm install" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ 找不到 python3（网关需要）" >&2
  exit 1
fi
# cmake：whisper-rs（语音输入）构建必需，缺了会在编译末段才报错
if ! command -v cmake >/dev/null 2>&1; then
  echo "✗ 找不到 cmake（whisper-rs 构建必需）。macOS: brew install cmake" >&2
  exit 1
fi

# ── 4. 准备开发用 CODEX_HOME（Codex 只认识 BlackRain Gateway）──
# 模型可在启动时指定：DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh
# 默认 deepseek-v4-flash（高性价比主力，1M 上下文）；攻坚改 deepseek-v4-pro（1.6T 旗舰，1M）。
# 注：旧名 deepseek-chat / deepseek-reasoner 将于 2026-07-24 弃用。
DEV_MODEL="${DEV_MODEL:-deepseek-v4-flash}"
GW_PORT="${GW_PORT:-8899}"   # 先定端口，下面 config.toml 与网关共用同一个值
DEV_HOME="$REPO/.scratch/dev-codex-home"
mkdir -p "$DEV_HOME"
export BLACKRAIN_GATEWAY_API_KEY="${BLACKRAIN_GATEWAY_API_KEY:-local-dev-gateway}"
cat > "$DEV_HOME/config.toml" <<TOML
model = "${DEV_MODEL}"
model_provider = "blackrain_gateway"

[model_providers.blackrain_gateway]
name = "BlackRain Gateway"
base_url = "http://127.0.0.1:${GW_PORT}/v1"
env_key = "BLACKRAIN_GATEWAY_API_KEY"
wire_api = "responses"
TOML
export CODEX_HOME="${DEV_HOME}"
echo "✓ CODEX_HOME: ${DEV_HOME} (模型: ${DEV_MODEL})"

# ── 5. 起翻译网关（后台），退出时自动清理 ──
# 端口预检：被上次残留进程占着时，直接给出 PID，别让 bind 失败埋进日志
if lsof -nP -iTCP:"$GW_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ 端口 $GW_PORT 已被占用（可能是上次残留的网关）：" >&2
  lsof -nP -iTCP:"$GW_PORT" -sTCP:LISTEN >&2
  echo "  清理：kill \$(lsof -nP -tiTCP:$GW_PORT -sTCP:LISTEN)" >&2
  exit 1
fi
GW_LOG="/tmp/dev-gateway.log"   # 网关 stdout 与内部 log() 统一写这一个文件
STRIP_TOOLS="${STRIP_TOOLS:-0}" GW_PORT="$GW_PORT" GW_LOG="$GW_LOG" \
  python3 "$REPO/gateway/gateway.py" >"$GW_LOG" 2>&1 &
GW_PID=$!
cleanup() { echo; echo "停止网关 (PID $GW_PID)…"; kill "$GW_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# 就绪轮询：等端口真的能连上（最多 10 秒），而不是盲 sleep
ready=0
for _ in $(seq 1 50); do
  if ! kill -0 "$GW_PID" 2>/dev/null; then
    echo "✗ 网关进程已退出，日志：$GW_LOG" >&2
    cat "$GW_LOG" >&2; exit 1
  fi
  # /health 免鉴权、返回 200，是 App 自己也用的存活探针
  if curl -fs -o /dev/null "http://127.0.0.1:$GW_PORT/health" 2>/dev/null; then
    ready=1; break
  fi
  sleep 0.2
done
if [[ "$ready" != "1" ]]; then
  echo "✗ 网关 10 秒内未就绪，日志：$GW_LOG" >&2
  cat "$GW_LOG" >&2; exit 1
fi
echo "✓ 网关：127.0.0.1:$GW_PORT (PID $GW_PID, 日志 $GW_LOG)"

# ── 6. 起壳（开发模式，热重载；含 doctor:strict 环境自检）──
echo
echo "启动壳 … 首次会编译/打开窗口，按 Ctrl-C 退出（会自动停网关）"
cd "$REPO/apps/desktop"
CARGO_NET_GIT_FETCH_WITH_CLI=true npm run tauri:dev
