# 可移植 Electron Browser Runtime 任务

> 只记录未完成工作。每项必须区分 `CODE_EXISTS`、`RUN_PASS` 和 `PORTABILITY_PASS`；BlackRain `PRODUCT_PASS` 只写入 `002-electron-migration/verification.md`。

## 使用规则

- 任务按 B0-B6 顺序推进；跨阶段并行不得跳过公共合同和单 backend 约束。
- 修改现有 Browser 产品行为时，同步 `002` 对应任务/验证。
- reference host、fake Agent 或静态扫描通过不能替代 BlackRain packaged/Windows 产品回归。
- 不创建第二 registry/session/CDP/backend；迁移 facade 必须有删除项。
- 只有命令和 fixture 真正进入仓库后，才把它们加入 `docs/commands.md`。

## B0：边界盘点与基线冻结

- [ ] `B0-01` 生成 Browser source inventory，覆盖 `electron/main/browser`、shared browser contracts、preload/IPC、React BrowserSidebar、resources/browser-client、scripts、tests 和 Forge package 资源。
- [ ] `B0-02` 将每个文件/符号分类为 `contract`、`core`、`electron-host`、`blackrain-adapter`、`codex-adapter`、`product-ui`、`test-only` 或 `delete`。
- [ ] `B0-03` 记录当前 import graph 和耦合清单：App Server RPC、BlackRain IPC/Host API、thread/turn/route、固定 app-data、React UI、Codex MCP 参数。
- [ ] `B0-04` 冻结当前 Browser 行为回归基线和现有命令；把可审计运行结果分别写入 `002` 与本 spec。
- [ ] `B0-05` 冻结 runtime constructor/composition entry、Node 模块解析、tsconfig alias、workspace hoist、直接/传递依赖与第三方 License/NOTICE 基线。

## B1：公共合同与依赖闸口

- [ ] `B1-01` 定义中性的 `BrowserScope`、host owner ref 与 main-owned opaque owner lease；host ref 只能由真实 BrowserWindow/owner webContents 签发，owner lease 绑定 owner/surface/profile、host ref 和 generation，raw ID 或结构相同对象不能授权。
- [ ] `B1-02` 定义带 generation 的 activity lease 与单活动状态机，覆盖 begin/complete/cancel/timeout/disconnect/user takeover 和迟到调用拒绝。
- [ ] `B1-03` 定义 versioned transport-agnostic Browser control、layout、Agent capability 和 tab/view/document generation schema；公共入口暴露 `browser-runtime/v0` 与 source revision/hash，所有有状态调用必须携带 owner/activity lease，具体 tool 名由 adapter 映射。
- [ ] `B1-04` 定义唯一 typed event stream，不允许 core/electron implementation 直接发送 BlackRain IPC 或建立第二事件出口。
- [ ] `B1-05` 定义 permission/download/file chooser/dialog/popup/external protocol/sensitive action DecisionPort，包括 request correlation、origin、expiry、abort、幂等和默认拒绝。
- [ ] `B1-06` 建立 Browser Runtime 单一公共入口，导出消费者需要的类型和生命周期 API，不暴露 lease capability、Electron session/Cookie/raw IPC、任意 partition/path。
- [ ] `B1-07` 增加静态依赖检查，禁止 core import Electron、App Server、Codex/MCP、BlackRain Host API/IPC、renderer/React 和固定 BlackRain data path，并限制 constructor/composition entry。
- [ ] `B1-08` 为公共合同增加 schema/unit/compile-time consumer tests，以及伪造 raw ID、伪造 lease 外观、跨 profile、旧 lease、并发第二 activity 和迟到 decision 的负向测试。

## B2：核心与 Electron Host 解耦

- [ ] `B2-01` 拆分 `BrowserViewManager` 的 registry、owner lease、layout、view lifecycle、decision/event dispatch 和 persistence 职责。
- [ ] `B2-02` 把 `BrowserWindow.fromId`、`contentView.addChildView` 和 window/webContents generation 收口到 Electron host adapter/port；renderer event send 改为订阅唯一 runtime event stream。
- [ ] `B2-03` 将 session store 的数据根目录、受校验 profile namespace、ID/time 来源和损坏恢复策略改为显式依赖；拒绝任意 path/partition、路径逃逸和 namespace 冲突。
- [ ] `B2-04` 保持 CDP/OOPIF、snapshot/locator/CUA、隐藏 capture 和 page generation 作为同一核心能力，并补抽取回归测试。
- [ ] `B2-05` 保持 permission/download/dialog/file chooser/external protocol/sensitive action 默认拒绝和 main-owned policy。
- [ ] `B2-06` composition root 只创建一次 runtime 并显式注入所有 adapter；删除完成切换后的旧 facade/import，结合 constructor/import gate 与 runtime identity test 证明单进程、单 profile 只有一个活动 backend。

## B3：BlackRain 与 Codex Adapter

