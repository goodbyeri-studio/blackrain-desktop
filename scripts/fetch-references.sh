#!/usr/bin/env sh
# 拉取参考用的上游源码到本地。
# 这些源码仅供随时翻阅参考，是【只读】的，不纳入本仓库 git（已在 .gitignore 排除）。
# 用法：sh scripts/fetch-references.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── openai/codex ── 我们计划 Fork 的上游内核（许可证 Apache-2.0）
# 参考时锁定的 commit：cfead68（2026-06-29；历经 51b3cd5/2026-06-09 → bdd282f/2026-06-27 → cfead68，2026-06-30 跟进上游，协议四探针 + 17 方法能力探针复测全绿）。如需对齐请在克隆后自行 checkout。
if [ ! -d codex-upstream ]; then
  echo "→ 克隆 openai/codex 到 codex-upstream/ ..."
  git clone --depth 1 https://github.com/openai/codex.git codex-upstream
else
  echo "✓ codex-upstream/ 已存在，跳过。"
fi

# ── NousResearch/hermes-agent ── WORK 引擎黑盒（许可证 MIT）
# 同 codex 待遇：只读黑盒、不入库、白嫖上游。
# TODO(钉版本)：spike 阶段先拉 HEAD 探路；架构验通后必须钉死一个 commit 并存证
#   （MIT 对快照不可撤销，防 Nous 未来版本转 BSL/商业授权）。届时改成
#   `git clone https://...hermes-agent.git hermes-upstream && cd hermes-upstream && git checkout <commit>`
if [ ! -d hermes-upstream ]; then
  echo "→ 克隆 NousResearch/hermes-agent 到 hermes-upstream/ ..."
  git clone --depth 1 https://github.com/NousResearch/hermes-agent.git hermes-upstream
else
  echo "✓ hermes-upstream/ 已存在，跳过。"
fi

echo ""
echo "参考源码就绪。其余竞品（Coze Studio、Dify 等）按需临时克隆即可，勿整包入库。"
echo "详见 docs/REFERENCES.md"
