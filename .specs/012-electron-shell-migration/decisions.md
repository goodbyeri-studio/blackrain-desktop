# Electron 桌面壳迁移决策

## 2026-07-26：Electron 是唯一目标桌面宿主

- 决策：BlackRain 从 CodexMonitor 衍生的 Tauri 壳完整迁移到 Electron，不维护两个正式宿主。
- 原因：in-app browser、持久 session、`WebContentsView`、CDP、下载和权限控制是 P0；Electron 提供更直接、可产品化的宿主原语。
- 替代方案：继续在 Tauri/WebView2 上建设原生浏览器控制层；不采用。
- 影响范围：桌面进程、IPC、打包、更新、CI、Windows 验收和文档体系。

## 2026-07-26：保留 React 和 Rust daemon（已被 2026-07-29 决策替代）

- 决策：复用现有 React UI；现有 Rust shared core 和 daemon 继续承担领域逻辑与 codex app-server 监管。
- 原因：迁移目标是替换桌面宿主，不是把已经存在的 Rust 能力重写成 TypeScript。
- 替代方案：Electron main 全面重写 Rust 后端；不采用。
- 影响范围：迁移顺序、RPC 合同、目录布局和测试策略。

## 2026-07-26：先完成真实纵向切片（拓扑已被 2026-07-29 决策修正）

- 决策：全量迁移前必须先证明 Electron + Rust daemon + Codex thread + 持久浏览器在 Windows 上成立。
- 原因：浏览器生命周期、安全隔离、打包和资源开销是决定迁移质量的关键风险。
- 影响范围：第一阶段任务和 go/no-go 证据。

## 2026-07-27：Codex App 是 Electron 与 Browser 第一实现基线

- 决策：三份 2026-07-26 本机研究稿确认的 Codex App 进程边界和 Browser 控制面，优先级高于 ClawX、Hermes 等开源 Electron 项目。
- 原因：BlackRain 的产品目标是补齐完整 Codex App 宿主能力；ClawX/Hermes 的可见页面与 agent browser 分离，不满足共享 IAB。
- 允许差异：必须使用自有代码、公开 app-server 合同和可审计 transport，不复制私有 bundle、Browser client 或资源。
- 影响范围：012/013、03/04/09/10、Browser 宿主原语和验证矩阵。

## 2026-07-27：main/daemon 生产连接收敛为双向 stdio（已被 2026-07-29 决策替代）

- 决策：Electron main 作为父进程启动 daemon，目标生产连接为双向 stdio JSON-RPC；固定 `127.0.0.1:4732` 不进入 Electron 生产态。
- 原因：本地 sidecar 不需要网络监听；Browser tool server request 要求 daemon 能主动请求 main；子进程管道还可减少同用户端口发现与 token 泄漏面。
- 迁移例外：首个切片若复用 TCP，只允许动态 loopback endpoint + 随机 token，并必须同时建立删除任务。
- 影响范围：daemon transport、日志、恢复、集成测试和打包。

## 2026-07-27：Windows 打包采用 npm + electron-builder/NSIS 方向（已被 2026-07-29 决策替代）

- 决策：保留现有 npm/`package-lock.json`；Windows MVP 以 `electron-builder` + NSIS 为打包实现方向，daemon/codex/Gateway 使用 `extraResources`。
- 原因：与现有前端包管理一致，且 ClawX/Hermes 已提供成熟 Electron Windows 工程参考。
- 未决：签名证书、更新制品源、发布密钥和回滚保留策略仍需独立验证后落档。
- 影响范围：构建目录、CI、ASAR、fuses、签名、更新和 License。

## 2026-07-29：目标进程拓扑直接采用 Codex Desktop App 架构

- 决策：保留 React UI；Electron main 直接启动 bundled `codex.exe app-server` 并实现 App Server client。目标运行时不保留 BlackRain Rust daemon 中间层。
- 证据：本机 Codex MSIX、进程树和 Electron main bundle 共同确认 main 使用三根匿名管道直接连接 `codex.exe app-server`。
- 协议：stdin/stdout 使用省略 `jsonrpc` 字段的逐行 JSON request/response/notification，stderr 独立用于日志与诊断。
- 迁移影响：当前 daemon/shared core 仅作能力盘点与迁移输入；app-server 已有能力直接接入，剩余桌面宿主能力归 main/preload，daemon/remote backend 最终删除。

## 2026-07-29：沿用标准 Codex Home 与 ThreadStore

- 决策：目标 App 与原生 CLI 共享标准 Codex Home，不创建 BlackRain 专属隐藏 `CODEX_HOME`。
- 持久化：rollout JSONL 是规范 thread 历史；SQLite 是查询/元数据投影及其他结构化状态；Electron 不直接修改这些文件。
- 隔离：Electron/Chromium user-data 与 Codex Home 分离，Browser Cookie 和 Web 状态不进入 thread 或 Codex 日志。

## 2026-07-29：Home 选择、bundled codex 与 Gateway 配置相互解耦

