# Verification

> 说明：本 spec 当前为**选型决策 + 调研结论**阶段，架构尚未实现，下表多数为「未跑」。调研结论来自一手来源（Hermes 仓库文件 / 官方 docs / GitHub issues），已在 `decisions.md` 标注 URL。代码验证待阶段 1 Spike。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-25 | Hermes License | 读仓库 `LICENSE` 逐字 | 通过 | 标准 MIT，版权 Nous Research 2025，无附加条款 |
| 2026-06-25 | Hermes 默认协议 | 读官方 docs `integrations/providers.md` | 通过 | 非 GPT-5+ 一律 Chat Completions；国产模型一等公民 |
| 2026-06-25 | Hermes 桌面端形态 | 读 `apps/desktop/` + docs | 通过 | 官方 Electron+React+Vite，MIT，可远程 `/v1` 后端 |
| 2026-06-25 | Hermes codex 集成缺陷 | 读 issue #5879/#7806/#41905 | 通过 | 三处确认坑，见 design 兼容表 |
| 2026-06-25 | 中转站 Responses 支持 | 查 new-api releases | 通过(间接) | 计量锁 Chat，Responses 基本空白；codex 路径仍需网关 |
| YYYY-MM-DD | WORK 接 GLM 无网关 | spike | 未跑 | 阶段 1 |
| YYYY-MM-DD | CODE codex app-server | `.scratch/m0_*.py` 探针 | 未跑 | 阶段 1 |
| YYYY-MM-DD | 两引擎共读外置记忆 | spike | 未跑 | 阶段 1 |
| YYYY-MM-DD | 跨模式端到端 | 人工 | 未跑 | 阶段 1 过关判据 |
| YYYY-MM-DD | Hermes 流式 + function calling | spike | 未跑 | 防 #21522/#25723 |
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

## 未验证风险

- `hindsight-client` 包 PyPI **无 license 声明**——纳入闭源分发前必须人工核实,或排除该 extra。
- Nous Portal ToS 是否声明「经 Portal 对话用于训练/留存」——默认不接 Portal、只用客户自己 key 则此风险消失。
- **交付模型未定**:Hermes 非单二进制(Python3.11+Node22+uv+ffmpeg),与单安装包交付冲突,四方案待拍(见 decisions)。
- API server 是否需 `web` extra(FastAPI/Uvicorn)文档有矛盾证据,需实测(报缺则补装)。
- 国产模型接 Hermes 的真实跑通（目前仅官方声称）。
- WORK 接中转的流式/function calling 在真实链路是否完整。
- 跨模式编排子任务切分在长任务下是否稳定不丢上下文。

## 失败记录

- 暂无（尚未进入实现）。
