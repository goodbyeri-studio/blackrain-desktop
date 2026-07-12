# Tasks

## 阶段 0：确认边界

- [x] 阅读相关 `README.md` / `docs/` / `AGENTS.md`
- [x] 确认是否涉及 `apps/desktop/AGENTS.md`（涉及：壳新增 WORK surface + 子进程纳管）
- [x] 确认是否触碰 `codex-upstream`，默认不改内核（不改，仍为黑盒）
- [x] 列出需要验证的真实命令或探针（见 verification）
- [x] Hermes trajectory/遥测核查：trajectory 纯本地无内建外传，CUA 遥测默认关闭。（2026-06-25）
- [x] Hermes 核心发行依赖许可证体检：核心宽松许可证，LGPL 可选 extra 排除。（2026-06-25）
- [ ] 若要纳入 `hindsight-client`，先人工确认其许可证；未确认前不进发行包。

## 阶段 1：最小可用（1 周 Spike，验承重假设）

> 目标:在**开发机**上跑通双引擎最小闭环,验四个承重假设(WORK 无网关接国产 / CODE 沿用 / 共读记忆 / 跨模式不丢上下文)。**不碰交付打包**(开发机裸跑即可)。
>
> ★ **2026-07-12 口径更新**：Hermes WORK 承重与 Office 质量基线仍是执行器 P0；S5 只验证插件/MCP 动态激活，不再代表完整工作台模型。Manifest、安装、升级、回滚和卸载由 008 负责。

> **原两段式计划与实际结果**：原计划先直连厂商端点验证 Hermes，再切 new-api 验计量；2026-06-26 实际直接使用 new-api token 一步跑通 S1。若后续需要隔离 new-api 故障，可再补厂商直连诊断，但它不是当前未完成的产品交付项。

### S0. 准备(Day 1)

- [x] 拉取并核查 `hermes-upstream/`；2026-06-26 spike 基于旧版本，当前锁定 `9de9c25` 已完成上游 API Server/Windows 相关测试，BlackRain S1/S4/S5 与 Windows 产品验证仍待完成。
- [x] 设置隔离 `HERMES_HOME=$PWD/.scratch/hermes-home`，未写用户 `~/.hermes`。
- [x] 在隔离环境安装 Hermes/Python/uv 并确认 API server 真实依赖为 `aiohttp`；venv 104MB。
- [x] 使用 new-api token 完成真实 DeepSeek spike；没有把平台 DeepSeek key交给 Hermes。

### S1. WORK 引擎:Hermes 经 /v1 接国产 Chat,无网关(Day 1–2)

- [x] 写 `$HERMES_HOME/.env` 并启用本地 bearer API server:
  ```
  API_SERVER_ENABLED=true
  API_SERVER_KEY=<随机本地 token>
  API_SERVER_HOST=127.0.0.1
  API_SERVER_PORT=8642
  ```
- [x] 写 `$HERMES_HOME/config.yaml` 使用**命名 provider**，真实 spike 走 `custom:newapi`，未 fallback OpenRouter:
  ```yaml
  providers:
    newapi:
      base_url: <new-api base_url>/v1
      api_key: <new-api token>
      default_model: deepseek-chat
  model:
    provider: custom:newapi
    api_mode: chat_completions
    default_headers:        # 防 WAF/中转拦 SDK 默认头(#40403)
      User-Agent: blackrain/0.x
  ```
