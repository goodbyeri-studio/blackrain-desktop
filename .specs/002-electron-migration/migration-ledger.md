# Electron 迁移能力账本

> 账本保存迁移前的 194 个 command 和 53 个 renderer direct import 作为历史审计输入。2026-08-05 生产边界已归零；逐项记录见 `migration-ledger.json`，产品验收状态只看 `verification.md`。

## 当前结论

| 指标 | 迁移输入 | 当前生产边界 | 证据 |
|---|---:|---:|---|
| 旧宿主 command | 194 | 0 | `npm.cmd run check:host-boundary` |
| renderer direct import | 53 | 0 | `npm.cmd run check:host-boundary` |
| 旧 runtime/daemon/固定端口/安装器 | 存在 | 0 | 目录删除、final-mode 扫描、package audit |
| 未知 owner | 0 | 0 | `migration-ledger.json` |

最终扫描在 789 个 production-boundary 文件中未发现旧宿主名称/package/source、旧 daemon/固定端口/callback bridge/安装器、裸 legacy invoke/listen 或 194 个历史 command 名。

## 状态语义

- `deleted`：历史入口已从生产源码、依赖、脚本、CI 和制品路径删除；不单独宣称替代能力完成产品验收。
- `deferred-delete`：暂停或锁定版本不支持的路线已从 Electron MVP UI 隐藏，历史测试可保留为 skip，但不得重新成为可见入口。
- `productVerification: null`：正式签名 MSIX 产品矩阵尚未执行。
- `deletionCommit: null`：当前工作树尚未提交，不伪造删除 commit；合入 commit 由 Git 流程补证。

## 运行证据

- `npm.cmd run typecheck`、全量 `npm.cmd run test`、`npm.cmd run lint`
- `npm.cmd run electron:runtime:verify`、`electron:node-runtime:verify`、`electron:browser-client:verify`
- `npm.cmd run electron:app-server:probe`
- `npm.cmd run electron:package`、`electron:package:audit`、`electron:native-input:probe`
- `npm.cmd run electron:smoke`、`electron:e2e`、`electron:make`

上述证据只支持 `RUN_PASS`。正式签名、安装/升级/回滚/卸载、真实登录/MFA/审批、双用户 ACL 和 Windows 输入/显示/恢复矩阵完成前，不得升级为 `PRODUCT_PASS`。
