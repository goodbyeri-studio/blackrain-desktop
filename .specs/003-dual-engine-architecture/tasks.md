# Tasks

## 阶段 0：确认边界

- [x] 阅读相关 `README.md` / `docs/` / `AGENTS.md`
- [x] 确认是否涉及 `apps/desktop/AGENTS.md`（涉及：壳新增 WORK surface + 子进程纳管）
- [x] 确认是否触碰 `codex-upstream`，默认不改内核（不改，仍为黑盒）
- [x] 列出需要验证的真实命令或探针（见 verification）
- [ ] Hermes 数据飞轮关闭外传：读源码确认配置开关
- [ ] Hermes Python 依赖树许可证体检（拦 GPL/AGPL/BSL/无协议）

## 阶段 1：最小可用（1 周 Spike，验承重假设）

> 目标:在**开发机**上跑通双引擎最小闭环,验四个承重假设(WORK 无网关接国产 / CODE 沿用 / 共读记忆 / 跨模式不丢上下文)。**不碰交付打包**(开发机裸跑即可)。

### S0. 准备(Day 1)

- [ ] `sh scripts/fetch-references.sh` → 拉下 `hermes-upstream/`(HEAD 探路)
- [ ] 设 `export HERMES_HOME=$PWD/.scratch/hermes-home`(隔离目录,**绝不碰 `~/.hermes`**)
- [ ] 按官方 `install.sh` 在该 HERMES_HOME 下装好 Hermes(Python3.11/Node22/uv);若 `hermes gateway` 报缺 FastAPI,补装 `web` extra(见 design 未确认项)
- [ ] new-api 中转就绪,备好一个指向 GLM/DeepSeek 的 token

### S1. WORK 引擎:Hermes 经 /v1 接 new-api,无网关(Day 1–2)

- [ ] 写 `$HERMES_HOME/.env`:
  ```
  API_SERVER_ENABLED=true
  API_SERVER_KEY=<随机本地 token>
  API_SERVER_HOST=127.0.0.1
  API_SERVER_PORT=8642
  ```
- [ ] 写 `$HERMES_HOME/config.yaml` 用**命名 provider**接 new-api(**禁用 bare `custom`**,#14676 会静默 fallback OpenRouter):
  ```yaml
  providers:
    newapi:
      base_url: http://127.0.0.1:<new-api端口>/v1
      api_key: <new-api token>
      default_model: glm-4.x
  model:
    provider: custom:newapi
    api_mode: chat_completions
    default_headers:        # 防 WAF/中转拦 SDK 默认头(#40403)
      User-Agent: blackrain/0.x
  ```
- [ ] `HERMES_HOME=... hermes gateway` 起进程,捕获 stdout 等 "API server listening on http://127.0.0.1:8642"
- [ ] 就绪探测:`curl -H "Authorization: Bearer $KEY" 127.0.0.1:8642/health` → `{"status":"ok"}`;再 `GET /v1/capabilities` 看 `run_*`/`session_*`
- [ ] 冒烟:`POST /v1/chat/completions` 一句话,确认**真打到 new-api 并计量、回复正常**(不是悄悄走了 OpenRouter)
- [ ] **流式必测**(#21522/#25723):跑一个 streaming 请求,确认 SSE 不断、function calling 不在中转层丢

### S2. CODE 引擎:codex app-server,专属 CODEX_HOME(Day 2)

- [ ] 沿用现有链路起 codex app-server,`CODEX_HOME` 指向 App 专属目录(**不走 Hermes 自带 codex 集成**,避开 #5879/#7806)
- [ ] 用 `.scratch/m0_*.py` 探针验协议兼容(沿用既有)
- [ ] 冒烟:让 codex 在一个测试工作区做一次 `apply_patch` 改文件,确认回路通

### S3. 外置记忆共享存储最小原型(Day 3)

- [ ] 定一个引擎外的最小存储(spike 阶段可先 JSON 文件/SQLite,形态见 design 待定项)
- [ ] WORK 侧:Hermes 跑完一个任务后,把一条「记忆」写进外置存储(而非只留在 Hermes 自己 sessions 里)
- [ ] CODE 侧:codex 启动一个子任务前,从同一份外置存储读到那条记忆并带入上下文
- [ ] 验证:**两引擎读写的是同一份**,不是各存各的

### S4. 跨模式端到端(Day 4–5)

- [ ] 由一个最小编排脚本(代壳)串起:WORK(Hermes 接 GLM 理解一个需求)→ **切出干净子任务**(只传必要输入,不共享活的引擎状态)→ CODE(codex 造一个最小插件)→ 回 WORK(把结果/用法带给"用户")
- [ ] 全程经 new-api:WORK 路径 Chat 直入、CODE 路径(若需模型)走网关→Chat,**两条都在 new-api 计到量**

### 过关判据(全绿才算架构验通)

- [ ] 多轮不丢上下文(WORK 连续 ≥3 轮带记忆,CODE 子任务回传后 WORK 能接上)
- [ ] 流式不断、function calling 不在中转层丢
- [ ] 两模式读到**同一条**外置记忆
- [ ] new-api **两条路径都计到量**(WORK Chat 直入 + CODE 经网关)
- [ ] 跨模式子任务切分干净(无"一轮对话里热切引擎"导致的状态丢失)

### 翻车判据(任一出现 → 停下重评架构,不硬补)

- 接 new-api 的请求悄悄走了 OpenRouter(命名 provider 没生效,#14676)
- 流式在中转层断裂且无法靠标准 SSE 修复
- 外置记忆无法让两引擎一致读写(护城河外置假设不成立)
- 跨模式必须共享活的引擎状态才能跑通(说明"任务级接缝"假设错,需回到 design 重议)

## 阶段 2：产品化

- [ ] WORK / CODE 两个 surface 成形（面向两拨人）
- [ ] 从 Hermes Desktop 借 MIT React 组件（skills/memory/provider 面板）进 Tauri 壳
- [ ] new-api 差价计费跑通一个真实垂类（番茄小说例，见 memory `2049-first-loop-design`）
- [ ] 编排器：跨模式子任务切分/回传逻辑 + 测试

## 阶段 3：收口

- [ ] computer-use MCP sidecar 接入（评 `trycua/cua`，两引擎共用）
- [ ] 外置 skills 自进化雏形 + 插件市场雏形
- [ ] 更新文档和 spec（docs/03、docs/02 指针 + 本 spec）
- [ ] 跑完验证写入 `verification.md`
- [ ] 记录未解决风险
