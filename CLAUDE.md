# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

回复、文档和代码注释默认使用简体中文。代码、命令、配置键、路径和 API 名称保持原文。

## 先读 AGENTS.md

架构铁律、产品边界、线程显示不变量和目录纪律的真源是 [AGENTS.md](AGENTS.md)，本文件不复述。

三条最容易违反的：

1. **不 fork、不重写、不平行实现 codex agent loop。** BlackRain Desktop 是**外壳，不是 agent**——它启动原装 `codex app-server`，用 stdio JSONL 通信，把事件投影成 UI。thread、turn、审批、停止、恢复和持久化**全部由 app-server 拥有**。理解这一点是理解整个代码库的前提。
2. **使用标准 Codex Home**（`~/.codex`，见 `apps/desktop/electron/main/app-server/codex-home.ts`），与原生 CLI 共享配置、认证和可恢复 thread。
3. **Electron 是唯一生产宿主，macOS 是唯一发布目标。**

本文件只记录 AGENTS.md 里没有的工程细节：命令的真实行为、门禁的扫描范围、环境陷阱和实测发现。

## 命令

所有命令从 `apps/desktop/` 执行（Node.js 22.12–22.x；CI 用 22.23.2）。

```sh
npm ci
npm run electron:start        # electron-forge start，开发主入口
npm run dev                   # 仅 vite renderer（无宿主 API，多数功能不可用）
```

提交前的标准验证链，**顺序与 CI 的 `js-checks` 一致**：

```sh
npm run typecheck             # tsc --noEmit + tsconfig.electron.json
npm run lint                  # eslint 9 flat config（含 DS 守卫与类型感知规则）
npm run test                  # vitest run，1147 tests（1123 passed / 24 skipped）
npm run check:host-boundary   # Native Clean Gate
npm run codemod:ds:dry        # 应报告 changed=0
npm run build                 # renderer 构建，捕获 vite 配置/别名/import 问题
```

跑单个测试文件或单个用例：

```sh
npx vitest run electron/main/browser/browser-client-transport.test.ts
npx vitest run src/features/threads/hooks/useThreadsReducer.test.ts -t "reconciliation"
npm run test:watch
```

改了任意 Markdown 后，从仓库根执行 `node scripts/check-doc-links.mjs`（CI 的 `docs-checks`）。改了 `gateway/` 后跑 `python -m unittest discover -s gateway -p 'test_gateway*.py'`（CI 的 `gateway-checks`，Python 3.13）。

CI 按改动路径路由：`js-checks`（Linux 全链）与 `macos-tests`（仅 `npm run test`）并行，汇总门禁是 `Required quality gate`。完整命令与发布边界见 [docs/development.md](docs/development.md)。

`electron:make` 目前**只有 `MakerMSIX`**，没有 macOS maker、签名或公证——不要用它推导 macOS 发布流程。

### ⚠️ `typecheck` 覆盖不到构建配置文件

`npm run typecheck` 是 `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`。第一条用 `tsconfig.json`，而 **`tsc` 不会跟进 `references`**——`tsconfig.json` 引用的 `tsconfig.node.json` 是唯一包含 `vite.config.ts` / `vite.main.config.ts` / `vite.preload.config.ts` / `forge.config.ts` 的项目，所以它不被任何 npm script 或 CI 步骤检查，只有 IDE 会构建它。

改这四个文件后手动补一条：

```sh
npx tsc -p tsconfig.node.json --noEmit
```

它是 `composite: true` 项目，`tsc --build` 会在工作树写 `*.tsbuildinfo`（已 gitignore）。

### 首次开发前必须 vendored runtime

`codex app-server` 和 Browser MCP 用的 Node 都是 vendored 上游制品，不入库：

```sh
npm run electron:runtime:vendor        # codex，约 120MB
npm run electron:node-runtime:vendor   # Node，约 50MB
npm run electron:runtime:verify
npm run electron:node-runtime:verify
```

版本、URL、SHA-256 和签名身份锁在 `resources/{codex,node-runtime,browser-client}/runtime-lock.json`。CI 只跑 `*:check-lock`（结构校验），不校验二进制。

开发时可用 `BLACKRAIN_CODEX_BIN` 指向本机 codex 二进制，仅 `!app.isPackaged` 时允许（见 `electron/main/app-server/codex-executable.ts:34`）。

## 事件流（改 thread UI 时的必经路径）

app-server 事件从 main 标准化后扇出到 renderer，链路固定：

```text
electron/shared/agent.ts              方法名与 typed parsing helper（真源）
  → src/utils/appServerEvents.ts      SUPPORTED_APP_SERVER_METHODS + 解析
    → src/features/app/hooks/useAppServerEvents.ts   路由
      → src/features/threads/hooks/useThread*Events.ts   处理
        → src/features/threads/hooks/useThreadsReducer.ts  状态
          → src/features/messages/components/Messages.tsx  渲染
```

