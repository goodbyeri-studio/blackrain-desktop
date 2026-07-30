# Electron 桌面壳迁移任务

## 阶段 0：架构基线

- [x] 决策唯一目标宿主为 Electron
- [x] 决策保留 React，并让 Electron main 直接监管原装 app-server
- [x] 根据四份 Codex App 研究稿重建 Electron/App Server/Browser 目标控制面
- [x] 决策保持 npm，Windows 打包对齐 Electron Forge + Vite + MSIX
- [x] 盘点全部 Tauri command、plugin、window、event、resource 和打包依赖
- [x] 建立 Tauri -> Electron 能力迁移矩阵、owner、测试和删除闸口
- [x] 锁定 Electron 42、Forge 7、Vite 8、TypeScript 5.9、React 19 与 Node 版本，并完成 License、fuses、ASAR 和 CSP 基线
- [x] 将源码与官方 Windows package 锁升级到稳定版 `rust-v0.146.0` / `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`，高于调研版本基线；协议和 Windows 产品重验由后续任务单独验收
- [x] 盘点并锁定 canonical Windows package 的 codex.exe、code-mode host、ripgrep、command runner、sandbox setup、参数、hash、签名和 License；MCP/extension 继续由原装 app-server 按上游合同管理，不另造宿主 runtime
- [x] 锁定 canonical Windows package archive、六个必需文件、License/NOTICE 摘要与 Authenticode fail-closed vendor 合同，并在 Windows 本机实跑通过
- [ ] 确定签名证书、更新源、发布密钥和回滚方案
- [x] 为锁定 codex 运行 initialize 与 `thread/start.dynamicTools` 协议探针；真实 server request/tool result/cancel 仍由真实模型纵向切片验收
- [x] 用本机公开 `codex-cli 0.146.0-alpha.3.1` 验证 initialize 与 `thread/start.dynamicTools` schema；采用版本锁定后仍需重跑上一项

## 阶段 1：Electron 安全空壳

- [x] 建立 Electron main/preload/renderer 最小工程
- [x] 建立 `window.blackrain` 类型合同、schema 校验和 sender validation
- [x] 建立宿主无关 renderer client，禁止新增直接 Tauri 调用
- [x] 配置 sandbox、context isolation、自定义 protocol、CSP、导航和 popup policy
- [ ] 建立流式 notification 的有界队列，以及大消息分块/确认或 artifact 合同
- [ ] 接入 Sentry Electron/Node 与 OpenTelemetry，并验证日志不混入 App Server stdout
- [x] 建立 main/preload 单测和 packaged Electron 启动 smoke
- [x] 建立 Playwright Electron E2E smoke
- [x] 生产 ASAR 关闭 main/preload source map，并验证不包含内嵌源码

## 阶段 2：App Server client 与真实 thread

- [ ] Electron main 直接 spawn bundled `codex.exe -c features.code_mode_host=true app-server --analytics-default-enabled`
- [x] 实现 stdin writer、stdout JSONL parser、stderr diagnostics 和 RPC id dispatcher
- [x] 实现双向 request/response/notification、initialize/initialized、deadline、cancel、大小/并发/队列上限
- [ ] 实现 thread start/resume/subscribe/unsubscribe、turn 与 item notification 生命周期
- [ ] 跑通真实 Codex thread、流式事件、审批、停止和恢复
- [ ] 分开验证 approval policy 与 sandbox/permission profile，并覆盖 Windows restricted/elevated 工具子进程
- [ ] 验证 App Server v2 投影是 UI 唯一事件入口，不解析 TUI 或复制 Core event translator
- [ ] 验证 app-server 崩溃、畸形 JSON、EOF、睡眠恢复和 Windows 子进程树清理
- [x] 覆盖 app-server spawn 失败的 `error`/`close` 生命周期，保证 stop 与退出回调只结算一次
- [x] 建立 app-server Home 选择策略：默认沿用标准 Codex Home，自定义绝对路径只由用户显式选择
- [x] 建立 `browser-data`、`app-state`、`logs`、`artifacts` 宿主目录合同并接入 Electron `userData`/`sessionData`/logs
- [x] 停止将 BlackRain Gateway provider/model 持久写入共享 `config.toml`，改为进程级 `-c` override
- [x] 将 credit JWT 规范副本迁入系统凭据库，Gateway 运行时文件迁入 BlackRain app-data，并保留旧 Home 文件的一次迁移读取
- [x] Gateway 默认 bearer 改为每进程随机值，JWT 运行文件原子替换，HTTP server 支持并发请求且启动失败清理子进程
- [x] Gateway Python unittest 接入按路径触发的独立 CI 门禁
- [ ] 在 bundled app-server 上验证标准共享 Home、自定义 Home、Electron/Browser 数据分层和 ThreadStore 独占写入