- [ ] `B3-01` 实现 BlackRain host adapter，将可信 window registry、profile、typed IPC 和 layout 映射到 owner lease，并通过唯一 event subscription 扇出 tabs/policy/lifecycle event。
- [ ] `B3-02` 将 `threadId/routeKey/profile` 映射到公共 scope/owner lease，将 `turnId` 映射到 activity lease；transport metadata 只能查找既有映射，公共合同扫描不得再出现这些专有字段。
- [ ] `B3-03` 将 App Server server request/dynamic tool bootstrap 从 Browser 核心移入 Codex adapter。
- [ ] `B3-04` 将标准 stdio MCP、随包 Node adapter、browser client transport 和 capability lifecycle 收口到 Codex/BlackRain integration。
- [ ] `B3-05` 保持发布态只有标准 stdio MCP 路由；dynamic tools 和 main self-load 继续只作测试/bootstrap。
- [ ] `B3-06` 增加 BlackRain composition test，断言 IPC、标准 stdio MCP 和测试/bootstrap adapter 使用同一 runtime identity，随后运行 Browser unit/integration/E2E 与 host-boundary 回归并把产品状态写入 `002`。

## B4：最小参考宿主与非 Codex Agent 示例

- [ ] `B4-01` 创建不依赖 BlackRain App Server、Host API、workspace/thread/settings/account 和 React BrowserSidebar 的最小 Electron reference host。
- [ ] `B4-02` reference host 实现最小 preload allowlist、tab/navigation controls、bounds/visibility/occlusion 上报和 runtime event 展示。
- [ ] `B4-03` 创建 in-process fake Agent adapter，通过公共 tool contract 执行 list/new/goto/snapshot/locate/click/type/screenshot/finalize。
- [ ] `B4-04` 提供本地 HTTP/HTTPS fixture，使用独立 app-data/profile 验证 Cookie/伪登录态、Service Worker、权限、下载、dialog、popup、OOPIF、crash、重启恢复和恢复后的显式清理；不使用个人账号或 BlackRain 用户数据。
- [ ] `B4-05` 增加 source consumer compile/package/E2E gate：在仓库外新临时目录使用独立 manifest/lockfile 安装依赖，清除 `NODE_PATH`，禁止继承根 tsconfig、path alias、workspace hoist、父级 `node_modules` 和未声明脚本。
- [ ] `B4-06` 扫描 reference host 与完整依赖闭包，不得 import BlackRain/Codex 私有模块；生成可重建的第三方 License/NOTICE 清单和模块解析证据。

## B5：安全、稳定性与可移植性验证

- [ ] `B5-01` 验证页面 sandbox/context isolation/Node off/web security/webviewTag off 和默认无 page preload。
- [ ] `B5-02` 验证伪造 raw ID/lease 外观、错误 owner/surface/profile/tab/view/document generation、旧 owner/activity lease、并发第二 activity、用户接管后迟到写和未授权调用全部 fail closed。
- [ ] `B5-03` 验证 permission/download/dialog/file chooser/popup/external protocol/sensitive action 在 decision port 缺失、异常、超时、取消以及 decision 重复/迟到/跨 origin 时默认拒绝。
- [ ] `B5-04` 验证 renderer crash、page crash、Agent disconnect、App restart、sleep/resume 和异常退出后的恢复与资源清理。
- [ ] `B5-05` 验证多窗口 reparent、隐藏运行、DPI、多屏、IME、焦点、z-order 和 modal occlusion。
- [ ] `B5-06` 冻结 Windows reference host 的冷启动、恢复 P95、稳态工作集、live tab 上限和孤儿进程阈值。

## B6：二次开发交付

- [ ] `B6-01` 编写 source integration guide：源码 revision/hash、v0 版本匹配、目录、初始化、host port、preload、layout、events、persistence、policy、Agent adapter、dispose。
- [ ] `B6-02` 编写 adapter cookbook，至少覆盖纯用户浏览、in-process Agent 和 MCP/外部进程三种接入方式。
- [ ] `B6-03` 编写安全责任清单，区分底座保证、宿主必须实现和禁止暴露的能力。
- [ ] `B6-04` 从仓库外空白 Electron fixture 按文档重新接入并完成 hermetic `PORTABILITY_PASS`，记录环境、独立安装、模块解析、命令、日志、截图、资源和清理结果。
- [ ] `B6-05` 更新 README、04、09、commands、第三方 License/NOTICE 审计和对应 spec；未取得对外授权决策时，不改写项目分发许可证、不声明公开 SDK/开源发布。
- [ ] `B6-06` 清理失效兼容代码、重复事件出口、额外 constructor/composition entry 和悬空文档，重跑静态扫描与 runtime identity test。

## 对外分发门禁（不计入 `PORTABILITY_PASS`）

- [ ] 单独批准版权、商业授权、项目分发许可证、版本策略和分发渠道。
- [ ] 只有批准后才更新对外 License/NOTICE/发布文档并执行独立分发审计；未批准时只能记录内部源码底座技术状态。

## 依赖关系

```text
B0 inventory
  -> B1 contracts/gates
  -> B2 core extraction
  -> B3 BlackRain/Codex adapters
  -> B4 reference consumer
  -> B5 portability/security matrix
  -> B6 documentation/delivery
```

`B2` 与 `B3` 可以按小步切片交替推进，但每个切片必须保持 BlackRain 只连接一个 backend。
