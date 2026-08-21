# Electron 全量迁移 MVP 剩余任务

> 2026-08-05 已完成 Electron 原生代码迁移、旧宿主删除和本机 unsigned 全回归；完成证据见 `verification.md`。本文件只保留无法由当前未签名工作树替代的发布与产品验收项。

## 使用规则

- `CODE_EXISTS`、`RUN_PASS`、`PRODUCT_PASS` 不互相替代。
- Windows 产品项必须使用正式签名候选 MSIX 和真实 Windows 11 x64 账户/设备；自动化 package/E2E 不能替代。
- 不得补回旧宿主、daemon、固定 localhost 或第二 agent runtime 作为临时发布路径。
- 每项必须记录 Windows build、Git commit/clean worktree、精确步骤、日志/截图、制品绝对路径和 SHA-256。

## 发布输入

- [ ] `G0-RUN-03` 在合入后的干净短命分支或发布 worktree 重跑全量基线，记录 commit、Windows build、Node/npm/Electron 版本和制品路径。
- [ ] `G1-RUN-01` 在受控 Windows runner 注入正式证书与更新配置，运行 `npm.cmd run electron:make:release`，并以 `signtool verify /pa`、manifest publisher 和 SHA-256 验证正式候选。
- [ ] `G4C-RUN-02` 使用两个不同本地 Windows 用户 SID 验证 named-pipe ACL 拒绝，记录 pipe owner、拒绝错误、token/generation 摘要和 teardown。

## 安装态与核心产品矩阵

- [ ] `G1-PRODUCT-01` 正式签名 MSIX 安装后，用真实鼠标/键盘验证首启、全页面点击、设置、degraded/retry/diagnostics、焦点和退出重启。
- [ ] `G1-PRODUCT-02` 分别注入 app-server 未启动、初始化超时和未登录，确认窗口可恢复且不启动任何旧路由。
- [ ] `G2-PRODUCT-01` 验证首次登录、账户切换、标准 Codex Home 既有 thread 恢复、真实审批、停止、恢复和并发 turn。
- [ ] `G3-PRODUCT-01` 验证设置、文件选择/拖放、剪贴板、凭据、通知、托盘、菜单、快捷键、深链和窗口关闭/重启。
- [ ] `G4A-PRODUCT-01` 在真实 workspace 验证文件编辑、Git 全流程、ConPTY 中文输入/resize/退出和 App 退出后的进程树清理。
- [ ] `G4B-PRODUCT-01` 使用正式签名的当前版/上一版 MSIX 验证检查更新、升级失败保活、回滚、深链、睡眠和崩溃恢复。
- [ ] `G4C-PRODUCT-01` 在真实站点验证登录/MFA、同页 agent、下载、权限、popup、接管、OOPIF、IME、DPI、多屏、睡眠和 renderer/page crash。

## 发布判定

- [ ] `G6-PRODUCT-01` 完成安装、升级、回滚、卸载及残留文件/进程/证书检查。
- [ ] `G6-PRODUCT-02` 记录冷启动到可交互窗口 P95、app-server 恢复 P95、稳态工作集、GPU/十 tab 工作集和退出后孤儿进程，并由发布报告冻结阈值。
- [ ] `G6-PRODUCT-03` 清理 2026-08-03 开发签名测试包与临时 Root/TrustedPeople 信任条目，保存可审计结果。
- [ ] `G6-PRODUCT-04` 由发布责任人确认 G0-G6 证据后创建正式 release；在此之前状态保持 `RUN_PASS`，不得写成 MVP 可交付。