## 阶段 3：Codex 功能对齐的 Browser 纵向切片

- [x] 建立 main Browser registry、BrowserViewManager、`WebContentsView` host foundation 和首批 list/goto/navigation Agent 工具面
- [x] 实现持久 partition、页面 WebContents 安全参数、http(s) 导航和 popup/权限/下载默认拒绝 policy
- [x] 建立 UI 路径的 window/thread/route/tab/view/WebContents 映射和 generation；Codex session/turn/debugger 映射仍待实现
- [x] 实现 renderer bounds/visibility/layout revision/occlusion 同步和 content area 裁剪
- [x] 实现当前窗口内的 view 隐藏保留和 stale layout 拒绝
- [x] 实现当前 thread 的 Browser 侧栏、tab、地址栏、导航控制、加载/错误状态和 main→preload 状态事件
- [ ] 实现窗口间 view reparent、App 重启恢复和真实 app-server thread route
- [ ] 从真实 Codex thread 通过 dynamic tool 操作同一个可见页面 WebContents
- [x] 子进程 fixture 跑通 `thread/start`、`turn/start`、`item/tool/call` 到同一 Browser registry adapter；真实模型共页仍由上一项验收
- [x] 在同一 page WebContents 上实现有界 AX snapshot/ref、click、type_text 和 current viewport screenshot 受限 CDP bootstrap；真实页面/模型验收仍由下一项覆盖
- [x] Playwright Electron 通过 main-only 合成 `item/tool/call` 验证真实可见 page 的 snapshot/type/click/screenshot 与 page id 不变；真实 app-server/model 仍未验收
- [ ] 跑通 navigate、snapshot、click、type、screenshot、停止和用户抢占
- [ ] 将 dynamic tool 标为 bootstrap，并按 spec 013 建立 per-session Browser backend 与生产 Browser client 替换闸口
- [ ] 预留自有 Browser client、可选 page preload、framed pipe 和 runtime hash/License 的目录、打包与测试接点

## 阶段 4：能力迁移与 Browser 产品化

- [ ] 迁移项目、文件、Git、设置和凭据能力
- [ ] 使用 main-owned `node-pty` 迁移终端，并验证 ConPTY、resize、停止和进程清理
- [ ] Electron 自有结构化状态按需使用 `better-sqlite3`，与 Codex ThreadStore 数据库分库、分目录
- [ ] 迁移窗口、菜单、通知、更新和系统集成
- [ ] 迁移 app-server 事件与错误恢复
- [ ] 完成多 tab、view retention/reparenting、下载、权限、popup、CDP 和恢复
- [ ] 完成 session/turn binding、注入式 ARIA/locator、turn/tab finalize、hidden capture surface 和页面工作集
- [ ] 清除 renderer 对 Tauri API 的直接依赖
- [ ] 为临时兼容层建立并完成删除任务
- [ ] 删除目标态不再需要的 Rust daemon、remote backend 和双宿主 RPC

## 阶段 5：发布收口

- [x] 建立 Node 22 Windows CI 制品门禁，覆盖 package、packaged smoke、Playwright Electron E2E 和 unsigned MSIX make
- [ ] Windows 安装、首启、升级、回滚和卸载矩阵通过
- [ ] MSIX 包含并可启动 codex 与所需 helper，签名/hash/退出清理通过
- [ ] MSIX 包含经锁定的 Browser client 与可选 page preload，runtime 接缝、License、hash 和进程/pipe 清理通过
- [ ] 关键 Codex 工作流和 spec 013 P0 能力通过
- [ ] 安全审计与第三方 License 审计通过
- [ ] 记录启动、内存、GPU、多 view、多屏、DPI、z-order、modal 遮挡和输入法基线
- [ ] 删除 Tauri runtime、配置、依赖和 CI/build 入口
- [ ] 更新全部运行手册与模块文档