- [x] `HERMES_HOME=... hermes gateway` 启动成功并完成就绪探测。（2026-06-26）
- [x] 就绪探测:`curl -H "Authorization: Bearer $KEY" 127.0.0.1:8642/health` → `{"status":"ok"}`;`/v1/capabilities` 确认 chat/stream/responses 全 true ✅(2026-06-26)
- [x] 冒烟:`POST /v1/chat/completions` → **真打到 new-api→DeepSeek、回复正常**,未 fallback OpenRouter ✅(2026-06-26)
- [x] **流式**(#21522/#25723):streaming 收 12 连续 SSE 帧、不断 ✅;function calling 消息穿中转不丢(多轮 4 笔计量为证)✅(2026-06-26)
- [x] new-api 计量:单轮 1 笔 / 多轮 4 笔,quota 计到 ✅(2026-06-26)
- 注:本轮直接走 new-api(非两段式 deepseek-direct 先行),一步到位验通。真实 DeepSeek key 只在 new-api 渠道,Hermes 只拿 new-api 中转 token。
- 实测踩坑已记 verification:① API server 真实依赖是 **aiohttp** 非 fastapi(单装 aiohttp);② new-api token 列表 API 掩码成 18 位,完整 48 位 key 要从 DB 读;③ 建渠道/token 需嵌套 `{mode,channel:{...}}` 结构 + 尾斜杠。

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

### S4b. office 场景质量基线（当前 P0）

- [ ] 定稿 5 个「聊天类产品结构性做不了」的核心 office 场景及成功判据。
- [ ] 在 Windows 实机每个场景运行 10 次，记录失败步骤、人工接管点、token 和时长。
- [ ] 达到每场景 ≥8/10 无人工干预完成；未达到时先调优 Hermes prompt/工具流，再决定是否重评 WORK 引擎。

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

### S5. MCP 动态激活验证（插件机制承重假设）

- [x] 源码确认 Hermes 原生支持 `tools/list_changed` 动态工具发现 + 自动重连 ✅(2026-06-26,`tools/mcp_tool.py`)
- [ ] 对话进行中,给活着的 Hermes 会话**动态新挂**一个测试 MCP server → 确认 agent 拿到新工具
- [ ] **拔掉** → 确认对话继续、工具消失
- [ ] 过关 = 全程不重启对话，证明插件工具可动态变化；不得据此宣称工作台生命周期完成

### S6. Windows 全栈(已收敛到 [.specs/007](../007-windows-client/))

> 2026-06-30 决策:MVP 仅发行 Windows 客户端,macOS 推迟 post-MVP。Windows 全栈验证矩阵(胖包构建/hermes gateway 起动/uvloop 降级/codex 二进制/工作台便携包)整体迁到 [.specs/007 windows-client](../007-windows-client/) 追踪,本 spec 不再列具体子项。

## 阶段 2：产品化

- [ ] 工作台/项目成为第一入口，进入工作台后由 Core 选择 WORK / CODE surface
  - [ ] 不再以 EngineSwitcher 作为默认首页主导航；如保留，只放高级/开发入口
  - [ ] 软件开发工作台进入 CODE surface，普通参考工作台进入 WORK surface
- [ ] 与 008 对齐激活接口：003 只提供执行引擎接缝，不自行发明第二套工作台安装状态
- [ ] 从 Hermes Desktop 借 MIT React 组件（skills/memory/provider 面板）进 Tauri 壳
- [ ] 评估 Hermes v2026.7.7.2 新增能力的集成价值：MOA（多模型协同）、agent self-verification、model routes 与增强的 `/v1` API Server（与工作台验证层和多模型路由天然对齐）
- [ ] new-api 差价计费跑通一套真实官方工作台；具体垂类由市场验证决定，不在本 spec 预设番茄小说
- [ ] 编排器：跨模式子任务切分/回传逻辑 + 测试
- [ ] 统一 002/003 的生产 credit 路由：WORK/Hermes、CODE/Gateway、new-api、过渡 `proxy.py` 与 Plus BYOK；保持待决直到产品拍板。

## 阶段 3：收口

- [ ] computer-use MCP sidecar 接入（评 `trycua/cua`，两引擎共用）
- [ ] 外置 Skills 自进化雏形；公开专家市场另建 spec，不在本阶段顺手实现
- [ ] 更新文档和 spec（docs/03、docs/02 指针 + 本 spec）
- [ ] 跑完验证写入 `verification.md`
- [ ] 记录未解决风险
