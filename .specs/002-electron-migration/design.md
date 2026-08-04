# Electron 原生重建与全量迁移 MVP 设计

> 目标拓扑不是完成证据。实现、运行和发布状态分别记录在 `tasks.md` 与 `verification.md`。

## 1. 总体方案

保留现有 React 产品 UI，以 Electron main/preload 取代 Tauri 宿主；将 agent、thread、turn、审批、工具、停止、恢复和 ThreadStore 全部交给原装 `codex.exe app-server`，将桌面特权能力按领域收口到 Electron main。

```text
React renderer
  -> window.blackrain typed allowlist
  -> Electron preload/contextBridge
  -> sender/schema/ownership 校验
  -> Electron main
       ├─ AppServerSupervisor -> bundled codex.exe app-server (stdio JSONL)
       ├─ Files / Git / Terminal / Settings / Credentials / Updates
       ├─ Window / Menu / Dialog / Notification / Deep link
       └─ BrowserBackend -> WebContentsView -> page WebContents
```

发布态只有 Electron 一条入口。迁移不是复制 Tauri command 到 Electron IPC，而是从产品能力合同出发重新建立 Electron 原生模块；Tauri 只提供待对齐的可观察行为，不能定义最终 API、目录或生命周期。

## 1A. 原生重建合同

每个能力必须按同一顺序迁移：

```text
记录用户行为和安全边界
  -> 定义与宿主无关的产品域 contract
  -> 在 Electron main/preload 原生实现
  -> renderer 单次切换到新 contract
  -> 运行/产品验证
  -> 删除旧调用、旧类型、旧事件、旧资源和旧文档
```

禁止以下实现：

- 将 Tauri command 名原样变成 Electron channel 并作为永久 API；
- 在 `src/host` 中长期保留运行时探测、双分支或动态 import Tauri；
- Electron 失败后自动启动 Tauri、Rust daemon 或固定 localhost transport；
- 因旧实现存在而把 `src-tauri` 资源、图标、capability、Rust helper 或 NSIS 带入 MSIX；
- 在 UI 文案、错误、日志和用户文档中暴露“兼容模式”“Tauri fallback”或旧 daemon 概念。

最终生产目录应呈现为 Electron 原生应用：

```text
apps/desktop/
  electron/
    main/{app,app-server,browser,files,git,terminal,settings,credentials,updates,security}
    preload/
    shared/
  src/                         # React renderer，只依赖产品域 contract
  resources/{codex,node-runtime,browser-client,licenses}
  scripts/                     # 仅 Electron 开发、验证、签名和发布脚本
  forge.config.ts
  package.json
```

最终不存在 `src-tauri/`、Tauri package/script/config、Rust daemon/adapter、NSIS 或 Tauri 命名的生产 service。

## 2. 能力所有权矩阵

| 能力 | 唯一真源/所有者 | renderer 可见接口 | 删除条件 |
|---|---|---|---|
| thread、turn、item、审批、工具、沙箱、停止、恢复、ThreadStore | 原装 app-server/codex-core | typed app-server facade + 标准事件 | Tauri codex/daemon command 全部迁移后删除 |
| workspace、文件树、文件读写 | Electron main files/workspaces | `window.blackrain.workspace/files` | 对应 Tauri files/workspaces command 无调用 |
| Git status/diff/branch/commit/PR | Electron main Git service | typed Git API | Git E2E 和进程清理通过 |
| 终端 | Electron main `node-pty`/ConPTY | typed terminal API + event stream | Tauri terminal command、Rust PTY 和资源删除 |
| 设置、模型/config、账户凭据 | Electron main settings/credential store + 标准 Codex Home | typed settings/account API | 无 renderer Tauri settings/account fallback |
| 窗口、菜单、对话框、拖放、通知、快捷键、深链 | Electron main | typed host API | 所有可见入口 Electron 测试通过 |
| 更新、诊断、崩溃恢复 | Electron main update/diagnostics | typed update API | 正式签名回滚矩阵通过 |
| Browser 页面、session、权限、下载、CDP | Electron main BrowserBackend | typed browser control API | Browser 回归矩阵通过 |
| Gateway 协议翻译 | 独立 `gateway/` sidecar | 不暴露内部协议 | 仅按模型需求启用，不承载 thread/browser/UI 状态 |
| workbench/office/tailscale 等暂停能力 | delete/deferred-delete | 入口隐藏或禁用 | 不得被迁移主链重新激活 |

## 3. 迁移账本合同

实施第一步必须生成 `.specs/002-electron-migration/migration-ledger.md`（或等价机器可读文件），每个条目至少包含：

