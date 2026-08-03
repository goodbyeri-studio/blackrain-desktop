# Electron 全量迁移任务

> 只记录未完成工作。已完成事实和运行证据写入 `verification.md`。

## E0 安装态可用性

- [ ] 从签名 MSIX 复验原生 click 可打开设置，并验证添加 workspace、模型目录、创建/恢复 thread、最小 turn 和重启恢复

## E1 核心 Codex 链路

- [ ] 迁移标准 Codex Home、首次登录、账户切换和 ThreadStore 恢复
- [ ] 完成 workspace、模型/config、collaboration、skills/apps、thread CRUD 的 typed Electron 路径
- [ ] 跑通真实审批、server request/cancel、停止、恢复和并发 turn
- [ ] 将 renderer 事件订阅完全切到唯一 Electron/App Server 事件入口

## E2 桌面宿主

- [ ] 将 53 个 renderer 直接 Tauri 依赖降为 0，并让基线检查拒绝任何新增依赖
- [ ] 迁移 dialog、menu、window、drag/drop、notification、clipboard 和资源 URL
- [ ] 完成 settings、files、凭据和 shell typed API 的 renderer 接入及安全边界测试
- [ ] 迁移所有可见入口；暂未迁移能力必须隐藏或明确禁用

## E3 工程能力

- [ ] 迁移文件树、Git status/diff/branch/commit/PR 工作流
- [ ] 使用 Electron main `node-pty` 迁移终端，覆盖 ConPTY、resize、退出和进程树清理
- [ ] 迁移快捷键、深链、通知、托盘和窗口生命周期
- [ ] 建立 Electron 更新、失败恢复和诊断路径

## E4 删除 Tauri

- [ ] 将 194 个 Tauri command 逐项映射为 app-server、Electron main 或删除并形成可审计账本
- [ ] 删除 renderer Tauri package、`src-tauri` runtime、BlackRain daemon、固定 `127.0.0.1:4732` 和兼容 adapter
- [ ] 删除 Tauri/NSIS 构建脚本、依赖、能力配置和冻结 CI，不保留双发布入口
- [ ] 核对暂停路线资产没有被迁移主链重新激活

## E5 Windows 发布

- [ ] 通过 typecheck、全量测试、lint、host boundary、app-server probe、package、smoke 和 Electron E2E
- [ ] 完成正式签名 MSIX 的安装、首启、升级、回滚、卸载和残留检查
- [ ] 验证 Browser 登录/MFA、输入法、DPI、多屏、睡眠恢复和真实站点回归
- [ ] 记录日期、Windows build、Git commit/worktree、精确命令、日志和制品 hash
