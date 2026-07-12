# Verification

> **记录规则**：本 spec 当前只有文档和目标设计。文档链接通过不等于 Manifest、安装器或工作台生命周期已经实现。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-12 | spec 五件套存在 | 静态检查目录和文件 | 存在 | 只证明文档建立 |
| 2026-07-12 | 激活运行 contract | `ActivatedWorkbenchContext v1` Rust/TS shared fixture、校验与 Hermes desired-state 映射 | `cargo test workbench_core --lib`; `npm run test -- --run src/features/work/types.test.ts` | `3 passed`（Rust）+ `5 passed`（TS，macOS） | 当时只证明 activation 输出 contract；后续 store 证据见下一行，Manifest/install/verify 仍未实现 |
| 2026-07-12 | activation 持久化接缝 | App-data `activations.v1.json` list/read/persist_verified、原子替换、容量/schema/重复 ID/symlink 门禁、同 ID 资源不可变；前端仅 list/read | `cargo test workbench_core --lib`; `cargo check`; `npm run test -- --run src/features/work/types.test.ts src/features/work/hooks/useWorkController.test.tsx src/features/work/components/WorkSurface.test.tsx src/services/tauri.test.ts`; `npm run typecheck` | `7 passed`（Rust）+ `80 passed`（TS targeted）+ check/typecheck 通过（macOS） | 只证明 store 与只读消费接缝；`persist_verified` 未接 install/verify pipeline，无正式 Office activation，Windows 未验证 |
| 2026-07-12 | verified plugin runtime 接缝 | App-data store、plugin/version 资源不可变、managed install root、祖先链/command symlink 与路径逃逸门禁、MCP/environment ref 解析 | `cargo test plugin_core --lib` | `4 passed`（macOS） | 只证明 009 可消费的底层执行制品 contract；没有 Manifest/install/verify producer，没有真实插件或 Windows 运行证据 |
| 2026-07-12 | deactivate 消费侧接缝 | 009 Core command 停止运行资源、移除 binding/activation、保留项目；冲突和身份门禁 | `cargo test workbench_core --lib`; `cargo test hermes --lib`; targeted TS tests | Rust `8 + 83 passed` + TS `82 passed`（macOS） | 只实现已有 activation 的消费侧停用；008 install/health/activate producer、安装资源卸载和 Windows process tree 仍未实现 |
| YYYY-MM-DD | Manifest schema | schema 单测 | 未跑 | 尚无 schema 实现 |
| YYYY-MM-DD | Office manifest | parse/inspect | 未跑 | 尚未迁移 |
| YYYY-MM-DD | Windows 安装 | 干净 Windows x64 VM | 未跑 | 尚无安装器 |
| YYYY-MM-DD | 健康检查与任务 | Office smoke | 未跑 | 尚无生命周期闭环 |
| YYYY-MM-DD | 升级与回滚 | 失败注入 | 未跑 | 尚无实现 |
| YYYY-MM-DD | 卸载 | 保留项目、清理资源 | 未跑 | 尚无实现 |
| YYYY-MM-DD | NSIS 后产品 E2E | 安装 BlackRain → 安装工作台 → 创建项目 → 执行任务 | 未跑 | 发布结论必须以此类证据为准 |

## 已验证

- 产品概念已在 `README.md` 和 `docs/01`～`docs/09` 中重构为“专家数字工作环境平台”。
- 工作台正式关系已定义为 `Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室`。
- 本 spec 的 requirements/design/tasks/decisions/verification 五个文件已创建。
- `ActivatedWorkbenchContext v1` 代码 contract 已存在，能表达已验证工作台运行实例并拒绝任意 env/command/path 越权字段。
- Core-owned activation store 与 surface 只读 list/read 接缝已存在；009 已拒绝未出现在 store 中的正式任务创建。
- Core-owned verified plugin runtime store 的底层读取/校验接缝已存在；普通前端没有写入口。

activation contract/store 是已实现的底层接缝，但仍没有 Manifest/install/verify/permission/activate 生产链；不能据此声称工作台生命周期或 Windows 发布可用。

## 未验证风险

- Manifest 格式和 schema 库未选定。
- App/Daemon 尚无工作台 inspect/install/activate/uninstall RPC；当前只有 App local-only activation list/read，Daemon 明确 unsupported。
- Office 骨架尚未迁移到目标包格式。
- 受控路径、共享依赖、升级回滚和用户项目隔离未实现。
- 第三方包签名、恶意包防护和权限模型未实现。
- Windows 干净环境没有任何工作台生命周期实测。
- 商业软件、数据源和高责任领域的真实工作台尚未验证协议表达能力。

## 失败记录

暂无实现，暂无运行失败记录。
