# 快捷命令行

> 常用命令速查。命令均经实跑验证。路径以仓库根 `2049-app/` 为基准。
> 详细背景见 [CONTRIBUTING](../CONTRIBUTING.md)（协作流程）、[docs/09](09-运行时架构与里程碑.md)（运行时架构）。

## 目录

- [日常 GitHub Flow](#日常-github-flow)（最常用）
- [启动本地客户端](#启动本地客户端)
- [内核构建](#内核构建)
- [模型网关](#模型网关)
- [协议探针 / 测试](#协议探针--测试)
- [上游同步（subtree）](#上游同步subtree)
- [密钥 / 环境](#密钥--环境)

---

## 日常 GitHub Flow

```bash
# 开新工作：从最新 main 切分支
git switch main && git pull
git switch -c feat/我的功能          # type: feat/fix/docs/refactor/chore/test

# 提交（type 前缀必带）
git add -p
git commit -m "feat: 一句话描述"

# 推分支 + 开 PR
git push -u origin feat/我的功能
gh pr create                          # 按提示填，或加 --title/--body

# 看 PR 状态 / 合并（Squash + 自动删分支）
gh pr view <num>
gh pr merge <num> --squash --delete-branch

# 合并后回 main 同步 + 清理本地过期分支引用
git switch main && git pull --prune
```

---

## 启动本地客户端

> 桌面壳（CodexMonitor fork）+ BlackRain Gateway（默认 DeepSeek）。需要三样就位：内核二进制、网关、密钥。
> ⚠️ `tauri dev` 会开 GUI 窗口，需在有显示器的本机跑（非 SSH/无头）。

### 一键启动（推荐）

```bash
./scripts/dev-client.sh

# 指定模型启动（默认 deepseek-v4-flash；攻坚用 pro）
DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh
```

封装了：加载 `.env` 密钥 → 把内核二进制注入 PATH → 准备只连接 `blackrain_gateway` 的 CODEX_HOME → 起网关 → `npm run tauri dev`。按 Ctrl-C 退出会自动停网关。
前提：① `cp .env.example .env` 填好 key；② 内核已编译（见下方「内核构建」）；③ `apps/desktop` 已 `npm install`。

### 首次环境前提（编译 Tauri 后端会撞的两个坑）

```bash
# 坑 1：cargo 用内置 libgit2 拉 git 依赖会 SSL 握手失败 → 改用系统 git
export CARGO_NET_GIT_FETCH_WITH_CLI=true     # 脚本已内置，手动编时需自己设

# 坑 2：whisper-rs（语音输入）构建需要 cmake
brew install cmake
```

### 手动分步（debug 用）

```bash
# 0) 一次性前提
cd apps/desktop && npm install && cd ..        # 装壳前端依赖
#    内核二进制需已编译，见「内核构建」；产物在
#    codex-upstream/codex-rs/target/debug/codex

# 1) 起翻译网关（后台，默认接 DeepSeek）
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)
STRIP_TOOLS=0 python3 gateway/gateway.py &      # 监听 127.0.0.1:8899

# 2) 起壳（在 apps/desktop 下）
cd apps/desktop
CARGO_NET_GIT_FETCH_WITH_CLI=true npm run tauri dev   # 首次会编 Rust 后端较久
```

壳默认找 PATH 上的 `codex`；CODEX_HOME 未在设置里配时，继承启动 shell 的 `CODEX_HOME` 环境变量（一键脚本已处理这两点）。config.toml 范例见 [docs/09](09-运行时架构与里程碑.md)：`model_provider` 固定为 `blackrain_gateway`，provider 的 `base_url` 填 `http://127.0.0.1:8899/v1`、`wire_api="responses"`。

```bash
# 关掉后台网关
kill %1            # 或 pkill -f gateway.py
```

---

## 内核构建

> codex 内核当黑盒用，从 `codex-upstream/`（gitignored 本地克隆）编译。首次约 12 分钟，之后增量很快。

```bash
cd codex-upstream/codex-rs

# 壳需要的二进制：codex（带 app-server 子命令）
cargo build -p codex-cli --bin codex
#   产物：target/debug/codex

# 仅协议调试用的精简二进制（本身即 app-server，无子命令）
cargo build -p codex-app-server
#   产物：target/debug/codex-app-server

# 验证 app-server 子命令可用
./target/debug/codex --help | grep app-server
```

---

## 模型网关

> `gateway/gateway.py`：responses⇄chat 翻译，纯 stdlib 零依赖。内置 DeepSeek provider，可用 JSON 环境变量追加 OpenAI-compatible provider。详见 [gateway/README](../gateway/README.md)。

```bash
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)

# 启动（环境变量可调）
python3 gateway/gateway.py
#   GW_PORT=8899      监听端口
#   STRIP_TOOLS=1     剥工具逼纯文本（调试）；=0 允许多轮工具调用
#   GW_LOG=/tmp/gateway.log   交互日志
#   BLACKRAIN_MODEL_GATEWAY_PROVIDERS='[...]'  追加第三方 provider registry

# 看 Gateway 暴露给 Codex/前端的模型
curl -s http://127.0.0.1:8899/v1/models

# 直连 DeepSeek 健康检查（不回显 key）
curl -s https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

---

## 协议探针 / 测试

> 验证壳⇄内核协议兼容、或 DeepSeek 经网关驱动内核。脚本在 `.scratch/`（gitignored 草稿区）。

```bash
BIN="$PWD/codex-upstream/codex-rs/target/debug/codex-app-server"

# 协议四探针（initialize/model·list/thread·start/turn·start）
python3 .scratch/m0_protocol_probe.py "$BIN" <CODEX_HOME> <工作区>

# 触发工具调用、跑多轮（需先起网关 + 配好 CODEX_HOME 指向网关）
python3 .scratch/m0_tool_driver.py "$BIN" <CODEX_HOME> <工作区>
```

---

## 上游同步（subtree）

> ⚠️ 维护者动作，约定一人负责，别随手做。`apps/desktop/` 是 CodexMonitor 的 subtree。

```bash
# 拉上游 CodexMonitor 最新（--squash 不灌全史）
git subtree pull --prefix apps/desktop \
  https://github.com/Dimillian/CodexMonitor main --squash
```

---

## 密钥 / 环境

```bash
# 首次：复制模板填自己的 key
cp .env.example .env
#   编辑 .env 填入真实 DEEPSEEK_API_KEY；.env 已 gitignore，绝不提交

# 临时加载到当前 shell
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)
```

> 密钥只存本地 `.env` 或环境变量，**永不写进会提交的文件、不在聊天/IM 明文发**。泄露立即去控制台吊销重发。
