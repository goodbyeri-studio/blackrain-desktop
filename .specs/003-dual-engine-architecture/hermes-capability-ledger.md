# Hermes 能力底账(WORK 引擎)

> 本文是 WORK 模式引擎(NousResearch Hermes Agent)的**功能事实底账**,供 [003 双引擎架构](design.md) 设计「白嫖 vs 自建」边界用。
> 全部结论基于**本地源码逐文件核查**(非官方文档措辞),钉死调研时的上游 commit `a6a28ce`(`hermes-upstream/`,MIT)。升级 Hermes 版本时须重核。
> ⚠️ **2026-07-03 当前仓库锁定已更新到 Hermes v2026.7.1 (`7c1a029`)**(见 `docs/REFERENCES.md`)。本底账还没有按 v2026.7.1 逐文件重核;只能作为旧基线 + 选型依据使用,不要把正文当作当前版本的完整能力清单。
> 标记:✅ 开箱即用(默认开、零依赖) · ○ 需开启/装依赖/API key · 🔌 平台或账号专用 · ⭐ 直接复用金矿 · ⚠️ 必须避开。

## 范围与口径

- 「agent 能直接调用的工具」判定默认启用看两层:① 是否在核心工具清单 `_HERMES_CORE_TOOLS`(`tools/toolsets.py`);② `check_fn()` 是否返回 True(缺依赖即从模型可见列表剔除)。
- `_DEFAULT_OFF_TOOLSETS = {moa, homeassistant, spotify, discord, discord_admin, video, video_gen, x_search}` 即便注册也需 opt-in。
- 工具总数约 70+;引擎内建系统级能力约 20 项;开箱内置 skill ~70+、plugin 19 家族(下含 100+ 子条目)。

---

## 一、agent 能直接调用的工具(WORK 模式的「手」)

### 1. 文件与本地操作 ✅ 全默认开、零依赖
| 工具 | 能力 | 默认 |
|---|---|---|
| `read_file` | 带行号分页读文本,自动抽 .ipynb/.docx/.xlsx 为文本 | ✅ |
| `write_file` | 整文件写 + 语法检查 + 敏感路径 deny-list | ✅ |
| `patch` | 模糊 find-replace / V4A 多文件补丁 | ✅ |
| `search_files` | ripgrep 搜内容 / glob 找文件 | ✅ |
| `terminal` | 执行 shell(前台/后台/PTY/sudo),local 后端零依赖,危险命令走审批门 | ✅ |
| `read_terminal` | 读桌面 GUI 内嵌终端面板 | ○ 仅 `HERMES_DESKTOP` |
| `execute_code` | 写 Python 脚本经 RPC 批量调工具(PTC) | ○ 开发者向 |

### 2. 联网与信息获取 ✅ 默认可用(免 key 兜底)
| 工具 | 能力 | 默认 |
|---|---|---|
| `web_search` | 联网搜索;ddgs/brave-free/searxng 免 key 兜底,商用质量需 Exa/Tavily key | ✅ |
| `web_extract` | 网页/PDF 抓取转 markdown(≤5 URL,大页自动摘要) | ✅ |
| `vision_analyze` | 载入图片让模型「看见」并答问(无原生多模态时走辅助模型转文字) | ✅ |

### 3. 记忆与历史 ✅ 默认开、零依赖(小白直接有用)
| 工具 | 能力 | 默认 |
|---|---|---|
| `memory` | 跨会话持久记忆(add/replace/remove);⚠️ 引擎层 `memory_enabled` 默认关,需 config 开 | ✅(工具)|
| `session_search` | 本地 SQLite FTS5 全文检索过往所有会话,零 LLM 成本 | ✅ |

### 4. 技能(可自进化)✅ 默认开
| 工具 | 能力 | 默认 |
|---|---|---|
| `skills_list` / `skill_view` | 列技能 / 载入某技能全文及附件 | ✅ |
| `skill_manage` | agent 自己增删改技能(create/patch/edit/delete),写进 `~/.hermes/skills/` | ✅ |