- 默认模式：Electron app-server 子进程继承标准 Home 解析和父进程显式 `CODEX_HOME`，因此与原生 CLI 共享 auth、config、sessions、rollout 与 SQLite。
- 显式隔离：只接受用户主动选择的绝对路径；不得根据 BlackRain 安装目录、app-data 或 bundled `codex.exe` 自动派生隐藏 Home。UI 必须显示当前模式并允许切回共享模式。
- 二进制归属：BlackRain bundled `codex.exe` 使用独立、可校验的安装路径；二进制路径不决定状态目录，两者不能复用一个配置项。
- Gateway：`blackrain_gateway` provider、base URL 和默认模型仅以 app-server 进程级 `-c` override 注入，不再持久改写共享 `config.toml`。历史配置不自动删除，避免误删用户主动维护的同名配置；后续如清理，必须经过用户确认并做精确归属判断。
- 凭据：provider secret 与 credit JWT 的规范副本放系统凭据库；Gateway 所需 JWT 文件桥仅放 BlackRain app-data，停止/登出时清理。旧版 Codex Home JWT 文件只作一次迁移来源，凭据库保存成功后才删除。
- 影响范围：Electron process supervisor、当前 Tauri Gateway 兼容层、设置 UI、迁移测试和 Windows 凭据/卸载验收。

## 2026-07-30：默认 CODEX_HOME 改为 BlackRain Agent Data（同日已撤销）

- 决策：Electron 默认将 `CODEX_HOME` 指向 `%APPDATA%\BlackRain\agent-data`，不再默认继承 CLI 的标准 Home 或父进程 `CODEX_HOME`。
- 命名：目录使用产品语义 `agent-data`，不得使用 `codex-home`，避免用户误认为它属于官方 Codex CLI，也为未来迁移保留清晰边界；环境变量名 `CODEX_HOME` 属于原装 codex-rs 运行合同，保持不变。
- 数据分层：同一 `%APPDATA%\BlackRain` 根目录下使用 `agent-data`、`browser-data`、`app-state`、`logs`、`artifacts`；Electron `userData` 指向 `app-state`，Chromium `sessionData` 指向 `browser-data`。
- 兼容模式：用户可以主动选择共享 CLI Home，届时沿用 Codex 标准 Home 解析；也可以选择其他绝对路径。BlackRain 不自动复制、合并或改写 CLI Home。
- 持久化：rollout JSONL 与 SQLite 仍由原装 ThreadStore 独占管理；改变的是状态目录归属，不改变 schema、协议或唯一 agent 内核。
- 影响范围：Electron 启动目录、App Server supervisor、设置 UI、首次登录/导入、备份卸载和 Windows 验收。

## 2026-07-30：回归标准 Codex Home（当前决策）

- 决策：撤销同日的默认 `agent-data` 提案。Electron app-server 子进程默认不覆盖 `CODEX_HOME`，沿用标准解析和父进程显式选择，与原生 CLI 共享配置、能力和可恢复 thread。
- 原因：BlackRain 只替换桌面宿主，不应制造第二套 auth/config/session/rollout/SQLite 状态域；bundled `codex.exe` 的安装路径仍与 Home 归属解耦。
- 宿主数据：`%APPDATA%\BlackRain` 只保留 `browser-data`、`app-state`、`logs`、`artifacts` 等 Electron 宿主状态。
- 自定义：用户显式选择的绝对 Home 可以覆盖默认值，但 BlackRain 不自动复制、合并或改写 Home。
- 迁移：删除 Electron supervisor 的默认 `agent-data` 注入及目录创建；Tauri 遗留 `codex-home` 只作为迁移输入，目标态不得延续。

## 2026-07-29：Windows 工程对齐 Electron Forge + Vite + MSIX

- 决策：保留 npm/`package-lock.json`，使用 Electron Forge、Vite、TypeScript 和 MSIX maker；不再采用 `electron-builder`/NSIS 作为目标方案。
- 首个锁定候选：Electron `42.3.0`、Forge `7.11.1`、Vite `8.1.3`、TypeScript `5.9.3`、React `19.2.5`。
- 制品：MSIX 必须包含 `codex.exe` 及锁定版本实际需要的 code-mode/sandbox helper，并验证 Authenticode/MSIX 签名、hash、启动参数和进程清理。

## 2026-07-30：本地 Gateway capability 必须随机且运行文件原子更新

- 决策：显式 `BLACKRAIN_GATEWAY_API_KEY` 继续作为覆盖入口；未设置时由宿主或开发启动脚本生成每进程随机 capability，并把同一值传给 Gateway 与 app-server，不保留公开固定默认值。
- 并发：Gateway 使用 daemon-thread HTTP server，长 SSE 请求不得阻塞健康检查或其他 thread 的请求。
- 凭据桥：credit JWT 先写同目录随机临时文件，再用平台原子替换进入固定运行路径；Gateway 启动健康检查失败时立即终止已 spawn 的子进程。
- 边界：这些措施只保护迁移期 loopback Gateway，不把协议翻译并入 Electron main、renderer 或 codex-rs。

## 2026-07-30：生产 Electron 制品不携带 main/preload source map

- 决策：生产 main/preload bundle 不生成 source map，避免 ASAR 通过 `sourcesContent` 分发宿主与 preload 源码；renderer 的调试策略另行按发布配置审计。
- 打包：MSIX manifest 的 `appExecutable` 必须与 Forge `executableName` 一致，当前均为 `BlackRain.exe`。
- CI：Node 22 Windows job 必须执行 package、packaged smoke、Playwright Electron E2E 和 unsigned MSIX make；本地 make 通过不替代签名、安装、升级或卸载验收。
