# 可移植 Electron Browser Runtime 源码底座设计

> 本设计描述目标边界，不证明代码已经抽取或可移植。真实状态只看本 spec 的 `verification.md`；BlackRain 产品发布状态只看 `002-electron-migration/verification.md`。

## 1. 总体方案

采用“共享 Browser Runtime 核心 + Electron 宿主 port + 可选 Agent port + 产品 adapter”的源码结构。核心继续使用 Electron main-owned `WebContentsView`，但不理解 Codex、BlackRain thread/turn、BlackRain IPC 或 React UI。

```text
BlackRain Electron                         其他 Electron 项目
  BlackRain UI/IPC adapter                  自有 UI/IPC adapter
  Codex/MCP adapter                         自有 Agent adapter（可选）
           \                                  /
            -> Browser Runtime public contracts
               -> Browser Runtime core
                  -> Electron host port
                     -> BrowserWindow/contentView
                     -> WebContentsView/page WebContents
                     -> session/CDP/download/permission
```

运行时只有一个 Browser backend。adapter 只能翻译身份、生命周期、transport 和 UI 事件，不能复制 tab/session/CDP 状态机。

## 2. 目标源码布局

首轮允许在 `apps/desktop/electron/` 内原地整理，避免为了目录外观制造大规模移动；最终边界建议为：

```text
apps/desktop/electron/browser-runtime/
  contracts/
    browser-scope.ts
    browser-leases.ts
    browser-tabs.ts
    browser-layout.ts
    browser-tools.ts
    browser-events.ts
  ports/
    browser-host-port.ts
    browser-decision-port.ts
    browser-runtime-services.ts
  core/
    browser-runtime.ts
    browser-registry.ts
    browser-session-store.ts
    browser-working-set.ts
    browser-sensitive-action-policy.ts
  electron/
    electron-browser-host.ts
    browser-view-controller.ts
    browser-cdp-controller.ts
    browser-policy.ts
  testing/
    fake-browser-host.ts
    fake-agent-adapter.ts
  index.ts

apps/desktop/electron/main/browser-adapters/
  blackrain-host-adapter.ts
  codex-browser-adapter.ts
  mcp-browser-adapter.ts

apps/desktop/electron/examples/minimal-browser-host/
  main/
  preload/
  renderer/
```

首轮在 `apps/desktop/electron/browser-runtime/` 原地建立边界，不建立独立 workspace package；通过首个 `PORTABILITY_PASS` 后再决定是否机械移动。依赖方向必须保持：`contracts <- ports <- core <- electron composition`，产品 adapter 只依赖公共入口/合同，公共目录不得反向 import BlackRain/Codex adapter。`contracts` 和 `core` 不 import Electron；`electron` 层才持有 `WebContentsView`、session 和 CDP。

## 3. 公共合同

### 3.1 中性身份

公共合同不使用 `threadId`、`turnId` 或 `routeKey`。字符串 ID 只用于索引和诊断，不能授权操作：

```ts
type BrowserScope = Readonly<{
  ownerId: string;
  surfaceId: string;
  profileId: string;
}>;

declare const hostOwnerBrand: unique symbol;
type BrowserHostOwnerRef = Readonly<{
  [hostOwnerBrand]: true;
  generation: number;
}>;

type BrowserOwnerBinding = Readonly<{
  scope: BrowserScope;
  host: BrowserHostOwnerRef;
  profile: BrowserProfileKey;
}>;

declare const ownerLeaseBrand: unique symbol;
type BrowserOwnerLease = Readonly<{
  [ownerLeaseBrand]: true;
  leaseId: string;
}>;

declare const activityLeaseBrand: unique symbol;
type BrowserActivityLease = Readonly<{
  [activityLeaseBrand]: true;
  leaseId: string;
  activityId: string;
  generation: number;
}>;
```

