# Verification

> **记录规则**：本 spec 当前只有文档和目标设计。文档链接通过不等于 Manifest、安装器或工作台生命周期已经实现。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-12 | spec 五件套存在 | 静态检查目录和文件 | 存在 | 只证明文档建立 |
| 2026-07-12 | 激活运行 contract | `ActivatedWorkbenchContext v1` Rust/TS shared fixture、校验与 Hermes desired-state 映射 | `cargo test workbench_core --lib`; `npm run test -- --run src/features/work/types.test.ts` | `3 passed`（Rust）+ `5 passed`（TS，macOS） | 当时只证明 activation 输出 contract；后续 store 证据见下一行，Manifest/install/verify 仍未实现 |
| 2026-07-12 | activation 持久化接缝 | App-data `activations.v1.json` list/read/persist_verified、原子替换、容量/schema/重复 ID/symlink 门禁、同 ID 资源不可变；前端仅 list/read | `cargo test workbench_core --lib`; `cargo check`; `npm run test -- --run src/features/work/types.test.ts src/features/work/hooks/useWorkController.test.tsx src/features/work/components/WorkSurface.test.tsx src/services/tauri.test.ts`; `npm run typecheck` | `7 passed`（Rust）+ `80 passed`（TS targeted）+ check/typecheck 通过（macOS） | 只证明 store 与只读消费接缝；`persist_verified` 未接 install/verify pipeline，无正式 Office activation，Windows 未验证 |
| 2026-07-12 | verified plugin runtime 接缝 | App-data store、plugin/version 资源不可变、managed install root、祖先链/command symlink 与路径逃逸门禁、MCP/typed environment ref 解析、child env key 与 App placeholder 生成；legacy ref、system capability 和同 ID 不同 kind 均 fail closed | `cargo test plugin_core --lib` | `5 passed`（macOS） | 只证明 009 可消费的底层执行制品 contract；没有 Manifest/install/verify/credential producer，没有真实插件或 Windows 运行证据 |
| 2026-07-12 | deactivate 消费侧接缝 | 009 Core command 停止运行资源、移除 binding/activation、保留项目；冲突和身份门禁 | `cargo test workbench_core --lib`; `cargo test hermes --lib`; targeted TS tests | Rust `8 + 83 passed` + TS `82 passed`（macOS） | 只实现已有 activation 的消费侧停用；008 install/health/activate producer、安装资源卸载和 Windows process tree 仍未实现 |
| 2026-07-12 | Manifest v1 与 Office 只读 inspect | strict YAML/unknown field、Windows x64/WORK 边界、依赖 checksum/scope、包内路径、Skill、symlink/穿越、Office 真实 Manifest；official allowlist App command、TS wrapper/controller、未激活安装计划 UI | `cargo test workbench_core --lib`; `cargo check`; targeted Vitest；`npm run test`; `npm run typecheck`; `npm run lint`; `npm run lint:ds`; `npm run codemod:ds:dry`; `git diff --check` | Rust `13 passed` + check；targeted TS `4 files / 91 passed`；全量 `149 files / 1106 tests` + typecheck；lint/DS 0 error、5 条既有 warning；codemod 仅提示既有 `SettingsView.tsx` modal（macOS/jsdom） | `serde_yaml_ng 0.10.0`；只读 inspect，不含空间/签名/semver/Daemon/install/health 执行/activation；Windows 未验证 |
| 2026-07-12 | OfficeCLI system capability 消费接缝 | `officecli-1.0.117` Core allowlist、App-data 受控根解析、祖先链/可执行文件 symlink 与缺失/unsupported fail closed、仅 Hermes 子进程 PATH 前置 | `cargo test shared::hermes_core::runtime --lib`; `cargo test hermes --lib`; `cargo check` | `8 passed` + `102 passed` + check（macOS） | 该检查点只证明 009 消费路径；随后 producer 证据见下一行。Windows 仍未验证 |
| 2026-07-12 | Office official install/health/permission/activate 纵切 | 完整 official allowlist、Windows x64 command 门禁、App-data staging/版本/active/state、symlink/reparse-point 拒绝、严格复制、OfficeCLI SHA-256/`--version`、失败不签 activation、项目目录 canonicalize、多项目 activation 隔离、read-write grant、system capability、Core store、TS wrapper/controller、目录选择与 DS 权限确认；移除 App 启动自动复制 | `cargo test workbench_core --lib`; `cargo test workbench --lib`; `cargo test hermes --lib`; `cargo check`; targeted Vitest；`npm run test`; `npm run typecheck`; `npm run lint`; `npm run lint:ds`; `npm run codemod:ds:dry`; `shasum -a 256 .../officecli.exe`; `git diff --check` | Rust `15 + 19 + 102 passed` + check；targeted TS `3 files / 87 passed`；全量 `149 files / 1108 tests` + typecheck；OfficeCLI hash 与 Manifest 一致；lint/DS 0 error、5 条既有 warning；codemod 仅提示既有 `SettingsView.tsx` modal（macOS/jsdom） | lifecycle 单测使用可执行 fixture；产品 command 在非 Windows x64 明确 unsupported。Windows reparse 分支只通过编译设计审计，未运行 Windows OfficeCLI、领域 smoke、Hermes 工具发现、升级/回滚/卸载、签名/空间/Daemon parity |
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
- Office official-only lifecycle producer 与 009 capability 消费已接通；普通前端仍不能直接写 activation store。

