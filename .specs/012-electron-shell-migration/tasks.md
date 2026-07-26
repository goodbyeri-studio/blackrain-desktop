# Electron 桌面壳迁移任务

## 阶段 0：架构基线

- [x] 决策唯一目标宿主为 Electron
- [x] 决策保留 React 与 Rust daemon/shared core
- [ ] 盘点全部 Tauri command、plugin、window、event、resource 和打包依赖
- [ ] 建立 Tauri -> Electron 能力迁移矩阵和删除闸口
- [ ] 确定目录、包管理、构建、打包、更新和签名方案

## 阶段 1：纵向切片

- [ ] 建立 Electron main/preload/renderer 最小工程
- [ ] 启动并监管 Rust daemon
- [ ] 跑通真实 Codex thread、流式事件、审批、停止和恢复
- [ ] 接入一个持久 `WebContentsView` 浏览器
- [ ] 验证登录态、CDP、截图、下载、关闭恢复和权限策略
- [ ] 记录 Windows 启动、内存和安装实验结果

## 阶段 2：能力迁移

- [ ] 迁移项目、文件、Git、终端、设置和凭据能力
- [ ] 迁移窗口、菜单、通知、更新和系统集成
- [ ] 迁移 app-server 事件与错误恢复
- [ ] 清除 renderer 对 Tauri API 的直接依赖
- [ ] 为临时兼容层建立并完成删除任务

## 阶段 3：发布收口

- [ ] Windows 安装、首启、升级、回滚和卸载矩阵通过
- [ ] 关键 Codex 工作流和 spec 013 P0 能力通过
- [ ] 安全审计与第三方 License 审计通过
- [ ] 删除 Tauri runtime、配置、依赖和 CI/build 入口
- [ ] 更新全部运行手册与模块文档