新增事件支持按这个顺序改，不要把条件判断散进组件。协议 payload 形状不符时优先改边缘（`appServerEvents.ts`、`useAppServerEvents.ts`、`threadNormalize.ts`）。

上游协议使用 `#[serde(rename_all = "camelCase")]` 但字段常声明为 snake_case，BlackRain 普遍同时兼容两种形式。当前上游锁：`rust-v0.146.0` / `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`。事件支持/缺失清单与 schema drift 排查见 [apps/desktop/docs/app-server-events.md](apps/desktop/docs/app-server-events.md)。

跨层改动的同步清单见[代码地图](apps/desktop/docs/codebase-map.md)的「修改合同」——缺一处 typecheck 或 sender/ownership 测试会挂。

## 两个自定义门禁

**`check:host-boundary`（Native Clean Gate）**——`scripts/check-host-boundary.mjs` 扫描约 788 个生产边界文件，命中任一模式即失败：`tauri`、`@tauri-apps`、`src-tauri`、`blackrain_daemon`、`127.0.0.1:4732`、`transformCallback`、`nsis`/`NSIS`、裸 `invoke(`、裸 `listen(`。写代码时避开这些标识符（**包括注释和文档**）。“裸 `invoke(`/`listen(`”只禁止无前缀调用，`server.listen(...)`、`foo.invoke(...)` 允许。

扫描范围是精确列举的，不是整仓：`apps/desktop/` 下的 `src`、`electron`、`public`、`resources`、`scripts`、`.github`，加仓库根的 `.github/workflows` 与 `scripts/`，再加 `apps/desktop/` 的具名顶层文件（`package.json`、`forge.config.ts`、`vite*.config.ts`、`README.md` 等）。`.md` 也在扫描的扩展名内，所以**在范围内的文档里写这些标识符同样会失败**——本文件位于仓库根、不在范围内，才能逐条列出它们。把上面这段复制进 `apps/desktop/README.md` 或任何 `src`/`electron`/`scripts` 下的文件都会让门禁挂掉。删除文件不会让门禁报错：`collectFiles` 与 `readFile` 都吞掉 `ENOENT`。

**Design System ESLint 守卫**——`eslint.config.mjs` 对约 20 个具名文件用 `no-restricted-syntax` 强制使用 DS primitive，而非手写 markup：

- modal → `ModalShell`（禁止 `<div role="dialog">`、`aria-modal`、`*-modal-overlay/backdrop/window/card`）
- panel → `PanelFrame` / `PanelMeta` / `PanelSearchField`（禁止裸 `<aside>`）
- toast → `ToastViewport` / `ToastCard` / `ToastHeader` / `ToastActions` / `ToastError`（禁止裸 `aria-live`）
- popover/dropdown → `PopoverSurface` / `PopoverMenuItem`（禁止 `<div role="menu|listbox">`）
- 这些文件中**禁止硬编码颜色字面量**（`#hex`、`rgb()`、`hsl()`），必须用 `src/styles/ds-tokens.css` 的 CSS 变量；`GitDiffViewer.tsx` 用 `ds-diff.css` 的主题变量

primitive 在 `src/features/design-system/components/`。`codemod:ds:dry` 应始终报告 `changed=0`。

**类型感知 lint**——`src/**` 与 `electron/**` 启用了 `no-floating-promises`、`no-misused-promises`、`await-thenable`。这些规则需要 `parserOptions.project` 同时列出 `tsconfig.json`（覆盖 `src`）和 `tsconfig.electron.json`（覆盖 `electron`）；只写前者会让 `electron/**` 报 “not found by the project service”。

**版本约束（勿轻易升级）**——ESLint 固定 9.x：`eslint-plugin-react@7.37.5` 的 peer 上限是 `^9.7`。TypeScript 固定 5.9.x：`typescript-eslint@8` 的 peer 上限是 `<6.1.0`，而 npm 上 `typescript@latest` 已是 7.x，误升会直接让 lint 失效。另：不要重新引入 `baseUrl`（TS 6 起 error 级弃用），`paths` 的值必须带 `./` 前缀。

## 代码组织约定

- 业务按 `src/features/<domain>/` 组织（28 个域）。`src/App.tsx` 只有 83 行，只做装配；复杂状态在 hooks / bootstrap / orchestration。
- 路径别名（`vite.config.ts` 与各 tsconfig 的 `paths` 必须同步）：`@` → `src/`，另有 `@app`、`@settings`、`@threads`、`@services`、`@utils`。
- 测试与实现同目录（`*.test.ts` / `*.test.tsx`），186 个测试文件。vitest 默认 `environment: "node"`；需要 DOM 的文件用 `// @vitest-environment jsdom` 顶部注解（117 个文件如此）。
- vitest 强制清空 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，让账号默认“未配置”；需要登录态的测试自行 mock `useAccount`。
- 完整领域索引见 [apps/desktop/docs/codebase-map.md](apps/desktop/docs/codebase-map.md)。

