# Electron 桌面壳迁移任务

## 阶段 0：架构基线

- [x] 决策唯一目标宿主为 Electron
- [x] 决策保留 React 与 Rust daemon/shared core
- [x] 根据三份 Codex App 研究稿重建 Electron/Browser 目标控制面
- [x] 决策保持 npm，Windows 打包以 electron-builder + NSIS 为实施方向
- [ ] 盘点全部 Tauri command、plugin、window、event、resource 和打包依赖
- [ ] 建立 Tauri -> Electron 能力迁移矩阵、owner、测试和删除闸口
- [ ] 锁定 Electron/Node 版本并完成 License、fuses、ASAR 和 CSP 基线
- [ ] 确定签名证书、更新源、发布密钥和回滚方案
- [ ] 为锁定 codex 运行 initialize/dynamicTools/server-request 协议探针

## 阶段 1：Electron 安全空壳

- [ ] 建立 Electron main/preload/renderer 最小工程
- [ ] 建立 `window.blackrain` 类型合同、schema 校验和 sender validation
- [ ] 建立宿主无关 renderer client，禁止新增直接 Tauri 调用
- [ ] 配置 sandbox、context isolation、自定义 protocol、CSP、导航和 popup policy
- [ ] 建立 main/preload 单测和 Playwright Electron 启动 smoke

## 阶段 2：daemon 与真实 thread

- [ ] 将 main/daemon transport 建成双向 stdio JSON-RPC
- [ ] 实现 handshake、deadline、cancel、generation、大小限制和 stderr 日志
- [ ] 启动并监管 Rust daemon 与原装 app-server
- [ ] 跑通真实 Codex thread、流式事件、审批、停止和恢复
- [ ] 验证 daemon/app-server 崩溃、睡眠恢复和 Windows 子进程树清理

## 阶段 3：Codex 功能对齐的 Browser 纵向切片

- [ ] 建立 main Browser backend、registry 和 `WebContentsView` factory
- [ ] 实现持久 partition、页面 WebContents 安全参数、导航和 popup policy
- [ ] 建立 window/thread/route/tab/view/WebContents/debugger 映射和 generation
- [ ] 实现 renderer bounds/visibility/layout revision/occlusion 同步
- [ ] 实现 view 隐藏保留、窗口间 reparent 和 stale layout 拒绝
- [ ] 从真实 Codex thread 通过 dynamic tool 操作同一个可见页面 WebContents
- [ ] 跑通 navigate、snapshot、click、type、screenshot、停止和用户抢占

## 阶段 4：能力迁移与 Browser 产品化

- [ ] 迁移项目、文件、Git、终端、设置和凭据能力
- [ ] 迁移窗口、菜单、通知、更新和系统集成
- [ ] 迁移 app-server 事件与错误恢复
- [ ] 完成多 tab、view retention/reparenting、下载、权限、popup、CDP 和恢复
- [ ] 清除 renderer 对 Tauri API 的直接依赖
- [ ] 为临时兼容层建立并完成删除任务

## 阶段 5：发布收口

- [ ] Windows 安装、首启、升级、回滚和卸载矩阵通过
- [ ] 关键 Codex 工作流和 spec 013 P0 能力通过
- [ ] 安全审计与第三方 License 审计通过
- [ ] 记录启动、内存、GPU、多 view、多屏、DPI、z-order、modal 遮挡和输入法基线
- [ ] 删除 Tauri runtime、配置、依赖和 CI/build 入口
- [ ] 更新全部运行手册与模块文档
