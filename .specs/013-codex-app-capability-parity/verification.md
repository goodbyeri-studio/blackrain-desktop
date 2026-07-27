# Codex App 能力补齐验证

> 当前完成研究复核、目标控制面和合同落档。能力矩阵、Electron Browser 实现和 Windows E2E 均未完成。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 唯一内核与 P0 边界 | 文档静态审阅 | 已记录 | 不代表运行能力 |
| 2026-07-27 | 三份 Codex App Browser 研究稿 | 完整原文复核 | 已记录 | 包含静态安全/实现与动态 IAB 时序；不代表 BlackRain 已实现 |
| 2026-07-27 | Browser view/registry/tool/transport 目标合同 | 静态设计审阅 | 已记录 | 采用 Codex 功能控制面 + main-owned WebContentsView |
| 待执行 | app-server Browser 接缝 | 锁定版本协议探针 | 未跑 | experimentalApi/dynamicTools/item-tool-call |
| 待执行 | 能力矩阵 | 上游协议 + 公开产品行为盘点 | 未跑 | 需要版本化证据 |
| 待执行 | Browser 基础流程 | Playwright Electron | 未跑 | Electron 工程尚未建立 |
| 待执行 | Agent 浏览闭环 | 真实 Codex thread E2E | 未跑 | 工具合同待定 |
| 待执行 | Windows 发布体验 | 实机登录/下载/恢复/权限 | 未跑 | P0 发布闸口 |

## 未验证风险

- 尚未用仓库当前锁定 codex 实际证明 dynamic tools Browser 接缝。
- 尚未实现 main-owned `WebContentsView` factory、registry、bounds/occlusion 同步、view reparenting 或 CDP backend。
- 尚未验证登录站点对 Electron session、反自动化策略和多因素认证的兼容性。
- 尚未验证 native Browser view 与 App UI 在多屏、DPI、z-order、modal 遮挡、焦点和中文输入法下的体验。
- 尚未验证普通同用户进程、旧 renderer generation 和跨 thread 请求不能调用 Browser backend。
- 尚未完成与 Codex App 的版本化能力差距账本。
