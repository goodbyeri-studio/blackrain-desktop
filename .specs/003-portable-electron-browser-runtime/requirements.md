# 可移植 Electron Browser Runtime 源码底座需求

> 本 spec 描述一套适合其他 Electron 编程工具和桌面 Agent 二次开发的浏览器源码底座。它不承诺安装即用、通用 UI、npm 发布或任意 Agent 零适配接入。`CODE_EXISTS`、`RUN_PASS`、`PORTABILITY_PASS` 和 BlackRain `PRODUCT_PASS` 必须分开记录。

## 1. 背景

BlackRain 已在 `apps/desktop/electron/main/browser/` 建立 main-owned `WebContentsView`、持久 session、tab registry、CDP/OOPIF、locator/CUA、权限、下载、弹窗、恢复、工作集和 Agent 工具链。当前实现可以支撑 BlackRain 的 Codex-first 产品，但以下边界仍与应用绑定：

- 浏览器状态使用 `threadId`、`turnId`、`routeKey` 等 BlackRain/Codex 语义；
- `BrowserViewManager` 直接发送 BlackRain IPC event，并接收 `BrowserWindow` 与 window generation；
- preload Browser API 嵌在总 `BlackRainHostApi` 中；
- dynamic tool、MCP runtime 和 App Server server request 仍混在 Browser 目录；
- React `BrowserSidebar` 是 BlackRain 产品 UI，不是可移植运行时的一部分；
- 当前没有最小外部 Electron 宿主证明源码可以在不启动 Codex/App Server 的情况下工作。

本阶段把已有实现整理成“源码级二次开发底座”：其他团队可以复制、fork 或以 workspace source dependency 引入核心代码，再实现自己的 Electron 宿主、Agent 生命周期和 UI 适配，而不需要重写 Browser 生命周期、安全和 CDP 基础。

## 2. 用户与目标

### 2.1 目标用户

- 开发 Electron 编程 Agent、桌面 Agent 或 AI 工具的工程团队；
- 需要在同一可见页面上支持用户操作与 Agent 控制的 Electron 应用；
- 愿意阅读源码并按自身架构改造，而不是要求插件式零配置接入的二次开发者。

### 2.2 用户目标

- 拿到一个边界清晰的 Browser Runtime 源码目录；
- 在不采用 Codex、BlackRain App Server 或 BlackRain React UI 的前提下启动、挂载和控制页面；
- 选择只提供用户浏览，或通过自有 Agent adapter 接入 snapshot/locator/CUA/截图等能力；
- 替换 owner/session/task 标识、持久化位置、权限 UX、下载 UX 和 IPC，不修改 Browser 核心算法；
- 通过最小参考宿主和集成文档理解需要适配的入口、事件和安全责任。

## 3. 功能需求

### 3.1 Electron Browser 核心

- main 创建并持有 `WebContentsView`、page `WebContents`、session、registry 和 CDP controller；renderer 或网页不得创建特权页面对象。
- 提供 tab 创建、列表、导航、前进、后退、刷新、停止、关闭、可见性、布局和生命周期 API。
- 支持持久 profile、App 重启后的 tab/session 恢复、page crash 恢复和 stale generation 拒绝。
- 集中处理导航策略、权限、下载、文件选择器、JavaScript dialog、外部协议和敏感动作确认。
- 提供 snapshot、locator、click、hover、type、key、scroll、screenshot 和受限 CDP 能力。
- 保持用户接管、Agent 控制权、取消、超时、资源回收和隐藏运行合同。

### 3.2 中性源码合同

