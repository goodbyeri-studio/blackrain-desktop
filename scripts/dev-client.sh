#!/usr/bin/env bash
# 一键启动本地客户端（开发模式）
#   壳(CodexMonitor fork) + 翻译网关 + DeepSeek
#
# 用法：在仓库根执行
#   ./scripts/dev-client.sh
#
# ⚠️ 会开 GUI 窗口，须在有显示器的本机跑（非 SSH/无头）。
# 前提：① 已 cp .env.example .env 并填好 DEEPSEEK_API_KEY
#       ② 已编译 codex 内核（见 快捷命令行.md「内核构建」）
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

# ── 3. 准备开发用 CODEX_HOME（带 DeepSeek provider 配置，指向网关）──
# 模型可在启动时指定：DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh
# 默认 deepseek-v4-flash（高性价比主力，1M 上下文）；攻坚改 deepseek-v4-pro（1.6T 旗舰，1M）。
# 注：旧名 deepseek-chat / deepseek-reasoner 将于 2026-07-24 弃用。
DEV_MODEL="${DEV_MODEL:-deepseek-v4-flash}"
DEV_HOME="$REPO/.scratch/dev-codex-home"
mkdir -p "$DEV_HOME"
cat > "$DEV_HOME/config.toml" <<TOML
model = "${DEV_MODEL}"
model_provider = "deepseek"

[model_providers.deepseek]
name = "DeepSeek (via gateway)"
base_url = "http://127.0.0.1:8899/v1"
env_key = "DEEPSEEK_API_KEY"
wire_api = "responses"
TOML
export CODEX_HOME="${DEV_HOME}"
echo "✓ CODEX_HOME: ${DEV_HOME} (模型: ${DEV_MODEL})"

# ── 4. 起翻译网关（后台），退出时自动清理 ──
GW_PORT="${GW_PORT:-8899}"
STRIP_TOOLS="${STRIP_TOOLS:-0}" GW_PORT="$GW_PORT" \
  python3 "$REPO/gateway/gateway.py" >/tmp/dev-gateway.log 2>&1 &
GW_PID=$!
cleanup() { echo; echo "停止网关 (PID $GW_PID)…"; kill "$GW_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 1
if ! kill -0 "$GW_PID" 2>/dev/null; then
  echo "✗ 网关启动失败，日志：/tmp/dev-gateway.log" >&2
  cat /tmp/dev-gateway.log >&2; exit 1
fi
echo "✓ 网关：127.0.0.1:$GW_PORT (PID $GW_PID, 日志 /tmp/dev-gateway.log)"

# ── 5. 起壳（开发模式，热重载）──
echo
echo "启动壳 … 首次会编译/打开窗口，按 Ctrl-C 退出（会自动停网关）"
cd "$REPO/apps/desktop"
CARGO_NET_GIT_FETCH_WITH_CLI=true npm run tauri dev
