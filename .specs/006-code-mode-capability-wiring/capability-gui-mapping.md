# 能力 → GUI 落点映射表(像素级复刻用)

> 用途:#3 已把 42 个 codex-rs ClientRequest 全 5 层接入、后端面暴露完毕。本表给**像素级复刻 GUI** 时用——每个能力对应:① `tauri.ts` 函数名(直接调用)→ ② 该落到哪个 feature 模块 / GUI 表面 → ③ 建议承载组件/交互。
> 口径:后端已就绪,前端「调得通」靠 `@services/tauri.ts` 的导出函数;本表只指「放哪、怎么触发」,不替你定视觉。
> 基线:main `73b22849`(含 #50/#51/#52),内核 `bdd282f`。当前仓库锁定已更新到 `da4c8ca`;本文是 GUI 映射旧基线,下一轮 CODE GUI 收尾前需重跑能力探针并刷新。

## 阅读约定

- **fn**:`src/services/tauri.ts` 的导出函数(已就绪,直接 import 调)。
- **模块**:`src/features/<module>/`,建议把 UI/hook 放这。
- **落点**:codex-app 里该能力通常出现的位置(供复刻对齐)。
- ⚠️:已知非缺陷约束(见 verification.md),复刻时要在 UI 上体现降级/提示。

---

## 一、会话管理(Thread)→ 模块 `threads`

落点:左侧会话列表(Sidebar)的行右键菜单 / 悬停操作 + 会话顶部工具条。

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| 删除会话 | `deleteThread` | Sidebar 会话行右键「删除」(区别于已有「归档」`archiveThread`);删后监听 `thread/deleted` 通知自动移除行 |
| 取消归档 | `threadUnarchive` | 归档列表里的会话行「恢复」 |
| 会话搜索 | `threadSearch` | Sidebar 顶部搜索框(全文检索过往会话) |
| 列已加载会话 | `threadLoadedList` | 内部分页/刷新,一般非直接按钮 |
| 列会话内 item | `threadItemsList` | 会话历史浏览/跳转。⚠️ `bdd282f` 内核回「not supported yet」——UI 先留入口、灰显或捕获该错给占位,待内核 bump 点亮 |
| 会话目标-读/设/清 | `threadGoalGet` / `threadGoalSet` / `threadGoalClear` | 会话顶部「目标(Goal)」面板:显示当前目标 + 编辑(set 走 Value 透传,前端构造 `{threadId,objective,status,tokenBudget?}`)+ 清除 |
| 记忆模式开关 | `threadMemoryModeSet` | 会话设置里「记忆:开/关」切换(mode = `enabled`/`disabled`) |
| 会话设置更新 | `threadSettingsUpdate` | 会话顶部「模型/审批/沙箱/推理档…」设置面板(Value 透传,前端只放要改的字段) |
| 会话元数据更新 | `threadMetadataUpdate` | git 信息更新,多为内部触发(Value 透传,需含至少一个 gitInfo 字段) |
| 后台终端-列/终止/清 | `threadBackgroundTerminalsList` / `threadBackgroundTerminalsTerminate` / `threadBackgroundTerminalsClean` | 会话内「后台进程」抽屉:列出 agent 起的后台终端 + 单个终止(需 processId)+ 清理 |
| shell 命令 | `threadShellCommand` | 会话内直接跑 shell(进阶/调试入口) |
| 批准 Guardian 拒绝动作 | `threadApproveGuardianDeniedAction` | 收到 `guardianWarning` 通知时弹审批,用户「批准」回传**原始 event 对象**(Value 透传,event 来自通知本身) |

<!-- APPEND -->

## 二、技能 / 插件 / 市场(决策 #3 头号目标)→ 模块 `skills`、`apps`、新建 `plugins` UI

落点:codex-app 的 `$` 提及补全已有(`skills`/`apps` hook 在),缺的是**管理界面**——建议新建一个「扩展管理」设置区或独立面板。

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| 技能配置写(启/禁) | `skillsConfigWrite` | 技能管理列表每行「启用/禁用」开关(enabled + path 或 name 定位) |
| 技能额外根目录 | `skillsExtraRootsSet` | 设置里「技能搜索路径」编辑器(传 extraRoots 字符串数组) |
| hooks 列表 | `hooksList` | 「生命周期 hooks」只读列表(传 cwds 数组) |
| 插件列表(可装) | `pluginList` | 插件市场「可安装」标签页 |
| 已装插件 | `pluginInstalled` | 插件市场「已安装」标签页 |
| 插件详情 | `pluginRead` | 点插件卡片看详情(需 pluginName + marketplacePath 或 remoteMarketplaceName 二选一,否则语义报错) |
| 安装/卸载插件 | `pluginInstall` / `pluginUninstall` | 插件卡片「安装」/「卸载」按钮。⚠️ 远程目录的卸载/读取需 OpenAI auth;**本地插件正常** |
| 读插件内技能 | `pluginSkillRead` | 插件详情里预览其技能。⚠️ 远程目录需 OpenAI auth |
| 市场-增/删/升级 | `marketplaceAdd` / `marketplaceRemove` / `marketplaceUpgrade` | 「插件市场源」管理:添加源(source = owner/repo 或 git URL 或本地路径,格式错会语义报错)/ 移除 / 升级 |

## 三、模型 / 实验 / 权限 → 模块 `models`、`settings`

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| provider 能力探测 | `modelProviderCapabilitiesRead` | 模型选择器/模型广场:探测当前 provider 是否支持 web_search/image_generation/namespace_tools,据此显隐相关 UI |
| 实验特性开关-设置 | `experimentalFeatureEnablementSet` | `SettingsFeaturesSection` 里每个 feature 的开关(已有 `getExperimentalFeatureList` 读;本 fn 是写,传 `{featureName: bool}` map) |
| 权限档列表 | `permissionProfileList` | 会话设置/沙箱设置里「权限档」下拉数据源 |
| 账号登出 | `accountLogout` | `SettingsAccountSection` 的「登出」按钮(codex 账号侧;与 BlackRain 自己的 `accountSession*` 区分) |

## 四、MCP 深度 → 模块 `apps`(MCP server 已在此)/ 新建 MCP 管理

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| MCP OAuth 登录 | `mcpServerOauthLogin` | MCP server 列表里需鉴权的 server「登录」按钮(name 必填;scopes/timeoutSecs 可选) |
| 读 MCP 资源 | `mcpResourceRead` | MCP server 详情里浏览其 resources(server + uri) |
| 调 MCP 工具 | `mcpServerToolCall` | 进阶:直接调某 MCP server 的工具(threadId + server + tool + arguments)。⚠️ server 名错会语义报错 |

## 五、Windows 沙箱(MVP 仅 Windows,必接)→ 模块 `settings` 或首启向导

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| 沙箱 setup 启动 | `windowsSandboxSetupStart` | Windows 上首次需要沙箱时的「安装/启用沙箱」向导按钮(mode = `elevated`/`unelevated`) |
| 沙箱就绪查询 | `windowsSandboxReadiness` | 启动时/设置里查询沙箱是否就绪,据此显示状态徽标 |

## 六、外部迁移(获客钩子)→ 模块 `settings` 或首启「从其他工具导入」

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| 检测外部 agent 配置 | `externalAgentConfigDetect` | 首启/设置「从 Claude 等导入」:扫描可迁移项(includeHome + cwds) |
| 读外部历史会话 | `externalAgentConfigImportHistoriesRead` | 导入向导里预览可迁移的历史会话 |
| 执行导入 | `externalAgentConfigImport` | 「导入」确认按钮(Value 透传,前端构造 `{migrationItems:[…], source?}`) |

## 七、环境信息 → 模块 `settings/environments`

| 能力 | fn | 落点 / 交互 |
|---|---|---|
| 读执行环境信息 | `environmentInfo` | `SettingsEnvironmentsSection` 里展示某环境的 shell 信息(需 environmentId;远程环境编排 v1 不做) |

---

## 复刻优先级建议(配合产品形态)

1. **会话管理(一)** 最高频、最贴 codex-app 原貌,优先复刻(删除/搜索/目标/设置)。
2. **技能/插件/市场(二)** 是决策 #3 的头号目标(补 codex-app 的扩展管理界面),第二优先。
3. **MCP 深度(四)、外部迁移(六)** 是进阶/获客,可后置。
4. **Windows 沙箱(五)** 跟 MVP 仅 Windows 节奏做。
5. ⚠️ 三处「已知非缺陷」务必在 UI 上体现:`threadItemsList` 内核 stub 要捕获报错给占位;远程插件/MCP 需 OpenAI auth 的,本地可用、远程要提示登录。

## 关联

- 后端接入与验证:本目录 `requirements.md` / `design.md` / `verification.md`
- 调用函数全在 `apps/desktop/src/services/tauri.ts`
- CODE 模式边界与复刻上限:[../003-dual-engine-architecture/code-mode-boundary.md](../003-dual-engine-architecture/code-mode-boundary.md)