- 核心使用中性的 `ownerId`、`activityId`、`surfaceId`、`tabId` 和 generation；不得固化 Codex thread/turn 或 BlackRain route。
- `ownerId`、`activityId`、`surfaceId`、`profileId` 和 `tabId` 只是可审计索引，不是授权凭据；runtime 必须签发不可由 renderer、网页或外部 Agent transport 构造的 owner/activity lease。
- owner lease 必须不可变地绑定 owner、surface、profile、宿主窗口身份和 host generation；所有 tab、layout、decision、控制权和工具调用都必须携带对应 lease 或由其派生的 capability，并校验 tab/view/document generation。
- 同一 owner 同时最多有一个可写 Agent activity。开始新 activity 前必须完成或取消旧 activity；用户接管、activity 完成、取消、超时、adapter 断连或 owner lease 失效后，旧 activity capability 立即失效，迟到调用 fail closed。
- 核心不 import BlackRain `AppServerRuntime`、App Server RPC types、总 `BlackRainHostApi`、BlackRain IPC channels 或 React 组件。
- Electron 宿主通过显式配置或 port 提供窗口/视图挂载、profile namespace 与数据根目录、时间/ID、文件选择和用户决策入口；公共调用方不得提交任意文件系统路径或 Electron partition 字符串。
- runtime 只产生一条规范 typed event stream；BlackRain IPC、reference renderer、日志和其他消费者都作为订阅 adapter，不允许 core 与 host 各自维护第二条事件出口。
- permission、download、file chooser、dialog、external protocol 和 sensitive action 使用显式 decision port，定义请求关联、超时、取消、幂等和来源校验；port 缺失、抛错、超时或 lease 失效时默认拒绝。
- Agent 能力通过 transport-agnostic port 暴露；MCP、stdio、named pipe、WebSocket、函数调用或其他协议均属于 adapter。
- UI 只消费 typed control/event contract；底座不要求复用 BlackRain BrowserSidebar。
- 首轮公共合同标记为内部 `browser-runtime/v0`，consumer 必须锁定 Git revision/源码 hash；在批准 `v1` 前不承诺 SemVer 或跨 revision 兼容。公共层稳定 typed capability schema，具体 MCP/function tool 名称由 adapter 映射。

### 3.3 BlackRain 适配

- BlackRain adapter 将 `threadId/turnId/routeKey/profile/windowGeneration` 映射为中性 scope、host owner ref 与 owner/activity lease，不改变现有产品 ownership 和 fail-closed 语义。
- Codex adapter 继续使用标准 stdio MCP + 随包 Node adapter + 鉴权 transport，并且只调用唯一 Browser Runtime backend。
- 抽取期间不得维护复制的旧/新 Browser backend；兼容层必须有删除任务和测试。
- BlackRain Browser 产品回归仍由 `002-electron-migration` 验收，本 spec 只验收公共底座与适配边界。

### 3.4 二次开发资料

- 提供最小 Electron 参考宿主，证明 Browser Runtime 可在没有 Codex、BlackRain App Server 和 BlackRain React UI 时启动。
- 提供 source integration guide，说明目录复制/引用、入口初始化、窗口 attach、bounds、事件、持久化、权限和清理。
- 提供自定义 Agent adapter 示例，至少证明一种非 Codex 的 in-process fake Agent/tool caller 可以调用 Browser 工具合同。
- 文档标明哪些策略可以替换、哪些安全不变量不可删除、哪些能力是 BlackRain 专属 adapter。

## 4. 非目标

- 不在本阶段发布 npm 包、Electron 插件、独立安装器或插件市场条目。
- 不提供面向所有产品的通用成品 UI、主题系统或无代码配置。
- 不实现第二 Agent runtime、模型路由、thread store、审批系统或工作台平台。
- 不支持 Tauri、CEF、Qt WebEngine、WebView2 原生壳或非 Electron 宿主。
- 不承诺旧 Electron `BrowserView` API；目标以锁定 Electron 版本及 `WebContentsView` 为基线。
- 不把任意 CDP 方法或原始 IPC 暴露给 renderer/网页。
- 不因源码底座成立而宣称 BlackRain Electron 客户端发布可用。
- 本 spec 遵循仓库根目录的 MIT License 与 NOTICE；许可证采用不代表 Browser Runtime 已达到 `PORTABILITY_PASS` 或 Windows 产品发布状态。

## 5. 成功标准

### 5.1 `CODE_EXISTS`

- Browser Runtime 具有单一公共入口、公共合同和明确目录边界。
- 公共入口暴露可检查的 contract version，reference consumer 记录精确 Git revision/源码 hash；版本不匹配时初始化显式失败。
- `contracts/core` import graph 不包含 Electron runtime types、App Server、Codex、BlackRain Host API/IPC 或 React；Electron types 只存在于 `electron` implementation。
- BlackRain/Codex 集成代码位于 adapter 边界，BlackRain 产品仍消费同一个核心。
- 最小 Electron 参考宿主和自定义 Agent adapter fixture 已存在。
- 公共入口强制 owner/activity lease、profile binding、generation 和单活动状态机，raw ID 不能单独授权任何操作。

