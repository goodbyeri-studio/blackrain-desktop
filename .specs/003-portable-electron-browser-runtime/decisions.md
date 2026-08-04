# 可移植 Electron Browser Runtime 决策

> 决策只定义路线和边界，不自动证明代码、运行或可移植性已经通过。完成事实只写入 `verification.md`。

## 已决策

### 2026-08-04：建立独立源码底座 spec

- 决策：新增 `003-portable-electron-browser-runtime`，与 `002-electron-migration` 并行维护。
- 原因：Browser 已形成较完整的 Electron runtime，但当前合同仍嵌在 BlackRain/Codex 产品接线中；二次开发目标需要独立的代码边界、任务和可移植性验收。
- 替代方案：继续把模块化任务写入 `002`；拒绝，因为产品发布状态和源码可移植状态会互相污染。
- 影响范围：`.specs` 允许多个边界清晰的 active spec；产品 P0 仍由 `002` 管理。
- 复查条件：源码底座取消、合并回产品实现或完成交付时重新评估 spec 关系。

### 2026-08-04：交付源码底座，不做安装即用插件

- 决策：本阶段交付适合 copy/fork/workspace 引用和二次改造的源码模块、公共合同、adapter 和 reference host。
- 原因：目标用户是 Electron 工程团队，需要可读、可改、低耦合底座，而不是无代码插件。
- 非目标：npm 发布、独立安装器、插件市场、通用成品 UI、SemVer 长期兼容承诺。
- 影响：验收使用 `PORTABILITY_PASS`，不要求生成独立产品制品。

### 2026-08-04：Browser 核心与 Agent runtime 解耦

- 决策：公共核心只定义中性 Browser scope/activity/tool contract，不依赖 Codex、App Server、MCP 或其他 Agent runtime。
- 原因：Browser 是 Electron 宿主能力，Agent 只是可选调用方。
- 替代方案：把标准 MCP 作为唯一公共入口；拒绝，因为会把 transport 和 lifecycle 固化进核心。
- 影响：Codex stdio MCP、Node adapter 和鉴权 transport 移入 Codex/BlackRain adapter，但 BlackRain 发布态仍保持这条唯一生产路由。

### 2026-08-04：保持 main-owned WebContentsView 安全模型

- 决策：源码底座继续由 Electron main 独占 `WebContentsView`、session、CDP、权限、下载和页面生命周期。
- 原因：这是同页用户/Agent 控制、恢复和权限隔离的基础，不属于可选产品偏好。
- 替代方案：允许 renderer `<webview>` 或公开 raw CDP；拒绝，因所有权和攻击面不可控。
- 影响：其他 Electron 项目必须实现 main/preload 适配，不能只复制 renderer UI。

### 2026-08-04：核心无通用 UI

- 决策：公共底座提供 typed control/event/layout contract 和最小 reference renderer，不提供通用产品 UI。
- 原因：不同编程 Agent 的布局、控制权提示、权限 UX 和视觉系统差异很大。
- 影响：BlackRain `BrowserSidebar` 保持产品 adapter，不进入公共核心。

### 2026-08-04：只保留一个 Browser backend

- 决策：抽取使用 facade/adapter 渐进迁移；任何阶段不得并行维护两套 registry、session、CDP 或工具 backend。
- 原因：双 backend 会造成 tab、Cookie、控制权、generation 和恢复状态分叉。
- 影响：BlackRain 和 reference host 必须消费同一核心；兼容层需要明确删除任务。静态扫描只证明实现/入口边界，BlackRain composition test 还必须证明 IPC、标准 stdio MCP 和测试/bootstrap adapter 注入同一 runtime identity，不能只靠扫描宣称单 backend。

### 2026-08-04：raw ID 不授权，使用 main-owned opaque lease

- 决策：`ownerId/surfaceId/profileId/activityId/tabId` 只作索引；runtime 在 Electron main 内签发并登记 owner/activity lease，所有有状态操作同时校验 lease、profile 与 tab/view/document generation。
- 原因：字符串和 transport metadata 可被伪造，不能替代当前 window/thread/route/profile/generation 的 fail-closed 边界。
- 生命周期：同一 owner 同时最多一个可写 Agent activity；旧 activity 未完成/取消时拒绝第二个，用户接管或 activity/owner 失效后拒绝迟到写操作。
- 影响：lease capability 不进入 preload、IPC、MCP、日志或网页；BlackRain/Codex adapter 只能通过 main 内可信映射取得 lease。

### 2026-08-04：唯一事件流与显式 DecisionPort

- 决策：`BrowserRuntime.subscribe` 是唯一规范事件出口；BlackRain IPC、reference renderer 和日志都是订阅 adapter。permission、download、file chooser、dialog、popup、external protocol 和 sensitive action 统一走显式 DecisionPort。
- 原因：core 与 host 双事件出口会造成重复、乱序和状态分叉；安全决策若留给 adapter 临时实现会破坏默认拒绝。
- 影响：decision 必须校验 request/owner/profile/generation/origin/expiry，缺失、错误、超时、取消、重复或迟到结果一律 deny/cancel。

### 2026-08-04：首轮原地抽取并锁定 Electron 42.3.0

- 决策：首轮公共源码边界建立在 `apps/desktop/electron/browser-runtime/`，BlackRain/Codex adapter 放在公共目录外；不先建立独立 workspace package。reference host 与 BlackRain 都锁定当前 Electron `42.3.0`。
- 原因：先稳定依赖和安全合同，避免同时移动目录、改变包边界和扩大版本矩阵。
- 影响：首个 `PORTABILITY_PASS` 只证明锁定版本；最低支持版本、独立 package 和后续目录移动必须另行决策并重跑完整矩阵。

### 2026-08-04：Portability 验收必须 hermetic

- 决策：最终 consumer 在仓库根目录之外的新临时目录，以独立 manifest/lockfile 和依赖安装完成 compile/package/E2E；不得继承根 tsconfig alias、workspace hoist、父级 `node_modules`、`NODE_PATH` 或未声明脚本。
- 原因：仓库内 fixture 和禁止 import 扫描无法证明 copy/fork/source dependency 的真实依赖闭包。
- 影响：确定性页面场景使用本地 HTTP/HTTPS fixture；真实外站、个人账号和 BlackRain profile 不进入 `PORTABILITY_PASS` 必需条件。

### 2026-08-04：首轮合同为 source-pinned v0

- 决策：公共入口标记 `browser-runtime/v0` 并暴露 source revision/hash；consumer 固定精确源码 revision，不承诺 SemVer 或跨 revision 兼容。核心稳定 typed capability schema，MCP/function tool 名称由 adapter 自定义映射。
- 原因：本阶段交付源码底座而非 npm SDK，过早承诺长期兼容会阻碍边界收敛；工具名也属于 transport/product UX，不应固化到核心。
- 影响：版本不匹配必须初始化失败；任何对外 `v1`/SemVer 承诺都要单独决策、迁移文档和兼容测试。

### 2026-08-04：授权与公开分发暂不由本 spec 决定

- 决策：先完成内部源码边界和可移植性；是否开源、商业授权或对外发布另行决策。
- 原因：技术可移植不等于法律可分发，Desktop/Cloud 当前仍是闭源商业项目。
- 影响：文档不得把 `003` 写成已经公开发布的 SDK 或开源项目。

## 待决策

- 首个 `PORTABILITY_PASS` 后是否建立独立 workspace package 或移动到顶层 `packages/`。
- Electron 42.3.0 之外的最低支持版本和兼容矩阵。
- 对外授权、NOTICE、版本策略和分发渠道。

## 被推翻的方案

暂无。
