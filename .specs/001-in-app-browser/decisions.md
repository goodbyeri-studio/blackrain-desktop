# 内置浏览器决策

## 2026-07-31：只保留一个当前 spec

- 决策：删除旧 001-013 业务 spec，当前树只保留 `001-in-app-browser`。
- 原因：旧 spec 同时混合历史路线、已完成任务、暂停产品和重复 Browser/Electron 清单，无法表达当前优先级。
- 历史：被删除内容仍保存在 Git，不建立 archive spec 目录。
- 后续：Browser P0 完成后，再按新的产品优先级替换当前 spec；不预建并列 backlog spec。

## 2026-07-31：内置浏览器是唯一当前 P0

- 决策：Electron/App Server/Windows 工作只有在直接服务 Browser 交付时进入本 spec。
- 后续：项目、Git、终端、设置和完整 Tauri 删除不属于当前 P0。

## 2026-07-29：Electron main 直连原装 app-server

- 决策：Electron main 直接启动 bundled `codex.exe app-server`，目标态不保留 BlackRain daemon 中间层。
- 边界：thread、turn、审批、工具路由和 ThreadStore 留在原装 `codex-rs`。

## 2026-07-27：页面由 main-owned WebContentsView 承载

- 决策：main 创建并持有 `WebContentsView`、page WebContents、session、registry、下载和 CDP。
- 与基线的差异：调研确认当前 Codex App 使用 renderer 创建、main 接管的 `<webview>`；BlackRain 不复制该闭源宿主实现，主动选择标准 Electron `WebContentsView`。
- 原因：页面所有权、权限、销毁、跨窗口 reparent 和 CDP 生命周期集中在 main，renderer 不获得 guest attachment 能力。
- 替代方案：renderer `<webview>` 被拒绝，因为它扩大 renderer 宿主面并建立另一套 attachment/generation 合同；旁路 Playwright/headless browser 违反同页合同。
- 代价：必须自行验证 native view 的 bounds、z-order、遮挡、焦点、输入法和恢复。
- 复查：若标准 Electron 无法满足 hidden capture、可靠遮挡、输入或最低恢复合同，必须重新评估宿主原语并更新本决策，不能静默宣称与 Codex 等价。

## 2026-07-27：agent 与用户共享同一页面

- 决策：禁止建立旁路 Playwright/headless browser；高层工具与用户 UI 落到同一 registry 和 WebContents。

## 2026-07-27：P0 使用单一 App 持久 profile

- 决策：使用 `persist:blackrain-browser-app` 保持跨 thread/App restart 登录态。
- 风险：持久登录放大网页 prompt injection 风险，必须以 ownership、敏感动作确认和活动可见性缓解。
- 数据边界：Cookie、Local Storage、认证 token 和密码不自动进入模型；显式 snapshot/截图中的用户可见内容可能进入模型，UI 必须显示来源和控制方。

## 2026-07-31：自有 Browser client 是唯一生产目标

- 状态：有前置可行性闸口的目标决策，不是已验证事实。
- 决策：dynamic tools 只作 bootstrap；自有 client 只能通过公开、可分发的 runtime 接缝和鉴权 transport 接入同一 Browser backend。
- 原因：生产工具链仍由原装 app-server/code-mode 路由，并与 Codex session/turn 生命周期绑定；不把 Browser 工具执行重新放回 renderer 或第二 agent runtime。
- 替代方案：OpenAI 私有 bundled plugin/nativePipe 永久禁止；dynamic tools 作为永久生产入口当前被拒绝，但其 bootstrap 在切换完成前保留。
- 闸口：必须先在锁定的发布 runtime 上证明公开加载、工具调用、取消、turn 结束和打包分发。闸口失败时，P0 标记阻塞并同步重开 AGENTS、产品真源和本决策，不得用私有实现补洞。

## 2026-07-31：锁定 runtime 的公开加载闸口失败，生产 adapter 重开

- 状态：已由下一节的标准 stdio MCP 决策解除；本节保留为 code-mode V8 直载方案的失败证据。
- 证据：Windows x64 锁定 `codex-cli 0.146.0` / commit `e363b08c9175ac1cbe5893615dd2cb9ddf95043b` 的 code-mode protocol v1 实制品探针通过 JavaScript 执行、长任务取消和 cell 清理；`process`/`require` 均为 `undefined`，`import('node:net')` 与文件 URL import 均返回 `unsupported import in exec`。
- 结论：公开 `--code-mode-host` 是 V8 code-mode session host 选择接缝，不是 Node client/module loader；当前 `browser-client.mjs` 无法由该接缝加载。Electron main 内自加载 client 只验证自有 transport，不满足生产闸口。
- 当时状态：P0-B1 曾因此重开；后续标准 stdio MCP 决策已完成唯一 adapter 切换。code-mode V8 仍不得被重新解释为 Node loader。
- 仍禁止：复制或调用 OpenAI 私有 plugin/nativePipe、修改或分叉 `codex-rs`、引入第二 agent runtime，以及把 dynamic tools/main bridge 仅改名后当作生产方案。
- 当时待决方向：升级 runtime、另建受限执行宿主或修改 dynamic-tools 合同；现均由下一节的标准 stdio MCP 方案取代。

