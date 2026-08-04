# Electron 迁移能力账本

> 当前为 G0 的账本模板和基线摘要，不代表任何能力已迁移或已发布。实施时必须从 `src-tauri/src/lib.rs`、renderer source、Tauri plugins/resources/CI 重新生成逐项条目，并在每个条目上填写状态与证据。

## 字段与枚举

每条 command/import 必须有唯一 `owner`；子域不扩展 owner 枚举，写入 `capability`。

```text
id / 原始 command 或 import / 所属模块
owner: app-server | electron-main/preload | renderer-only | gateway | delete
capability: optional（例如 node-pty、credential-store、deferred-delete）
状态 / 目标文件或 API / 任务 ID / 运行验证 / 产品验证 / 删除提交
```

## 状态枚举

```text
inventory       已盘点，未确定目标
mapped          已确定目标所有者，未实现
implemented     目标代码存在，未完成运行验证
run-pass        指定命令/环境通过
product-pass    Windows 产品流程通过
deleted         旧实现和发布入口已删除并验证
deferred-delete 暂停路线或明确删除项，入口必须隐藏/禁用
```

## 当前模块级基线

来源：`npm.cmd run check:host-boundary`，2026-08-04。模块级分类不是逐项完成证明。

| 目标 owner | 条目数量 | 目标处理 |
|---|---:|---|
| `app-server` | 83 | 映射到原装 app-server；验证 thread/turn/审批/恢复 |
| `electron-main/preload` | 82 | 迁移到 Electron main/preload typed API；其中 4 项 capability=`node-pty`，3 项 capability=`credential-store` |
| `delete` | 18 | 暂停路线，隐藏入口并明确 delete/deferred-delete |
| `gateway` | 11 | 保持独立 sidecar，不进入 main/renderer |
| **合计** | **194** | 必须逐项收口 |

当前 renderer direct import 基线为 53，完整来源见 `apps/desktop/scripts/host-boundary-baseline.json`。该文件只作为“禁止新增”的基线，不能作为迁移完成证明。

## 逐项账本格式

每个 command/import 必须复制一行，禁止只填模块汇总：

| ID | 原始条目 | 模块 | 目标 owner | capability | 目标 API/文件 | 任务 ID | 状态 | 运行验证 | 产品验证 | 删除提交 |
|---|---|---|---|---|---|---|---|---|---|---|
| CMD-001 | `settings::get_app_settings` | settings | electron-main/preload | — | `electron/main/settings` | `G3B-CODE-02` | inventory | — | — | — |
| CMD-002 | `files::file_read` | files | electron-main/preload | — | `electron/main/files` | `G4A-CODE-01` | inventory | — | — | — |
| CMD-003 | `codex::start_thread` | codex | app-server | — | `app-server thread/start` | `G2-CODE-04` | inventory | — | — | — |
| IMPORT-001 | `src/services/tauri.ts -> @tauri-apps/api/core` | renderer | delete | — | `src/host/*` | `G3A-CODE-01` | inventory | — | — | — |

上面示例不是完整条目。G0 必须用脚本生成剩余条目，并为每行补齐 `目标 API/文件`、任务 ID、测试命令、证据路径和删除提交；账本中不得出现无 owner、无验证或无删除条件的条目。账本最终可以保留作为迁移审计，但它不能被生产代码、用户文档或 release package 引用。

## 兼容层账本

| 兼容入口 | Electron 替代 | 删除任务 | 删除验证 |
|---|---|---|---|
| `src/services/tauri.ts` | `src/host` + typed preload | `G5-CODE-02` | 无 `@tauri-apps` 静态搜索 |
| `src/services/events.ts` | main 统一事件扇出 | `G3A-CODE-03` / `G5-CODE-02` | renderer 无 Tauri event import |
| Tauri terminal commands | main `node-pty` | `G4A-CODE-03` / `G5-CODE-03` | ConPTY/进程树测试 |
| Tauri NSIS scripts | Forge MSIX | `G5-CODE-04` | 仅 Electron maker 可构建 |
| `127.0.0.1:4732` daemon route | app-server stdio / main service | `G5-CODE-03` | 固定端口/daemon 搜索为零 |

## 收口规则

- 每个条目达到 `product-pass` 后才能从“迁移中”进入“可交付”。
- `delete` 必须同时有替代 API、调用者迁移、静态删除检查和 Windows 回归证据。
- `deferred-delete` 只能对应暂停路线，不得被 Electron MVP 的可见 UI、构建或发布脚本引用。
- 账本任何变更必须同步 `tasks.md`、`verification.md` 和受影响的 docs，并记录日期/commit。