### `unavailableCapability` 的语义

`src/services/desktop.ts` 里有 193 处 `unavailableCapability`，它是 `Promise.reject(new Error("Desktop capability unavailable: ..."))`。**读到它不代表功能坏了**——正常形态是先派发、失败才回退：

```ts
const host = getOptionalHostClient();
if (host) return host.agent.forkThread({ workspaceId, threadId });
return unavailableCapability<any>("forkThread", { workspaceId, threadId });
```

缺少中间那行 host 派发的才是真缺口。已知两处：全部 8 个 `modelGateway*`（`electron/shared`、preload、main 里都没有对应通道），以及 `startThread:410`（但应用实际走 `useThreads.ts` / `useThreadActions.ts` 的 `startThreadForWorkspace`，该导出可能是遗留死代码，未追证）。

## i18n

文案集中在 `src/i18n/index.tsx`（约 1300 行），支持 `en` / `zh-CN` / `system`。两套 API（从 `useI18n()` 取）：

- `tx("English source")`——源字符串翻译，新页面文案首选。
- `t("namespace.key")`——命名 key，用于设置导航和长期共享文案。`enTranslations` 与 `zhCNTranslations` 的 key 必须完全一致，TypeScript 会校验。

插值统一用 `{name}`，翻译文本必须保留同名占位符。不要把一句话拆成多个 `tx()` 片段。不翻译用户内容、模型名、路径、命令输出、Git 分支名和 URL。完整流程见 [apps/desktop/docs/i18n.md](apps/desktop/docs/i18n.md)。

## 三个 macOS 环境陷阱

**`ELECTRON_RUN_AS_NODE=1` 可能在你的 shell 里。** 有它时 `npx electron foo.js` 会以**纯 Node** 运行，`require("electron")` 报 `MODULE_NOT_FOUND`。写临时 Electron 探针时必须 `env -u ELECTRON_RUN_AS_NODE`——`electron-smoke.mjs:43` 与 `electron-e2e.mjs:69` 都显式 `delete` 它，正是这个原因。

**Stage Manager 会在 `show()` 时缩小窗口。** 启用时（`defaults read com.apple.WindowManager GloballyEnabled` 为 1），窗口在**显示那一刻**被缩到舞台区域：`setBounds(1200)` 在 `show()` 前有效、`show()` 后立刻变 1028。所以设尺寸必须**先 `show()` 再 `setBounds()`**。与 Playwright 无关，纯 Electron 同样复现。

**Unix socket 端点长度（已修，勿回退）。** Browser transport 端点受 `sun_path` 上限约束（macOS 104 字节，见 `browser-client-transport.ts:471`）。**不要**把文件名改回 `blackrain-browser-<pid>-<uuid>.sock`——那是 65 字符，配 macOS 默认 `TMPDIR`（`/var/folders/<hash>/T/`，约 49 字节）会达到 114 字节：Electron 42 内置 Node 24 直接 `EINVAL`（**发行版里 Browser 起不来**）；Node 22 更危险，静默截短路径，不同随机后缀可能撞成同一端点。现在文件名是 `br-<pid>-<12 hex>.sock`（约 26 字符），超限时显式报错。回归用例在 `browser-client-transport.test.ts:48`。

## 实验性目录

`gateway/`（Python 协议翻译 sidecar）、`plugins/`、`workbenches/` 均为实验资源。`codex-upstream/` 是 gitignored 的只读上游参考克隆，用于对比协议，**不修改内核**。边界规则见 AGENTS.md 的目录纪律。

## Git 与许可证

`main` 禁止直接 push。短命分支 `<type>/<short-description>`，Conventional Commits（英文 type + 描述），CI 通过后 squash 合并。完整流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

维护者可自行合并（分支保护 `bypass_pull_request_allowances`）。注意 `gh pr view` 的 `mergeStateStatus` 仍显示 `BLOCKED`——它不区分查看者权限；真正的判据是 GraphQL 的 `viewerCanMergeAsAdmin`，合并用 `gh pr merge --admin --squash`。团队约定仍要等 `Required quality gate` 变绿。

自有代码 MIT（[ADR 0005](docs/adr/0005-mit-relicense.md)，取代 0004 的 AGPL 双授权）。新增依赖必须先确认许可证——MIT 发行物混入 copyleft 依赖会让整个发行边界失效，比 AGPL 时期更严重。