## 2026-07-31：标准 stdio MCP + 自有 Node adapter 是唯一生产工具链

- 决策：锁定 `codex-cli 0.146.0` 通过进程级 `-c mcp_servers.blackrain_browser.*` 注册 BlackRain 随包 Node stdio MCP server；adapter 加载自有 `browser-client.mjs` 并连接自有鉴权 transport。
- 运行时边界：code-mode V8 只编排 MCP 工具，不加载 Node/文件模块。独立 Node 进程是标准 MCP tool adapter，不是第二 agent runtime；agent loop、thread、turn、审批和停止仍由原装 codex-core 唯一持有。
- 可信路由：adapter 不接受模型参数中的 thread/turn。它要求 codex-core 注入的 `_meta.threadId`、`_meta["x-codex-turn-metadata"].session_id/thread_id/turn_id` 完整且一致，main transport 再校验已登记 thread、active turn、token 和 backend generation。
- 配置与状态：MCP 配置仅作为 app-server 进程参数注入，不修改共享 `config.toml`。0.146.0 MCP launcher 会清空子进程环境，因此只用公开 `env_vars` 名称白名单转发 bootstrap；secret 值不进入命令行。
- 制品：正式包携带并校验 Node.js 22 Windows x64、Node MIT License、Browser MCP adapter、Browser client 与 manifest；Electron `RunAsNode` fuse 保持关闭。
- 工具面：只暴露 tabs/navigation/snapshot/locator/action/screenshot/finalize 等窄类型工具，不提供通用 `js`/eval。
- 已拒绝：复制 OpenAI `node_repl.exe`、官方 Browser client、可信 hash capability、`nativePipe` 或私有 IAB RPC；把 dynamic tools 改名为永久生产入口；修改或分叉 `codex-rs`。
- 生产切换：Electron main 始终配置 MCP adapter，生产 `thread/start` 不提交 dynamic tools；旧 dynamic adapter 只保留测试和显式 bootstrap。
- 证据：bundled `0.146.0` 探针已完成 initialize、MCP ready/tool discovery、`mcpServer/tool/call`、可信 metadata 透传和 backend 命中；真实模型 turn、取消/超时/重连完整矩阵仍需单独验收。

## 2026-07-31：自有 transport 不兼容 OpenAI 私有 pipe

- 决策：BlackRain transport 是自有协议，不与 `codex-browser-use-*`、私有 `nativePipe` 或 Browser plugin 互操作。
- 线协议：随机 endpoint、256-bit capability token、4-byte little-endian 长度、UTF-8 JSON-RPC 和 8 MiB 单帧上限是 BlackRain 为实现简单、有界解析而选择的 v1 合同，不是 Codex 行为兼容要求。
- 安全边界：Windows 使用系统默认创建者 ACL并关闭 everyone 读写；握手 token、session/turn/generation 和 route ownership 拒绝无授权 client。跨 Windows 账户独立实证不属于 P0；该合同也不声称抵御可读取当前用户进程内存或环境的恶意代码。

## 2026-08-01：跨 Windows 账户实证不作为 Browser P0 闸口

- 决策：不要求为开发或发布 Browser P0 创建另一 Windows 用户账户，也不要求记录跨账户 named-pipe 拒绝证据。
- 保留控制：Node named pipe 使用系统默认创建者 ACL并显式设置 `readableAll:false`、`writableAll:false`；随机 endpoint、256-bit capability、session/turn/backend generation 和 route ownership 继续全部启用。
- 自动化闸口：必须覆盖无 token、错误 token、旧 token/generation、跨 session/turn、断连、取消和 deadline；这些测试不能因移除跨账户验收而降低。
- 升级条件：若未来产品威胁模型要求对跨账户攻击者提供独立证明，再引入测试账户矩阵或原生 ACL broker，并重新打开安全评审。

## 2026-07-31：标准 Electron 恢复采用明确降级合同

- 决策：P0 最低恢复为 tab/route 元数据、URL、可获得的 navigation entries 和持久 session 后 reload。
- 不承诺：未验证前不声称恢复 JS heap、未提交表单、滚动位置或 Codex 私有 Owl page snapshot。
- 复查：hidden capture、suspend/persist 和额外页面状态只有通过 Windows 资源与崩溃矩阵后才能升级为保证。