```text
id / 原始 command 或 import / 所属模块
目标归属：app-server | electron-main/preload | renderer-only | gateway | delete
状态：inventory | mapped | implemented | run-pass | product-pass | deleted
目标文件/API / 依赖任务 / 单测或 E2E / 删除提交
```

账本必须覆盖：

1. `src-tauri/src/lib.rs` 的全部 194 个 command；
2. `host-boundary-baseline.json` 中全部 53 个 renderer direct import；
3. `src/services/tauri.ts`、`src/services/events.ts`、drag/drop、update、terminal 等兼容入口；
4. Tauri plugin、capability、resource、NSIS、CI、daemon、固定端口和环境变量。

`check:host-boundary` 只负责迁移期阻止新增依赖和未分类 command，不能代替功能验证或删除证明。当前脚本输出的模块标签（如 `codex-app-server-review`、`electron-main-node-pty`）只是 `source_module` 展示值；生成账本时必须映射为本合同的 canonical owner，并将 node-pty/credential-store/deferred-delete 写入 capability。Native Clean Gate 关闭时，这个检查必须从“允许旧基线”改为按分层范围执行 zero-tolerance：生产源码、依赖、脚本、CI、用户可见文案和制品出现 Tauri 即失败，内部真源文档按允许列表审计。

## 4. 进程与数据边界

### 4.1 App Server

- main 使用 `child_process.spawn` 启动锁定版本的 `codex.exe app-server`，stdin/stdout 为逐行 JSON，stderr 进入脱敏诊断。
- 实现双向 request/response/notification、pending request 上限、取消、deadline、EOF、畸形 JSON、迟到 response 和 child exit 语义。
- 启动顺序固定为 `initialize -> initialized -> thread/start|resume -> turn/start -> item/delta/completed -> turn/completed`。
- renderer 永远看不到 stdin/stdout、RPC id、原始 transport 或 app-server 进程句柄。
- app-server 重启时由 main 重新建立连接并恢复活动 thread；禁止回退旧 daemon。

### 4.2 Codex Home 与 Electron 状态

```text
标准 CODEX_HOME/
  config.toml / auth / skills / sessions / rollout JSONL / SQLite  # 原生 Codex 所有

Electron app-state/
  window / workspace index / UI settings / migration status        # BlackRain 所有

Electron browser-data/
  persist:blackrain-browser-app Cookie/Cache/Service Worker       # Browser 所有
```

Electron 不直接修改 Codex rollout/SQLite；只通过 app-server 读取和写入 thread。用户显式指定的 `CODEX_HOME` 也必须经过 main 校验并与 `app-state/browser-data` 分离。`app-state` 的 workspace/thread 索引必须带规范化的 `codexHomeId`（默认 Home 或用户显式选择的 Home 标识）和 `profileId`；切换 Home/profile 时旧索引不得跨域恢复。Codex 登录 auth 的规范副本仍由原装 `codex.exe app-server`/标准 `CODEX_HOME` 按 Codex 原生语义管理，Electron 不读取、复制或改写该文件；BlackRain 自有 provider secret、credit token 和 Gateway 运行时凭据才进入 `safeStorage` 或专用运行时桥。

### 4.3 Browser

- main 创建和持有 `WebContentsView`；renderer 只上报经过 schema 校验的 bounds、visibility、active tab 和遮挡状态。
- 页面固定 `sandbox=true`、`nodeIntegration=false`、`contextIsolation=true`、`webSecurity=true`、禁止 popup/不安全内容；页面不得加载 App preload。
- Browser backend 按 `window/thread/route/profile/viewGeneration` 校验所有请求；旧 generation、跨 thread/profile、错误 owner 一律 fail closed。
- 生产工具链只使用标准 stdio MCP + 随包 Node adapter + BlackRain Browser client + 鉴权本地 transport；dynamic tools 和 main 自加载 bridge 只保留测试/bootstrap。
- transport 使用随机 endpoint、目标用户 ACL、256-bit token、client id、4-byte LE framing、8 MiB frame 上限和断连 teardown。
- 用户主动键盘/鼠标/滚轮/上下文菜单立即中止 agent 输入；`turnEnded` 统一执行 tab finalize、debugger/OOPIF/capture 清理和控制权释放。

### 4.4 Host API 与安全

- preload 只暴露命名方法、输入 schema 和取消订阅函数，不暴露原始 `ipcRenderer`、Node、`webContents.id` 或任意 channel。
- main handler 必须校验 sender、窗口角色、参数 schema、workspace/thread ownership、profile 和 generation。
- 外部链接只允许 `http`、`https`、`mailto`；文件路径必须是规范化绝对路径且属于已登记 workspace。特权 shell helper 的 executable/args 由 main 固定 allowlist 生成；交互式终端输入只允许进入已创建、绑定 workspace/thread 的 ConPTY 会话，不等同于任意 IPC command 透传。
- BlackRain 自有凭据使用 Windows DPAPI/Electron `safeStorage`；日志只保留不含 secret 的结构化诊断，Codex auth 不由 Electron 读取或复制。