### 5. 多 agent 委派 ✅ 默认开、零依赖(「公司/OPC」原语)
| 工具 | 能力 | 默认 |
|---|---|---|
| `delegate_task` | spawn 隔离子 agent,并行(默认并发 3)+ 后台异步 + orchestrator/leaf 角色 | ✅ ⭐ |
| `mixture_of_agents` | 多模型提议→聚合推理 | ○ 需 OpenRouter key |
| `kanban_*`(9) | 看板式多 agent 任务编排 | ○ 仅编排模式 |

### 6. 任务与交互 ✅ 默认开、零依赖(小白友好)
| 工具 | 能力 | 默认 |
|---|---|---|
| `todo` | 会话任务清单(pending/in_progress/completed/cancelled) | ✅ |
| `clarify` | 向用户提问/多选(≤4 选项 + Other)——「带护栏给选项」的现成原语 | ✅ ⭐ |
| `cronjob` | 定时任务(`30m`/`every 2h`/cron 表达式/一次性),JSON 文件式内部调度 | ✅ |

### 7. 媒体生成与语音 ○ 多数需后端
| 工具 | 能力 | 默认 |
|---|---|---|
| `text_to_speech` | 文本转语音,Edge TTS 免费兜底 | ✅ |
| `image_generate` | 文生图/图生图(在核心列表,但需 FAL 等后端 key) | ○ |
| `video_generate` / `video_analyze` | 文生/图生视频、视频理解 | ○ opt-in |

### 8. 浏览器自动化 ○ 需 agent-browser CLI + Chromium
`browser_navigate / snapshot / click / type / scroll / back / press / get_images / vision / console`(10)+ `browser_cdp` / `browser_dialog`(需 CDP 端点)。填表/抓数/后台网页操作整套。

### 9. 电脑操控 computer-use ○ 需 cua-driver(相对 codex-rs 的差异点)
`computer_use` 单工具多动作:截图/点击/拖拽/键入/设控件值/切 app。后台操控不抢用户焦点,Windows 路径比 macOS 稳。变更类动作走审批(API 路径审批线需自接)。

### 10. 外部平台/账号 🔌 全部需配置,多数开发者向
- 国内:`feishu_doc_read`+`feishu_drive_*`(4,需 lark_oapi)、`yb_*`(5,元宝群,平台会话专用)
- 海外:`discord`/`discord_admin`、`x_search`(xAI)、`spotify_*`(7)
- 智能家居:`ha_*`(4,需 HASS_TOKEN)
- MCP:每连一个 server 动态注册其业务工具 + `mcp_<server>_list/read_resource`、`list/get_prompt`(4)

## 二、agent 引擎内建的系统级能力(WORK 模式的「脑」)

不是工具,是引擎自动运转的底层能力——小白无感,但决定产品成败。

| 能力 | 机制 | 默认 | 对 2049 |
|---|---|---|---|
| `conversation_loop` | 主回合编排心脏(模型调用→工具→重试→fallback→压缩→后台复盘) | 自动 | 引擎核心 |
| 上下文压缩 `context_compressor` | aux 模型 summarize 中段,阈值默认 0.50 自动触发,长对话不崩 | 自动 | ⭐隐形刚需 |
| `context_references` | `@file/@url/@git` 自动展开注入(25% 警告/50% 拒绝,拉黑敏感文件) | 打 @ 触发 | 红利,语法极客需 GUI 翻译成拖拽 |
| `usage_pricing` | provider 无关本地计价 + session 成本累计 + insights 报表 | 自动 | ⭐⭐ token 差价闭环的现成计量发动机,灌国产价目即用 |
| `auxiliary_client` | 所有 side-task 的多 provider 路由 + 7 级 fallback + 额度耗尽自动换 | 自动 | ⭐多模型路由直接复用 |
| `models_dev` | 4000+ 模型元数据(上下文窗/价格/能力),离线优先 | 自动 | 模型广场元数据现成 |
| `image_routing` | 入站图片 native vs text 路由(国产模型无多模态时转文字) | 自动 | 红利 |
| `iteration_budget` | 父 90 / 子 50 迭代护栏,防失控烧钱 | 自动 | 防烧钱护栏 |
| `error_classifier` | API 错误→恢复动作(重试/换凭证/换 provider/压缩) | 自动 | 隐形稳定性 |
| `oneshot` | 无状态单次 LLM(不污染会话/cache),给改名/摘要等小功能 | 按需 | UI 小功能基建 |
| `onboarding` | 一次性首触引导 + opt-in 建用户画像 | 默认 ask | 小白首跑引导现成 |
| 记忆快照 MEMORY/USER.md | 冻结快照注入,**会话内冻结、下会话刷新**,字符上限 | 默认关 | 红利,「会话内冻结」需 UI 解释 |
| 后台学习 `background_review`+`curator`+`/learn` | 从经验自动沉淀 skill/memory;curator 7 天周期只归档不删 | skill复盘默认跑/memory需开 | 红利但烧 token,建议默认关 memory 复盘 |
| `codex_runtime` | Hermes 自带把 codex 当 provider(子进程或 Responses HTTP) | 按 api_mode | ⚠️ **必须绕开**:接国产模型务必落 `chat_completions`,别触发 codex_responses 自动升级 |

