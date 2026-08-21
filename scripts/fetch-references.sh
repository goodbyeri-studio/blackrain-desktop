#!/usr/bin/env sh
# 拉取参考用的上游源码到本地。
# 这些源码仅供随时翻阅参考，是【只读】的，不纳入本仓库 git（已在 .gitignore 排除）。
# 用法：sh scripts/fetch-references.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CODEX_URL="https://github.com/openai/codex.git"
CODEX_TAG="rust-v0.146.0"
CODEX_COMMIT="e363b08c9175ac1cbe5893615dd2cb9ddf95043b"

sync_tagged_reference() {
  name="$1"
  url="$2"
  dir="$3"
  tag="$4"
  expected_commit="$5"

  if [ ! -d "$dir/.git" ]; then
    if [ -e "$dir" ]; then
      echo "✗ $dir 已存在但不是 Git 仓库；为避免覆盖本地文件，停止同步。" >&2
      exit 1
    fi
    echo "→ 克隆 $name 到 $dir/ ..."
    git clone --no-checkout --filter=blob:none --depth 1 --branch "$tag" "$url" "$dir"
  fi

  if ! git -C "$dir" diff --quiet || ! git -C "$dir" diff --cached --quiet; then
    echo "✗ $dir/ 存在已跟踪文件改动；请先处理后再同步。" >&2
    exit 1
  fi

  echo "→ 同步 $name $tag ..."
  git -C "$dir" fetch --force --depth 1 origin "refs/tags/$tag:refs/tags/$tag"
  actual_commit="$(git -C "$dir" rev-parse "$tag^{}")"
  if [ "$actual_commit" != "$expected_commit" ]; then
    echo "✗ $name 标签 $tag 当前指向 $actual_commit，与存证 $expected_commit 不一致。" >&2
    exit 1
  fi

  git -C "$dir" checkout --detach "$expected_commit"
  echo "✓ $name 已锁定 $tag ($expected_commit)"
}

# 引擎作为只读黑盒使用；脚本只同步官方稳定 tag 并 checkout 精确 commit。
sync_tagged_reference "openai/codex" "$CODEX_URL" "codex-upstream" "$CODEX_TAG" "$CODEX_COMMIT"

echo ""
echo "参考源码已按稳定版本锁定。其余竞品（Coze Studio、Dify 等）按需临时克隆即可，勿整包入库。"
echo "详见 docs/reference/upstream-and-references.md"