## 2026-07-31：敏感网页动作由宿主策略确认

- 决策：登录、授权、发送、发布、购买、删除及其他不可逆或高影响动作需要绑定 origin、动作类型和 TTL 的用户确认。
- 边界：网页内容、模型输出和 Browser client 都不能自行生成确认；Electron main 保存并消费一次性 grant，renderer 只显示决策 UI。

## 2026-08-01：审批 server request 使用 main-owned 一次性 broker

- 决策：生产 app-server 的命令、文件、权限审批和 `requestUserInput` 通过 Electron main 的有界事件流进入 renderer；renderer 只能经类型化 IPC 返回受限 decision/answers，不获得原始 stdio 或任意 RPC response 能力。
- 绑定：pending request 同时绑定原 RPC request id 和 workspace；错误 workspace、重复响应、取消、超时、进程退出和 runtime 重启全部 fail closed。
- 路由边界：`item/tool/call` 只允许显式 dynamic-tools 测试/bootstrap；发布态收到该 server request 直接拒绝，Browser 生产工具继续只走标准 stdio MCP。

## 2026-08-01：恢复状态使用可迁移的 v2 reload 合同

- 决策：Browser session state v2 保存 origin、claim、handoff/deliverable、导航条目/active index、restore policy 和固定 profile 引用；旧 v1 文件迁移为 user-owned 的 `reload` 安全默认值。
- 恢复：App restart 后复用持久 partition 和 tab id，提升 view generation 并 reload URL；旧 agent claim 不恢复。
- 仍不承诺：JS heap、未提交表单、滚动位置和私有 page snapshot。

## 2026-08-01：selector runtime 使用 isolated DOM revision 与增量 AX 缓存

- 决策：在当前 page/OOPIF 的 CDP isolated world 安装最小 MutationObserver，只维护语义相关 DOM revision；不向网页全局暴露对象，也不增加通用 JS/eval 工具。
- AX 合同：首次读取完整 AX tree，之后合并 `Accessibility.nodesUpdated`；DOM revision 不变时复用缓存，revision 变化、导航、debugger detach、freeze 或 generation 漂移时刷新/失效。
- 原因：Chromium 不保证每个新可访问节点都及时发出 `nodesUpdated`。只依赖 AX 事件会漏掉动态插入元素；每次 locator poll 读取完整 tree 又无法满足增量 runtime 和资源边界。
- 安全：revision 只表示“语义 DOM 已变化”，不包含页面正文、Cookie、Storage 或认证数据；最终输入仍重新校验 document、ref、焦点和两帧 actionability。

## 2026-08-01：Browser owner 的普通 live 页面预算为 8

- 决策：可见页和正在执行工具的页面受保护；其余页面按最近活动时间填满 8 个普通 live slot，超出部分进入 Chromium frozen/suspended。
- 恢复：suspended 页在显示或工具操作前切回 active；窗口释放后销毁 WebContents 并依赖 v2 reload 状态恢复，归类为 persisted；renderer crash 归类为 crashed。
- 降级：平台拒绝 freeze 时保持 live，禁止伪报 suspended。该预算限制 live/CPU 工作集，不等同于固定 RAM/GPU 数值；多 tab 内存/GPU 数值基线仍需单独 Windows 测量。
- 证据：纯策略和 CDP 单测锁定 8-tab 预算；Electron E2E 用同一路由 10 个 tab 证明 2 个进入 suspended，激活后恢复 live。Windows build 26200 基线为启动 1033 ms、suspended resume 6 ms、App restart recovery 1873 ms；1 到 10 tab 总 working set 增加 6392 KiB，完整逐进程数据见 verification JSON。

## 2026-08-01：系统睡眠使用 main-owned 串行恢复合同

- 决策：Electron main 监听 `powerMonitor.suspend/resume`，所有电源事件由单一协调器串行执行并合并重复状态，避免 suspend 尚未结束时并发 resume。
- 睡眠：此前运行的 app-server 连同标准 MCP transport 一起停止；pending 审批、Browser grant 和 Agent 操作失效，页面控制交还用户，存活页面进入 frozen/suspended。
- 唤醒：只有睡眠前已运行的 app-server 自动重启；thread 真源仍在标准 Codex Home/ThreadStore，renderer 通过原有 list/resume 恢复 thread。Browser 重建 CDP observer，恢复可见页，并对仍存活但 crashed 的页面执行 reload。
- 证据边界：协调器/App Server 测试和 Electron 模拟电源周期 E2E 证明代码路径、顺序、CDP 与 snapshot 恢复；真实 Windows 睡眠/唤醒仍必须单独取得 `PRODUCT_PASS`。