Office v0.1.0 已有首个 install/health/permission/activate 生产链，但 008 的通用依赖解析、签名、空间、升级、回滚、卸载和 Windows 发布矩阵仍未完成，不能据此声称完整工作台生命周期或 Windows 发布可用。

## 未验证风险

- App 已有 official bundled inspect；Daemon parity 与 install/activate/uninstall RPC 尚无，当前 activation list/read/deactivate 仍为 local-only。
- Manifest v1 已冻结最小字段，但空间、签名、BlackRain semver、系统依赖探针和安装事务未实现。
- 首个 Office 受控路径与用户项目隔离已有代码；共享依赖、升级回滚和崩溃恢复未实现。
- 第三方包签名、恶意包防护和权限模型未实现。
- Windows 干净环境没有任何工作台生命周期实测。
- 商业软件、数据源和高责任领域的真实工作台尚未验证协议表达能力。

## 失败记录

- 2026-07-12：首次给平台结构补 `Hash` 时误加到整个 `WorkbenchManifest`，随后平台本身仍缺 `Hash`，导致两轮 Rust 编译失败；移除错误 derive 并只给 `WorkbenchPlatform` 补 `Hash` 后通过。
- 2026-07-12：首轮 manifest 测试发现 `rename_all="kebab-case"` 会把 `X86_64` 解析为 `x86-64`，与冻结字段 `x86_64` 不符，并连带让路径/symlink fixture 提前解析失败；改为显式 `#[serde(rename="x86_64")]` 后 13 项通过。
- 2026-07-12：最初短暂引入 deprecated `serde_yaml 0.9`，审计后在提交前切换到 maintained `serde_yaml_ng 0.10.0`。OfficeCLI 临时版本探针已输出 `1.0.117`，但 shell 尾部误用了 zsh 只读变量 `status`；该尾部错误不影响版本输出，未修改仓库二进制。
- 2026-07-12：对 `src/lib.rs` 运行 leaf `rustfmt` 时触发 module 递归格式化，产生多处无关 Rust diff；提交前按文件精确反向应用这些机械变化，只保留本阶段 `lib.rs` command 注册和 `office.rs` allowlist 资源定位改动。未使用 `cargo fmt --all`，未触碰用户 docx。
- 2026-07-12：补充正例 fixture 后，从 `apps/desktop/src-tauri` 误用 `git -C ../../../.. diff --check`，路径越过仓库根导致 Git 报“Not a git repository”；Rust 13 项已先通过，随后回到仓库根重新执行 diff check。