- `ownerId`：隔离 tab、权限和控制权的逻辑所有者；BlackRain 映射 thread/session。
- `surfaceId`：可见 Browser surface；BlackRain 映射 `browser-sidebar` 等 route。
- `profileId`：Cookie/Cache/Service Worker 与持久 tab state 的逻辑命名空间；由可信 host 配置映射为固定 partition/path，外部调用方不能提交 partition 或文件系统路径。
- `activityId`：一次 Agent/tool 活动；BlackRain 映射 turn。
- `BrowserHostOwnerRef` 由 Electron host implementation 根据真实 `BrowserWindow`/owner `webContents` 和 host generation 签发并在 main 内登记；BlackRain adapter 不能用 renderer 提交的数字直接构造它。
- owner lease 由 runtime 在 Electron main 内签发，绑定完整 scope、已登记 host owner ref 和 profile key；runtime 在内部 lease registry 校验随机 capability 与对象身份。TypeScript brand 只提供编译期保护，不能代替运行时注册表。
- activity lease 绑定 owner lease 和单调递增 generation。同一 owner 只允许一个可写 Agent activity；开始第二个 activity 时若旧 activity 未完成/取消则拒绝。
- `windowId`、profile binding、owner/activity/tab/view/document generation 属于 Electron main ownership，不由 renderer、网页、MCP payload 或其他 Agent transport 提供可信值。

具体类型名在 B1 冻结，但上述信任边界和单活动语义不得改变。

### 3.2 Browser Runtime API

```ts
interface BrowserRuntime {
  acquireOwner(binding: BrowserOwnerBinding): BrowserOwnerLease;
  createTab(
    owner: BrowserOwnerLease,
    input?: CreateTabInput,
  ): Promise<BrowserTabState>;
  listTabs(owner: BrowserOwnerLease): BrowserTabState[];
  navigate(
    owner: BrowserOwnerLease,
    request: BrowserNavigateRequest,
  ): Promise<BrowserTabState>;
  control(
    owner: BrowserOwnerLease,
    request: BrowserControlRequest,
  ): Promise<BrowserTabState>;
  closeTab(owner: BrowserOwnerLease, request: BrowserTabRequest): Promise<void>;
  setLayout(
    owner: BrowserOwnerLease,
    update: BrowserLayoutUpdate,
  ): Promise<BrowserLayoutAck>;
  takeControl(
    owner: BrowserOwnerLease,
    request: BrowserTabRequest,
  ): Promise<BrowserTabState>;
  beginActivity(
    owner: BrowserOwnerLease,
    activityId: string,
  ): BrowserActivityLease;
  callTool(
    activity: BrowserActivityLease,
    call: BrowserToolCall,
    signal: AbortSignal,
  ): Promise<BrowserToolResult>;
  completeActivity(
    activity: BrowserActivityLease,
    reason: ActivityEndReason,
  ): Promise<void>;
  subscribe(listener: (event: BrowserRuntimeEvent) => void): () => void;
  releaseOwner(owner: BrowserOwnerLease): Promise<void>;
  dispose(): Promise<void>;
}
```

所有 tab request 继续携带 tab/view/document generation；runtime 同时校验这些 generation 与 owner/activity lease。raw scope、序列化 lease 外观或 transport metadata 不能直接调用有状态 API。用户接管会取消当前操作、递增控制 generation 并使该 activity 的后续写操作失效；adapter 必须开始新 activity 才能恢复 Agent 控制。

API 只表达行为合同；实现可以继续复用现有 `BrowserViewManager`，但要把窗口查找、IPC send 和 BlackRain route ownership 移入 host adapter。

首轮公共入口声明 `contractVersion: "browser-runtime/v0"` 和 source revision/hash。初始化时 consumer/adapter 可声明期望版本，不匹配则显式失败；`v0` 允许随源码 revision 发生 breaking change，不承诺 SemVer。`BrowserToolCall` 使用 typed capability discriminated union，MCP/function tool 名称只在 adapter 中映射，不进入核心稳定面。

### 3.3 Host Port

```ts
interface BrowserHostPort<TViewHandle, TRectangle> {
  assertHostOwner(owner: BrowserHostOwnerRef): void;
  attachView(lease: BrowserOwnerLease, view: TViewHandle): void;
  detachView(lease: BrowserOwnerLease, view: TViewHandle): void;
  resolveBounds(lease: BrowserOwnerLease, requested: TRectangle): TRectangle;
  resolveStateRoot(profile: BrowserProfileKey): string;
}
```

