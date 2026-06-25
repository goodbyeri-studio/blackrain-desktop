# Verification

> 说明：2026-06-26 已跑通 S1 第一段(WORK 引擎链路)的真实 spike——Hermes 经 new-api 接 DeepSeek、计量、流式、工具调用穿过中转,全部实测通过(环境:macOS/darwin)。Windows 验证、CODE 引擎(S2)、外置记忆(S3)、跨模式(S4)、MCP 热拔插(S5)仍待跑。早先的调研结论来自一手来源,已在 `decisions.md` 标注 URL。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-25 | Hermes License | 读仓库 `LICENSE` 逐字 | 通过 | 标准 MIT，版权 Nous Research 2025，无附加条款 |
| 2026-06-25 | Hermes 默认协议 | 读官方 docs `integrations/providers.md` | 通过 | 非 GPT-5+ 一律 Chat Completions；国产模型一等公民 |
| 2026-06-25 | Hermes 桌面端形态 | 读 `apps/desktop/` + docs | 通过 | 官方 Electron+React+Vite，MIT，可远程 `/v1` 后端 |
| 2026-06-25 | Hermes codex 集成缺陷 | 读 issue #5879/#7806/#41905 | 通过 | 三处确认坑，见 design 兼容表 |
| 2026-06-25 | 中转站 Responses 支持 | 查 new-api releases | 通过(间接) | 计量锁 Chat，Responses 基本空白；codex 路径仍需网关 |
| 2026-06-26 | WORK 接 DeepSeek 无网关 | spike: Hermes `/v1/chat/completions` → new-api → DeepSeek | **通过** | 返回真实回复;命名 custom provider 显式 base_url,未 fallback OpenRouter(#14676 规避确认) |
| 2026-06-26 | new-api 计量(利润发动机) | spike: 查 new-api 用量日志 | **通过** | 单轮记 1 笔(prompt9/compl1/quota1);多轮 agent loop 记 4 笔 |
| 2026-06-26 | Hermes 流式 SSE | spike: stream=true | **通过** | 收 12 个连续 data 帧,#21522/#25723 流式坑未现 |
| 2026-06-26 | function calling 穿中转不丢 | spike: agent 工具调用任务 | **通过** | 工具调用消息完整往返穿过 new-api(4 笔计量为证);注:危险工具 execute_code 被 Hermes 审批门拦,需 `/v1/runs` 走审批(非中转层问题) |
| 2026-06-26 | Hermes venv 实测体量 | spike: `uv sync` + `du -sh` | **通过** | venv(核心+web/cli/mcp+aiohttp)104MB;CPython~55MB;无 torch/whisper 重物 |
| 2026-06-26 | API server 真实依赖 | spike: 起 gateway 报错 | **通过** | 用 **aiohttp**(非 fastapi);单装 aiohttp(Apache-2.0)即可,不装 messaging extra |
| 2026-06-26 | MCP 动态工具发现 | 读源码 `tools/mcp_tool.py` | **通过** | 原生支持 `tools/list_changed` + 自动重连;已挂工作台中途变工具 ✅ |
| YYYY-MM-DD | CODE codex app-server | `.scratch/m0_*.py` 探针 | 未跑 | S2 |
| YYYY-MM-DD | 两引擎共读外置记忆 | spike | 未跑 | S3 |
| YYYY-MM-DD | 跨模式端到端 | 人工 | 未跑 | S4 过关判据 |
| YYYY-MM-DD | MCP 热拔插(中途新挂/拔整个 server) | spike | 未跑 | S5,热拔插模型承重假设 |
| YYYY-MM-DD | Windows 全栈打包/运行 | spike | 未跑 | 受众大头,Mac 已验、Win 未验 |
| 2026-06-25 | Hermes 遥测/数据飞轮 | 读 `agent/trajectory.py` + 仓库搜遥测关键词 | 通过 | trajectory 纯本地落盘无外传;无内建遥测框架;cua 遥测默认关 |
| 2026-06-25 | Hermes 依赖许可证 | 读 `pyproject.toml` + PyPI license 字段 | 通过 | 核心全宽松系;LGPL 仅在可选 extra(不装即规避) |
| 2026-06-25 | Hermes 进程/纳管模型 | 读官方 docs(api-server/profiles/installation) | 通过 | `hermes gateway`+`API_SERVER_ENABLED`;`HERMES_HOME`=CODEX_HOME 孪生;8642/Bearer/`/health` |

## 已验证

- Hermes 本体 MIT，可闭源商用（一手 LICENSE）。
- Hermes 默认 Chat Completions，接国产模型设计上零翻译。
- Hermes 自带 codex 集成有结构性缺陷，不可直接复用。
- 中转站成熟计量在 Chat，codex 的 Responses 路径仍须网关翻译。
- **遥测闸口过**:trajectory 纯本地落盘(`agent/trajectory.py` 仅 append 写文件,无 `requests.post`);无内建遥测框架;唯一外传点 cua-driver 遥测 Hermes 已默认注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0` 关闭。
- **依赖闸口过**:核心依赖全宽松系(MIT/Apache/BSD);传染性 LGPL(`python-telegram-bot`/`edge-tts`)全在可选 extra,不装即规避;`certifi`/`pathspec` 为 MPL-2.0 文件级弱 copyleft,未修改分发合规。
- **纳管模型确认**:API server 寄生于 `hermes gateway`(`API_SERVER_ENABLED=true`),`127.0.0.1:8642`,Bearer(`API_SERVER_KEY` 强制必填);`HERMES_HOME` = `CODEX_HOME` 孪生,可指自定义目录;就绪探 `/health`+`/v1/capabilities`;对话用 `/v1/runs`(SSE);监工 spawn 前台进程 + SIGTERM 关。
- **WORK 引擎链路实测通(2026-06-26)**:Hermes 经 new-api 接 DeepSeek 跑通(无网关);new-api 计量每笔(单轮1笔/多轮4笔);流式 12 帧连续;工具调用穿中转不丢。命名 custom provider 显式 base_url 未 fallback OpenRouter。
- **交付体量实测(2026-06-26)**:venv 104MB + CPython ~55MB,无重物;v1 基础包 ~250MB 可达。API server 真实依赖是 aiohttp(单装合规)非 fastapi。
- **MCP 动态工具发现**:源码确认 Hermes 原生支持 `tools/list_changed` + 自动重连(热拔插模型的工具级一半已成立)。

## 未验证风险

- `hindsight-client` 包 PyPI **无 license 声明**——纳入闭源分发前必须人工核实,或排除该 extra。
- Nous Portal ToS 训练/留存条款——默认不接 Portal、只用客户自己 key 则消失。
- **MCP 热拔插**:对话中途**新挂/拔掉整个 MCP server** 仍需 spike 实测(S5)——工具级动态发现已确认,整 server 增删未测。这是工作台热拔插模型的承重假设。
- **Windows 全栈**:Mac 已验,Windows(受众大头)的打包/运行未验;uvloop 在 Win 不可用(自动降级,需确认无副作用)。
- **CODE 引擎(S2)**:codex app-server + 专属 CODEX_HOME 本轮未跑(沿用既有链路,待 spike 复验)。
- **new-api 单点**:利润发动机命脉单点,需 HA/容灾方案(上线前)。
- 危险工具(execute_code 等)需走 `/v1/runs` 审批通道,无状态 `/v1/chat/completions` 会被审批门拦——这是 S4 跨模式真干活要解决的。
- 跨模式编排子任务切分在长任务下是否稳定不丢上下文(S4)。
- **v2 悬崖**:开放创作者工作台需补「本地沙盒 + 审核」整层,v1 便携包模型延伸不到,届时是一次重架构。

## 失败记录

- 暂无（已跑通的部分无失败;execute_code 被审批门拦属预期安全行为,非失败）。
