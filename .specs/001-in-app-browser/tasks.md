# 内置浏览器任务

> 只记录未完成工作。已有代码、历史摘要与当前可审计证据的等级见 `verification.md`。

## 1. 唯一生产工具链

- [x] 采用并验证 `0.146.0` 标准 stdio MCP + 随包 Node adapter 的公开生产接缝；不使用私有 `node_repl`/`nativePipe`，也不把 dynamic tools/main 自加载 bridge 作为生产回退
- [x] Windows transport 使用系统默认创建者 ACL、关闭 everyone 读写，并以 capability/session/turn/generation 自动化验证拒绝未授权 client
- [x] 覆盖同用户无 token、错误 token、旧 token/generation 和跨 session/turn 拒绝；记录不抵御任意同用户代码执行的威胁模型边界
- [x] 将 Browser MCP adapter/client 接入真实 bundled app-server session/turn/generation，并由真实模型调用同一可见页面
- [x] Electron 发布入口只注册 Browser MCP adapter，关闭 `thread/start.dynamicTools`；dynamic adapter 仅保留测试/bootstrap
- [x] 覆盖断连、旧 generation、MCP 取消、transport deadline、取消后重连和 turn 结束清理

## 2. 完整页面能力

- [x] 注入 selector、actionability 和增量 ARIA runtime
- [x] 完成 locator/CUA 动作、等待、稳定性检查和明确失败语义
- [x] 完成 hidden full-page capture surface 和失败恢复
- [x] 完成 dialog、console、debugger 与 iframe/OOPIF 生命周期
- [x] 实现 tab origin、claim、handoff、deliverable、release 和 finalize
- [x] 实现并验证 URL/navigation/profile reload 的最低恢复合同，明确 JS heap、未提交表单和滚动位置不保证
- [x] 锁定 live/suspended/persisted/crashed 工作集预算，以及高于最低合同的可选恢复能力

## 3. 用户流程

- [x] 完成一次性下载授权和实际文件保存
- [x] 完成用户 file chooser 的 main-owned 确认、系统选择与页面交付流程
- [x] 完成权限、popup 和外部协议流程
- [x] 完成登录、授权、发送、发布、购买、删除等敏感动作的分类、origin/TTL 绑定、一次性确认和企业策略
- [x] 验证 Cookie/Local Storage/认证 token/transport secret 不被自动送入模型或日志，并明确 snapshot/截图可见内容边界
- [ ] 验证真实站点登录保持、MFA、反自动化和跨站跳转
- [x] 完成隐藏活动的来源、控制方、进度、接管和停止入口
- [ ] 验证 modal/menu/tooltip 遮挡、焦点、中文输入法、DPI 和多屏

## 4. App Server 与恢复支撑

- [x] 补齐 Browser E2E 所需的 thread subscribe/unsubscribe 和完整 item 生命周期
- [ ] 跑通真实审批、停止、恢复、server request/cancel
- [x] 覆盖 app-server 畸形 JSON、EOF、崩溃和 Windows 进程树清理
- [x] 接入 Electron `powerMonitor`，睡眠前停止 app-server/Browser transport、释放并冻结页面，唤醒后恢复此前运行的 runtime、CDP observer 与可见页；覆盖事件排序和模拟电源周期
- [ ] 使用真实 Windows 睡眠/唤醒验证 app-server、Browser transport 与页面恢复
- [ ] 验证标准 Home、首次登录和 ThreadStore 恢复
- [x] 覆盖 page/App renderer、Browser client、app-server 和 App restart

## 5. Windows 出口

- [ ] 跑通真实 thread 的 navigation、snapshot、locator/CUA、screenshot、下载、审批、停止和恢复 E2E
- [x] 完成 renderer/page/app-server/Browser transport 权限与隐私审计
- [x] 记录公开 runtime 接缝、同用户 no/wrong/stale-token probe 和敏感动作 grant 的可复测安全证据
- [x] 测量多 tab 内存、GPU、启动、隐藏、挂起、淘汰和恢复基线
- [x] 验证 release package/MSIX 的 runtime、Browser client、hash、License、启动和清理
- [ ] 将每项验证的精确命令、日期、Windows build、Git commit/worktree、制品 hash、日志位置、降级和人工步骤写入 `verification.md`
