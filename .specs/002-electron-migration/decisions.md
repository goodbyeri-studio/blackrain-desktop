# Electron 全量迁移 MVP 决策

> 决策只定义路线和边界，不自动证明实现或验证完成。验收状态只看 `verification.md`。

## 已决策

### 2026-08-03：Electron 全量迁移是唯一当前 P0

- 决策：结束 Browser 独立 P0，将 Electron 全量迁移、Tauri/daemon 删除和 Windows 发布设为唯一当前 P0。
- 原因：Browser runtime/功能链路已有闭环，但真实安装态受 Electron 宿主未完成阻塞。
- 影响：所有 Electron 能力迁移、Browser 回归和 Windows 发布验收统一写入本 spec。
- 复查条件：Electron 成为唯一发布入口且 Tauri runtime/daemon 已删除。

### 2026-08-03：能力所有权优先于 command 兼容

- 决策：194 个 Tauri command 和 53 个 renderer direct import 必须逐项归属 `app-server`、`Electron main/preload`、`renderer-only`、`gateway` 或 `delete`。
- 不做逐 command 的永久 IPC 翻译层；避免复制 daemon/app-server 状态机和形成双宿主。
- `check:host-boundary` 只防新增依赖和未分类项，逐项功能状态由迁移账本维护。

### 2026-08-03：app-server 是 agent 唯一真源

- thread、turn、item、工具、审批、沙箱、停止、恢复和 ThreadStore 直接交给原装 `codex.exe app-server`。
- Electron main 只实现 stdio JSONL client、生命周期、权限边界和 UI 投影，不解析 TUI、不复制 Core event translator。
- 禁止长期保留 BlackRain daemon 或第二 agent runtime。

### 2026-08-03：标准 Codex Home 是默认状态域

- 默认沿用 CLI 标准 `CODEX_HOME`，共享 config/auth/skills/thread/rollout/SQLite。
- Electron `app-state` 和 Browser `browser-data` 分开管理；Electron 不直接修改 Codex ThreadStore 文件。
- 用户显式选择其他 Home 时必须由 main 校验，且不能创建隐藏 BlackRain 专属 Home。
- auth 的规范副本归原装 `codex.exe app-server`/标准 `CODEX_HOME`，Electron 不读取、复制或改写 auth 文件；BlackRain 自有 provider secret、credit token 和 Gateway 运行时凭据归 Electron `safeStorage`/专用运行时桥。

### 2026-08-03：Browser 生产链使用标准 stdio MCP

- 发布态只使用进程级标准 stdio MCP + 随包 Node adapter + BlackRain Browser client + 鉴权本地 transport。
- dynamic tools 和 main 自加载 bridge 只保留测试/bootstrap，不进入发布态第二路由。
- 不复制 OpenAI 私有 `nativePipe`、私有 client、bundled plugin 或闭源资源。

### 2026-08-03：Browser 页面由 main 独占

- main 创建并持有 `WebContentsView`、session、权限、下载、CDP 和 page lifecycle。
- renderer 只提交经过校验的 bounds、visibility、active tab、window generation 和遮挡状态。
- 网页不加载 App preload，不获得 `window.blackrain`、Node、原始 IPC 或 App Server transport。

### 2026-08-03：桌面特权能力进入 Electron main

- 文件、Git、终端、设置、凭据、窗口、菜单、对话框、通知、快捷键、深链、更新和诊断由 main 领域模块负责。
- renderer 只使用 typed preload；所有输入经过 schema、sender、window、workspace/thread ownership 和 generation 校验。
- 外部链接仅允许 `http`、`https`、`mailto`；任意路径、命令、channel、CDP method 不得透传。

### 2026-08-04：Windows Electron MSIX 是唯一 MVP 发布形态

- Electron Forge + Vite + MSIX maker 是唯一目标发布链。
- Tauri NSIS 只作为迁移输入，不能继续作为 Electron MVP 的 fallback 或发布入口。
- 正式签名、安装、升级、回滚、卸载和残留检查全部通过后，才可创建 release。

### 2026-08-04：以 G0–G6 作为发布闸口

