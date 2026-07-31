# 文档地图

本仓文档默认描述当前决策和真实实现状态。目标架构、代码存在、验证通过和发布可用必须分开书写。

## 真源与判定顺序

| 问题 | 真源 |
|---|---|
| BlackRain 是什么、当前进度 | `README.md` |
| 用户看到的产品形态与优先级 | `docs/04-产品形态.md` |
| 目标运行时、当前迁移状态与里程碑 | `docs/09-运行时架构与里程碑.md` |
| Electron 与内置 Browser 的实施波次 | `docs/10-Electron迁移与内置浏览器实现计划.md` |
| 当前 P0 需求、设计、任务、决策和验证 | `.specs/001-in-app-browser/` |
| 整体 Electron 迁移路线 | `docs/09` 里程碑 + `docs/10` 迁移波次；当前无第二个 spec |
| 当前功能完成了什么 | `001-in-app-browser/verification.md` + 实际代码/配置 |

`tasks.md` 勾选、目标拓扑和旧测试不能替代当前证据。发生冲突时，产品优先级看 04，运行时边界看 09，具体实现看对应 spec。

## 先读顺序

1. [README](../README.md)
2. [AGENTS](../AGENTS.md)
3. [04 产品形态](04-产品形态.md)
4. [09 运行时架构与里程碑](09-运行时架构与里程碑.md)
5. [10 Electron 迁移与内置浏览器实现计划](10-Electron迁移与内置浏览器实现计划.md)
6. [commands](commands.md) 与任务对应 spec

## 专题索引

| 文档 | 当前职责 |
|---|---|
| [01 产品愿景](01-产品愿景.md) | 为什么以 `codex-rs` 复现完整 Codex 桌面产品 |
| [02 市场与竞品](02-市场与竞品.md) | Codex App 标杆、开源内核与桌面壳竞争位置 |
| [03 系统架构](03-系统架构.md) | Electron main/preload/renderer、codex app-server、Browser 和 Gateway 分层 |
| [04 产品形态](04-产品形态.md) | **唯一产品形态真源**：Codex-first 桌面 App、P0/P1/暂停范围 |
| [05 模型路由](05-模型路由.md) | 原装 codex 模型链路与可选 Gateway 边界 |
| [06 暂缓路线](06-市场与创作者经济.md) | 工作台、专家市场和 OPC 的暂停边界 |
| [07 护城河与风险](07-护城河与风险.md) | 上游同步、宿主能力、Browser 安全和复刻风险 |
| [08 仓库与上游](08-仓库结构与上游策略.md) | codex 只读上游、Tauri 迁移起点和 Electron 归属 |
| [09 运行时与里程碑](09-运行时架构与里程碑.md) | **唯一运行时真源** |
| [10 Electron 与 Browser 实施计划](10-Electron迁移与内置浏览器实现计划.md) | Codex 式 Electron/Browser 分层、协议、迁移波次和闸口 |
| [001 内置浏览器](../.specs/001-in-app-browser/) | **唯一当前 spec/P0**：Browser 及其 Electron、App Server 和 Windows 支撑 |

## 状态标签

- **当前实现**：代码或配置在当前 HEAD 中存在。
- **目标态**：已经决策但尚未证明实现。
- **已验证**：对应 `verification.md` 有日期、环境和证据。
- **发布可用**：目标平台制品、安装、E2E、降级和恢复通过。
- **暂停**：资产保留，但不进入当前 P0/P1，不接受自然扩建。

## 写作规则

- 默认中文，结论先行，同一事实只维护一处。
- 产品第一主语是 Codex-first 桌面 App，不再是工作台或 OPC 平台。
- `codex-rs` 是唯一 agent 内核；不得出现双内核路线。
- Electron 是唯一目标宿主；当前 Tauri 只能写成迁移起点。
- “复刻 Codex App”指合法的行为与体验对齐，不代表复制闭源实现或资源。
- Codex App 的公开行为和合法可观察 Browser 控制面是第一实现基线；其他 Electron 项目只提供次级工程参考。
- 工作台、市场、Office 参考包和 OPC 必须标记为暂停，不写成近期路线图。
- Windows 是当前发布验收平台；其他平台 smoke 不能替代 Windows 证据。
- 同一时刻只保留一个业务 spec；当前 P0 完成后再按新优先级替换。命令只有真实存在后才写入 `commands.md`。
- 文档和代码同 PR 更新，不保留悬空的“以后补文档”。