portable port 只使用泛型/opaque handle，不 import Electron。`electron/electron-browser-host.ts` 在 main 中把 `TViewHandle`/`TRectangle` 绑定为 Electron `WebContentsView`/`Rectangle`，并提供只接受真实 `BrowserWindow`/owner `webContents` 的 host owner ref factory；这些类型、ref、lease 和 profile path 都不进入 preload/renderer 合同。`acquireOwner` 必须先调用 `assertHostOwner` 并确认 profile key 与 scope mapping 一致。host 初始化时把受校验的 profile namespace 注册为 `BrowserProfileKey`，`resolveStateRoot` 只能解析已注册 key，不能接收任意路径。实际代码按测试性拆分 `WindowPort`、`PersistencePort`、`Clock/IdPort` 和下面的 `DecisionPort`。

### 3.4 Decision Port

```ts
interface BrowserDecisionPort {
  decide(
    owner: BrowserOwnerLease,
    request: BrowserDecisionRequest,
    signal: AbortSignal,
  ): Promise<BrowserDecisionResult>;
}
```

`BrowserDecisionRequest` 是 permission、download、file chooser、dialog、popup、external protocol 和 sensitive action 的 discriminated union，必须包含 request ID、tab/view/document generation、origin 和 expiry。runtime 只接受当前 owner lease 下第一个未过期结果；重复、迟到、跨 profile 或来源不匹配的结果拒绝。port 缺失、抛错、abort 或超时统一返回 deny/cancel；文件选择结果还要由 host 做路径与模式校验。

### 3.5 Event Port

`BrowserRuntime.subscribe` 是唯一规范事件出口。core/electron 层不直接发送 IPC；BlackRain host adapter、reference renderer bridge、日志和测试 recorder 都通过订阅获得相同的有序事件。事件包含 scope 的公开索引和 generation，不包含 lease capability、Cookie、token 或任意 Electron 对象。

### 3.6 Agent Port

Agent adapter 是可选入口：

```ts
interface AgentBrowserAdapter {
  registerOwner(owner: BrowserOwnerLease): void;
  beginActivity(
    owner: BrowserOwnerLease,
    activityId: string,
  ): BrowserActivityLease;
  call(
    activity: BrowserActivityLease,
    call: BrowserToolCall,
    signal: AbortSignal,
  ): Promise<BrowserToolResult>;
  completeActivity(
    activity: BrowserActivityLease,
    reason: ActivityEndReason,
  ): Promise<void>;
  unregisterOwner(owner: BrowserOwnerLease): Promise<void>;
}
```

核心不知道调用来自 MCP、Codex App Server、其他模型 SDK 或用户脚本。transport authentication、session/turn mapping、tool naming 和结果封装均在 adapter。adapter 先用已经注册的可信映射找到 main-owned owner lease，再开始 activity；来自 transport 的 owner/activity/profile 字段永远不能直接变成 lease。

## 4. BlackRain 与 Codex 适配

```text
BlackRain threadId    -> BrowserScope.ownerId
BlackRain routeKey    -> BrowserScope.surfaceId
BlackRain profile     -> BrowserScope.profileId / registered BrowserProfileKey
Codex turnId          -> BrowserActivityLease.activityId
window/webContents    -> BrowserOwnerBinding（main 内可信解析）
Browser IPC channels  -> BlackRainHostAdapter
stdio MCP/Node client -> CodexBrowserAdapter
```

