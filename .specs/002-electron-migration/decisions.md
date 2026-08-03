# Electron 全量迁移决策

> 决策不自动证明实现或验证完成；验收状态只看 `verification.md`。

## 2026-08-03：全量 Electron 迁移成为唯一当前 P0

- 决策：结束 Browser 独立 P0，将 Electron 全量迁移、Tauri/daemon 删除和 Windows 发布设为唯一当前 P0。
- 原因：Browser runtime/功能链路已闭环；真实安装态产品验收受 Electron 宿主未完成阻塞，继续按 Browser 子项目拆分会掩盖实际主线。
- 替代方案：只迁移 Browser 验收需要的最小宿主链路；已拒绝，因为产品决定先完成全量 Electron 迁移。
- 影响范围：产品真源、运行时里程碑、living spec、desktop 宿主 API、构建和 Windows 验收。
- 后续复查条件：Electron 成为唯一发布入口且 Tauri runtime/daemon 已删除。

## 2026-08-03：迁移以能力所有权为单位

- 决策：194 个 Tauri command 和 renderer 直接依赖必须映射到 app-server、Electron main/preload、renderer-only 或 delete；不做逐 command 的永久 IPC 翻译层。
- 原因：避免复制 daemon/app-server 状态机和形成永久双宿主。
- 替代方案：逐条复刻 Tauri command；拒绝。
- 影响范围：`check:host-boundary`、typed host API、迁移任务和删除闸口。

## 2026-08-03：通用 shell 能力进入 Electron main

- 决策：外部链接和文件管理器 reveal 由 main 校验并执行，renderer 通过 typed preload 调用；Tauri fallback 只保留在单一兼容模块。
- 原因：renderer 不应直接获得 Electron shell 或 Node 能力，同时需要在迁移期保持 Tauri 开发入口。
- 后续复查条件：Tauri 发布入口删除时同时删除 fallback 和 `@tauri-apps/plugin-opener`。
