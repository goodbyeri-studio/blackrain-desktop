# Verification

> **记录规则**：本 spec 当前只有文档和目标设计。文档链接通过不等于 Manifest、安装器或工作台生命周期已经实现。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-12 | spec 五件套存在 | 静态检查目录和文件 | 存在 | 只证明文档建立 |
| 2026-07-12 | 激活运行 contract | `ActivatedWorkbenchContext v1` Rust/TS shared fixture、校验与 Hermes desired-state 映射 | `cargo test workbench_core --lib`; `npm run test -- --run src/features/work/types.test.ts` | `3 passed`（Rust）+ `5 passed`（TS，macOS） | 只证明 activation 输出 contract；Manifest/install/verify/activation store 尚未实现 |
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

除 activation contract 外，其余仍为文档层事实；contract 也不证明 install/verify/Windows 运行或发布能力。

## 未验证风险

- Manifest 格式和 schema 库未选定。
- App/Daemon 尚无工作台 inspect/install/activate/uninstall RPC。
- Office 骨架尚未迁移到目标包格式。
- 受控路径、共享依赖、升级回滚和用户项目隔离未实现。
- 第三方包签名、恶意包防护和权限模型未实现。
- Windows 干净环境没有任何工作台生命周期实测。
- 商业软件、数据源和高责任领域的真实工作台尚未验证协议表达能力。

## 失败记录

暂无实现，暂无运行失败记录。