- BlackRain adapter 保持现有 schema 校验、window registry、thread/route/profile ownership；它在 main 内把可信 owner mapping 交给 runtime 换取 lease，renderer 和 MCP client 永远看不到 lease capability。
- BlackRain 事件扇出只订阅 `BrowserRuntime.subscribe`；Browser core/electron implementation 不直接调用 BlackRain IPC。
- Codex adapter 保持标准 stdio MCP、随包 Node runtime、鉴权 local transport 和 current capability token。
- Codex `_meta.threadId`、turn metadata 和 transport capability 只用于查找已注册 owner/activity mapping，不能绕过 runtime lease、profile 或 generation 校验。
- `BrowserAgentBackend` 可作为迁移期 facade，但公共合同不能继续从 `browser-dynamic-tool-adapter.ts` 反向引用 App Server RPC types。
- dynamic tools 仍只作测试/bootstrap，不能因为抽取底座重新成为 BlackRain 发布态第二路由。

## 5. UI 边界

源码底座不提供通用成品 UI。它只提供：

- tab/state/event schema；
- navigation/control/decision API；
- renderer 需要上报的 bounds、visibility、active tab 和 occlusion 合同；
- 最小 reference renderer，用于证明接入和 E2E，不作为产品组件库。

BlackRain `BrowserSidebar` 保持产品 adapter；其他项目可以使用 React、Vue、Svelte 或原生 renderer，只要通过 typed preload 调用。

## 6. 安全边界

- `WebContentsView` 只由 Electron main 创建和持有。
- 页面使用固定 partition policy、sandbox、context isolation、Node off、web security on、webviewTag off。
- 默认无 page preload；确需 annotation/capture 时只能由 host 固定路径/hash，并禁止暴露页面全局特权。
- navigation、popup、permission、download、file chooser、dialog、external protocol 和 CDP policy 在核心/electron 层集中实施。
- public contract 接收不可信输入时必须经 schema 校验；owner lease、tab/view/document generation 和 profile 不匹配时 fail closed。
- owner/activity lease 只存在于 main 内部注册表，不可序列化到 preload、IPC、MCP、日志或页面；raw ID 和具有相同字段形状的对象不能通过运行时校验。
- 同一 owner 的第二个未收口 Agent activity、旧 activity 写操作、用户接管后的迟到输入以及重复/迟到 decision 全部 fail closed。
- renderer/Agent adapter 不能获得 Cookie、session 对象、原始 IPC、任意 filesystem 或 unrestricted CDP。

## 7. 状态与持久化

核心持有 tab 元数据、generation、lifecycle 和工作集计划；Electron session 持有 Cookie/Cache/Service Worker。宿主只提供命名空间和路径：

```text
host app data/
  browser-runtime/
    profiles/<profile-id>/
    state/<owner-namespace>.json
```

`profile-id` 和 `owner-namespace` 必须经过固定字符集、长度限制、冲突检测和路径 containment 校验；调用方不能提交相对/绝对路径或 Electron partition。owner lease 固定绑定 profile，恢复、list、decision 和 tool call 都不能跨 profile。

BlackRain adapter 继续映射到现有 `app-state`/`browser-data`，不得在抽取时迁移或复制用户 Cookie。外部 reference host 使用独立测试目录；E2E 先验证重启恢复，再由显式 teardown 清理该测试目录。

## 8. 抽取策略

### 8.1 先建立依赖闸口

生成 Browser 文件/符号/import inventory，将现有文件分类为：

- portable contract；
- portable core；
- Electron-specific implementation；
- BlackRain host adapter；
- Codex/MCP adapter；
- product UI；
- test/bootstrap-only；
- delete。

增加静态检查，禁止 core import `app-server`、BlackRain host API/IPC、renderer 或 React。

### 8.2 原地拆分再移动

优先拆分 2,000+ 行 `BrowserViewManager` 的职责和构造依赖，保持调用方测试通过；边界稳定后再机械移动目录。避免同时重命名、改协议、搬文件和改行为导致无法定位回归。

### 8.3 Strangler adapter

应用 composition root 只创建一次 `BrowserRuntime`，再把同一实例显式注入 BlackRain IPC、标准 stdio MCP 和测试/bootstrap adapter；禁止 adapter 自行构造 runtime。现有调用方先改为调用公共 facade；当所有调用方切换后删除旧 facade。静态 import/constructor gate 检查额外实现和额外 composition entry，运行时测试再断言所有 adapter 暴露相同 runtime identity；两类证据缺一不可。

