#!/usr/bin/env sh
# 拉取参考用的上游源码到本地。
# 这些源码仅供随时翻阅参考，是【只读】的，不纳入本仓库 git（已在 .gitignore 排除）。
# 用法：sh scripts/fetch-references.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── openai/codex ── 我们计划 Fork 的上游内核（许可证 Apache-2.0）
# 参考时锁定的 commit：51b3cd5（2026-06-09）。如需对齐请在克隆后自行 checkout。
if [ ! -d codex-upstream ]; then
  echo "→ 克隆 openai/codex 到 codex-upstream/ ..."
  git clone --depth 1 https://github.com/openai/codex.git codex-upstream
else
  echo "✓ codex-upstream/ 已存在，跳过。"
fi

echo ""
echo "参考源码就绪。其余竞品（Coze Studio、Dify 等）按需临时克隆即可，勿整包入库。"
echo "详见 docs/REFERENCES.md"