### 5.2 `RUN_PASS`

- 核心单测覆盖 registry、policy、session、generation、工作集、取消和失败恢复。
- Electron 集成测试覆盖 view 创建/挂载/隐藏/重挂载/销毁、导航、权限、下载、dialog、crash 和 CDP。
- 最小参考宿主在 Windows 上通过启动、真实页面交互、重启恢复和资源清理 E2E。
- BlackRain 既有 Browser 目标测试、Electron typecheck 和 host boundary 检查继续通过。
- 合同负向测试覆盖伪造 raw ID、跨 profile、旧 owner/activity lease、重复 activity、旧 tab/view/document generation、decision 超时和重复 decision。
- BlackRain composition test 证明 IPC、标准 stdio MCP 和测试/bootstrap adapter 注入同一个 runtime identity，且单进程、单 profile 不会创建第二 registry/session/CDP backend。

### 5.3 `PORTABILITY_PASS`

- 一个不 import BlackRain App Server、BlackRain Host API 和 BlackRain React UI 的最小 Electron consumer 可以仅通过公开源码合同完成集成。
- consumer 可替换 scope ID、持久化目录、事件输出和 Agent tool adapter，而不修改核心私有实现。
- 集成指南中的步骤必须在仓库根目录之外的新临时目录复现：使用独立 manifest/lockfile 和依赖安装，不继承 BlackRain tsconfig/path alias、根 `node_modules`、workspace hoist、`NODE_PATH` 或未声明构建脚本，并记录日期、Windows build、Electron/Node 版本、命令和证据。
- reference host 使用独立本地 HTTP/HTTPS fixture 验证 Cookie/登录态、Service Worker、权限、下载、dialog、popup、崩溃和重启恢复；真实外网站点只作可选 smoke，不作为确定性验收依赖。
- 静态扫描证明无 Codex-only identifier、BlackRain 私有 import、固定 app-data 路径和额外 backend 实现；composition/runtime identity 测试另行证明没有第二个活动 backend，静态扫描不能单独给出该结论。
- hermetic consumer 的依赖闭包、第三方许可证和 NOTICE 可从独立 manifest/lockfile 重建；未批准对外授权时只记录内部技术通过，不声明公开 SDK 或可分发源码。

## 6. 安全与合规约束

- 页面 `WebContents` 保持 sandbox、context isolation、Node off、web security on；默认不加载 page preload。
- permission、download、file chooser、external protocol、popup 和 CDP 必须由 main policy 集中控制。
- renderer 只能获得类型化 allowlist，不能获得原始 IPC、Electron 对象、session、Cookie 或任意 CDP。
- scope/owner/tab/view/document generation 必须 fail closed；adapter 不能绕过 ownership 校验。
- raw ID、序列化 lease 外观和来自 transport 的 owner/activity/profile 字段均不可信；只有 runtime 在 Electron main 内签发并持有的 opaque lease/capability 可以授权操作。
- Cookie、Local Storage、token 和密码不得自动进入 Agent 上下文或日志。
- 第三方依赖继续遵守其自身 License 和根 `NOTICE`；BlackRain 自有源码按根 `LICENSE` 发布。

## 7. 约束与依赖

- 当前实现仍服务 `002-electron-migration`，抽取不得阻塞 BlackRain 的唯一产品发布路径。
- `codex-upstream` 只读，不因本 spec 修改或分叉。
- 浏览器核心只能有一个规范实现；每个 app/profile composition 只能有一个活动 backend。BlackRain 和 reference host 分别在各自进程内通过 adapter 复用同一实现。
- Windows 是可移植性验收平台；macOS/Linux smoke 只能补充，不替代 Windows `PORTABILITY_PASS`。
- 新增真实命令后才写入 `docs/commands.md`，目标命令名称不能冒充已经存在。

## 8. 开放问题

- [ ] 首个 `PORTABILITY_PASS` 后是否建立独立 workspace package，以及如何保持源码 revision 兼容。
