# BlackRain Desktop 协作规则

Electron 是生产宿主；原装 `codex app-server` / `codex-rs` 是唯一 agent runtime。macOS 是当前发布目标；现有代码、未签名包、Windows 脚本和自动化不能证明 macOS 产品已经发布。

## 进程职责

```text
Electron main       App Server stdio client、窗口、Browser、权限、更新
Electron preload    类型化最小 IPC allowlist
React renderer      产品 UI 与前端状态
codex app-server    thread、turn、工具、审批和 ThreadStore 的唯一真源
Model Gateway       可选独立协议翻译 sidecar
```

## 不变量

1. 不修改、fork 或重建 `codex-rs` agent loop，不引入第二个 runtime 或状态真源。
2. main 通过 stdio JSONL 监管随包 `codex app-server`，并拥有其生命周期、权限边界和 UI 投影。
3. 使用标准 Codex Home；不得创建隐藏的 BlackRain `CODEX_HOME`、复制认证或维护第二个 thread store。
4. renderer 不接触 Node.js、原始 IPC、secret、App Server transport、文件系统或 Browser 页面所有权；preload 只暴露类型化 allowlist。
5. 每条 IPC 都校验 schema、sender、window、workspace/thread、route 和 generation ownership。
6. Browser 页面不得加载应用 preload；`WebContentsView`、session、下载、CDP、权限和生命周期只由 main 持有。
7. Browser 生产控制使用标准 stdio MCP、随包 Node adapter 与鉴权 transport；测试桥接不是生产路径。
8. Gateway 仅转换 provider 协议，不拥有 thread、Browser 或 UI 状态。
9. `plugins/`、`workbenches/` 是实验内容，未经明确设计和验证不得成为发行依赖。

## 线程显示不变量

- `setThreads` reconciliation 保留必要的 active/processing/ancestor anchors 与 incoming order。
- `hiddenThreadIdsByWorkspace` 优先，不得在 reconciliation 中复活隐藏 thread。
- `useThreadRows` 仅在 parent summary 可见时将 child 放在 parent 下；缺 parent 时 child 提升为 root。

## 验证

```sh
cd apps/desktop
npm run typecheck
npm run test
npm run lint
npm run check:host-boundary
npm run electron:runtime:verify
npm run electron:node-runtime:verify
npm run electron:browser-client:verify
npm run electron:app-server:probe
npm run electron:package
npm run electron:smoke
npm run electron:e2e
```

macOS 发布还需要签名、公证、安装、登录/MFA、Browser 权限/下载、崩溃恢复、升级、回滚和卸载的实机证据。矩阵完成并通过前，不得宣称 `PRODUCT_PASS`。

保留无关用户改动。使用短命分支、Conventional Commits、review 与 CI；行为或公共边界改变时更新 `../../docs/` 中相应真源。