## 三、开箱自带的内容包(WORK 模式的「现成活儿」)

- **内置 skill(~70+,装好即用),办公强相关**:`powerpoint`、`ocr-and-documents`、`nano-pdf`、`google-workspace`、`himalaya`(邮件)、`notion`、`obsidian`、`airtable`、`baoyu-infographic`(中文信息图)、`humanizer`、`youtube-content`、`maps`、`xurl`。
- **可选 skill(需 `hermes skills install`),办公金矿**:整套 `finance`(`excel-author` 可审计 Excel / DCF / 三表 / comps / LBO / merger / `pptx-author` / 股票)——B2B 含金量最高;`one-three-one-rule`(汇报结构法)、`qmd`(本地知识检索)、免 key 搜索。
- **plugin(19 家族,均需配置激活;仅 disk-cleanup + 上下文压缩器默认自动跑)**:`model-providers`(26,已内置 deepseek/zai-GLM/alibaba-Qwen/kimi/minimax/stepfun 国产档案)、`platforms`(21,含 dingtalk/feishu/wecom)、`web`(8 搜索后端)、`memory`(8,含本地 holographic SQLite+FTS5)。

## 四、必须记住的坑/边界(均源码确证)

1. **`send_message` 故意不是 agent 工具**——agent 不能自主跨平台发消息(只走 cron/CLI/kanban)。对「危险操作」是天然约束。
2. **agent 不能自管 MCP server**——`mcp_tool.py` 只让 agent 调已连 server 的工具,增删 server 走 config/CLI。
3. **国产模型档案已内置**,但接入务必落 `chat_completions`,别让 GPT-5.x 名/OpenAI URL 触发 `codex_responses` 自动升级。
4. **`memory` 引擎层默认关**;后台学习每 ~10 回合 fork 子 agent 烧 token,与 token 闭环成本冲突,建议默认关 memory 复盘。
5. yuanbao 工具注册 toolset 名 `hermes-yuanbao` 与 toolsets.py 键 `yuanbao` 不一致(小 bug,接入注意)。

## 关键源码路径(备查)

- 工具注册:`tools/registry.py`、`tools/toolsets.py`(`_HERMES_CORE_TOOLS` / `_DEFAULT_OFF_TOOLSETS`)
- 文件/终端:`tools/file_tools.py`、`terminal_tool.py`、`code_execution_tool.py`
- 委派/记忆/技能:`tools/delegate_tool.py`、`memory_tool.py`、`session_search_tool.py`、`skill_manager_tool.py`
- 引擎核心:`agent/conversation_loop.py`、`context_compressor.py`、`usage_pricing.py`、`auxiliary_client.py`、`codex_runtime.py`、`agent_init.py`
- 安全:`tools/approval.py`、`terminal_tool.py`(默认 `local` 后端)、`tools/computer_use/tool.py`(审批回调缺口)