- G0 盘点冻结、G1 安装态、G2 Codex 核心、G3 宿主、G4 Browser、G5 删除旧宿主、G6 Windows 发布必须按顺序完成。
- 任一闸口失败时，状态只能是 `CODE_EXISTS`、`RUN_PASS` 或 `PRODUCT_FAIL`，不能标记为 MVP 可交付。

### 2026-08-04：G1 只验收安装态基础壳，G2 才验收 Codex 核心

- 决策：G1 不再要求 thread/turn、审批或恢复；它只证明正式签名候选 MSIX 可安装、首启、窗口可点击，并能在 app-server 未启动/未登录时显示 degraded/retry/diagnostics。
- 原因：thread/turn 和 app-server 生命周期属于 G2，不能在其实现之前作为 G1 的前置条件。
- 影响：G1 通过不代表 Codex 核心可用；G2 必须在 G1 后单独完成核心流程验收。

### 2026-08-04：最终态采用 Electron 原生重建，不保留 Tauri 兼容表面

- 决策：迁移完成的验收目标是“从一开始就由 Electron 实现”的产品形态；Tauri 只作为行为盘点和迁移输入，不能成为最终源码、公共 API、依赖、构建或制品的一部分。
- 不接受：Electron/Tauri 双运行时、Tauri command 到 Electron channel 的永久一对一翻译、运行时探测后 fallback、Rust daemon 旁路、固定 localhost 端口。
- 允许：`.specs/**`、`docs/04`、`docs/09`、`docs/10`、`docs/commands` 和 Git 历史保留迁移审计事实；生产源码、用户可见文案和 release package 不保留旧宿主术语或文件。
- 影响：G5 后增加 Native Clean Gate；host-boundary 检查必须从迁移期 baseline 模式切换到 final zero-tolerance 模式。
- 复查条件：解包 MSIX、生产源码、package/lock、Forge/scripts/CI 和用户可见文案的禁词/文件扫描均为零；内部真源文档通过分层 allowlist 审计，且开发、打包、安装三种形态使用同一 Electron 路径。

### 2026-08-04：MVP 更新采用签名 MSIX 包链

- 决策：UpdateManager 只检查签名 manifest、下载 staging 包并交给 Windows 安装器；禁止应用内覆盖正在运行的 Electron/Codex/Node 文件。
- 升级失败时保留当前版本可启动；回滚通过保留的上一版签名 MSIX 重新安装完成，并记录版本、manifest、原因和 SHA-256。
- 影响：`D-02` 的更新通道实现必须满足该合同；正式发布前仍需补齐证书、runner、审批人和制品保留周期。

### 2026-08-04：内部架构文档与用户文档分层扫描

- `.specs/**`、`docs/04-产品形态.md`、`docs/09-运行时架构与里程碑.md`、`docs/10-Electron迁移与内置浏览器实现计划.md`、`docs/commands.md` 属于内部真源/迁移审计文档，可保留当前 Tauri 历史和迁移状态，但必须明确当前态与目标态。
- README、设置/帮助/关于/更新/卸载等用户可见文案和 release package 仍执行 zero-tolerance，不得出现 Tauri/Rust daemon/兼容模式术语。
- Native Clean Gate 的扫描器必须按上述边界实现，不能用“全仓库零字符串”替代分层规则。

## 待决策（必须在对应闸口前关闭）

- [ ] `D-01 / G1`：签名 MSIX 全页面不可点击的最终根因、修复方案和 Windows 实机复验责任人。
- [ ] `D-02 / G4-G6`：补齐签名证书/runner、发布审批、升级失败回滚演练和制品保留周期；更新拓扑已冻结为签名 MSIX/App Installer 包链。
- [ ] `D-03 / G4-G6`：`node-pty` Windows helper、ConPTY、原生模块签名、MSIX 资源清单和进程树清理方案。
- [ ] `D-04 / G6`：MVP 最低 Windows 版本、DPI/多屏/输入法支持矩阵和可接受性能阈值。

## 兼容层删除合同

任何迁移期 fallback 必须在账本登记：

```text
fallback 位置 -> 替代 Electron API -> 当前调用者 -> 删除任务 ID -> 删除验证命令
```

未登记或没有删除任务的兼容层不得合入；G5 关闭时必须静态搜索确认不存在永久 fallback。