### 8.4 Reference consumer

创建最小 Electron fixture：

```text
BrowserWindow
  -> minimal preload allowlist
  -> minimal renderer chrome/bounds
  -> Browser Runtime
  -> WebContentsView
```

fixture 不启动 Codex、不读取 `CODEX_HOME`、不依赖 BlackRain workspace/thread/settings/account。fake Agent 仅调用公共 tool contract。

确定性 E2E 使用 reference host 自带的本地 HTTP/HTTPS fixture，覆盖 Cookie/伪登录态、Service Worker、permission、download、dialog、popup、OOPIF、crash 和 restart。不得要求个人账号、真实凭据或 BlackRain profile；真实外网站点仅为可选 smoke。

最终 `PORTABILITY_PASS` 不能在 BlackRain workspace 内直接运行 consumer。验证脚本必须把批准的源码快照和最小宿主放入仓库根目录之外的新临时目录，清除 `NODE_PATH` 等继承，使用独立 manifest/lockfile 执行依赖安装、compile/package/E2E，并记录模块解析与许可证闭包。这样可以发现根 tsconfig alias、workspace hoist、父级 `node_modules` 和未声明脚本依赖。

## 9. 失败模式

- host lease 失效：隐藏并 detach view，拒绝旧 generation 请求；由 adapter决定重建或提示。
- page crash：仅重建受影响 tab，保留 profile，使旧 view/document generation 失效。
- renderer crash：main-owned view 和 session 保留，renderer 恢复后重新提交 layout/owner lease。
- Agent adapter 断开：取消该 activity 的操作、使 activity lease 失效并归还或释放控制权，不销毁用户 tab。
- 用户接管：取消 in-flight Agent 操作并递增控制 generation；当前 activity 后续写调用拒绝，读能力是否保留由冻结后的 capability schema 明确规定。
- 持久化损坏：隔离损坏文件并从空 tab state 启动，不清理 Electron profile。
- policy/decision port 不可用：权限、下载、文件选择和敏感动作默认拒绝。
- adapter 配置错误：初始化时显式失败并给出诊断，禁止静默回退到 BlackRain/Codex 私有路径。

## 10. 测试策略

- 单元测试：schema、registry、policy、working set、session migration、generation、控制权和取消。
- Lease/contract 负向测试：伪造 raw ID/结构相同对象、跨 owner/surface/profile、旧 owner/activity lease、并发第二 activity、用户接管后的迟到写、旧 tab/view/document generation、decision 超时/重复/迟到。
- Electron 集成：真实 `WebContentsView`、session、CDP、OOPIF、权限、下载、dialog、crash 和 reparent。
- Contract test：BlackRain adapter 与 reference host 对同一公共测试套件运行。
- Composition test：BlackRain IPC、标准 stdio MCP 和测试/bootstrap adapter 使用同一 runtime identity；单进程、单 profile 只存在一个 registry/session/CDP backend。
- Portability E2E：在仓库外 hermetic 临时目录独立安装并构建；最小宿主不含 BlackRain/Codex imports 或隐式 workspace 依赖，完成启动、导航、本地伪登录、snapshot、输入、截图、隐藏/恢复、重启和退出清理。
- BlackRain 回归：继续执行 `electron:typecheck`、目标 Vitest、`electron:e2e` 和 `check:host-boundary`；产品发布结论只进入 `002`。
- 静态扫描：禁止 core 中出现 `threadId`、`turnId`、`browser-sidebar`、`blackrain_browser`、App Server RPC、BlackRain IPC 和固定 app-data 路径；限制 runtime constructor/composition entry，但不以静态扫描替代单 backend 运行时证明。

## 11. Spec 关系

- `002-electron-migration`：BlackRain 产品迁移、唯一运行路径、Windows package/MSIX 和产品 Browser 回归。
- `003-portable-electron-browser-runtime`：公共源码边界、adapter、reference host 和可移植性。
- 共享代码改动必须分别记录对应任务与验证；两个 spec 不共享完成状态。