## 5. 生命周期与失败合同

### 5.1 启动

`app ready -> load app-state -> create bootstrap window -> start app-server -> initialize -> restore workspace/thread -> attach Browser views`。窗口必须先于 app-server 创建，以便未登录、启动失败或恢复失败时显示 degraded/retry/diagnostics 状态；不得静默启用 Tauri/daemon。bootstrap window 与完整产品窗口使用同一 Electron renderer 路径；初始化成功后只切换状态，不切换宿主路由。首次未登录时 app-server 可以保持可用的 unauthenticated 状态，认证入口由 typed host API/标准 Codex Home 流程显式触发。

### 5.2 App Server 失败

EOF、协议错误、超时、child exit 或异常 stderr 洪泛时：停止向 renderer 扇出不完整事件，标记 runtime degraded，清理 pending request，按上限重启并恢复；超过重试上限则提供明确错误和导出诊断入口。

### 5.3 Browser 失败

页面崩溃、target 丢失、token/generation 失效或 transport 断连时：立即撤销 agent 控制、清理 listeners/overlay/capture、保留用户可见 tab 和登录态，允许重新 attach；禁止留下仍可接收 agent 输入的页面。

### 5.4 更新失败

下载、签名、安装或首启失败时保留旧版本可启动；更新状态、日志和回滚原因写入 app-state；升级脚本必须可检测并清理孤儿 helper/子进程。

## 6. 执行依赖

```text
G0 盘点/版本锁/账本
  -> G1 安装态基础壳与 degraded/retry 入口
  -> G2 app-server / 标准 Home / thread/turn
  -> G3 文件/Git/终端/设置/更新等宿主能力
  -> G4 Browser Windows 回归
  -> G5 删除 Tauri/daemon/NSIS/fallback
  -> Native Clean Gate 产品树和制品零 Tauri 残留
  -> G6 签名 MSIX 发布矩阵与性能基线
```

任何阶段出现未迁移的可见入口，必须先隐藏/禁用，不能以点击后失败作为兼容策略。每个阶段退出前同时更新 `tasks.md`、`verification.md`、账本和受影响的产品/命令文档。

## 7. 打包与供应链

- Electron Forge + Vite + MSIX maker 是唯一目标发布链。
- MSIX 进入 `codex.exe`、锁定版本 helper、Node 22 runtime、标准 stdio MCP adapter、Browser client、License/NOTICE 和必要资源；ASAR 中固定 main/preload/renderer/page preload hash。
- 启用 Electron fuses（包括关闭 `RunAsNode`），对 Codex、Node、adapter、client 和原生模块执行 archive/逐文件 SHA-256、License 和 Authenticode gate。
- 正式签名只在受控 Windows 签名环境执行；普通 CI 不保存长期私钥。
- MVP 更新采用受信 MSIX/App Installer 包链：UpdateManager 只负责检查已签名 manifest、下载到 staging、校验 publisher/hash 并交给 Windows 安装器；禁止应用内覆盖当前运行文件。升级失败时保留当前版本可启动，回滚通过保留的上一版签名 MSIX 重新安装完成，并记录版本、manifest、原因和制品 hash。
- release 打包后必须解包扫描，拒绝 `tauri`、`src-tauri`、Rust daemon、旧 NSIS、固定端口和未登记原生二进制；扫描允许列表只能包含 Electron/Codex/Node/Browser 和已审计依赖。

## 8. 测试策略

- 单元：main service、schema、ownership、credential store、workspace/Git/terminal/update、renderer adapter/reducer。
- 集成：stdio JSONL、真实 Node 子进程、bundled app-server、标准 Home、approval/server request、ConPTY、进程树、Git 和 Browser transport。
- E2E：production bundle 的 UI、workspace/thread/turn、设置、对话框、Browser 同页控制、下载、接管、App restart recovery。
- 产品：正式签名 MSIX 的安装、首启、鼠标/键盘、登录/MFA、输入法、DPI、多屏、睡眠恢复、升级、回滚、卸载、残留和性能。性能门禁至少记录冷启动到首个可交互窗口 P95、app-server 恢复 P95、稳态工作集和退出后孤儿进程；具体阈值必须在 G6 前固化到发布报告，不能在测试后临时改变。
- 所有证据写入 `verification.md`，明确属于 `CODE_EXISTS`、`RUN_PASS`、`PRODUCT_PASS` 或 `PRODUCT_FAIL`。
