# 产品定义

## 一句话

BlackRain Desktop 是基于开源 `codex-rs` / `codex app-server` 独立实现的开源 Codex Desktop。**桌面能力对标官方 Codex Desktop，但对模型开放**——多模型 Provider、Auto Router 和任意第三方模型接入是它与官方产品的本质区别。

“开源 Codex Desktop”是定位的入口，不是全部：对齐官方是达到可用基线的手段，开放模型层才是产品存在的理由。

## 两层结构

**基线层——完整的 Codex 桌面体验。** 达到“能替代官方客户端”的标准：

1. macOS Electron 客户端：稳定的 Codex thread、审批、停止、恢复与标准 Codex Home。
2. 桌面宿主：文件、终端、Git、diff、窗口、权限、更新和诊断。
3. in-app Browser 与 Computer Use：用户和 agent 共享同一个安全隔离的页面。
4. macOS 产品工程：打包、签名、公证、安装、升级、回滚、卸载与恢复验收。

**差异化层——开放的模型层。** 官方 Codex Desktop 绑定官方模型，BlackRain 不绑定：

- **多模型 Provider**：接入任意第三方模型，自带 key 即可用（BYOK 是默认路径）。
- **Auto Router**：按任务自动选模型。
- **可选 credit**：托管额度是便利选项，不是准入门槛；未配置时必须完整可用。

模型层必须保持以下不变量：

- `codex-rs` / `codex app-server` 是唯一 agent runtime；
- app-server 是 thread、turn、审批、停止、恢复和持久化的唯一真源；
- Gateway 是独立 sidecar，不拥有 UI、Browser 或 agent 状态；
- 模型层不可用时必须明确降级，不能静默切换到第二套 runtime。

## 当前状态

| 层 | 状态 |
| --- | --- |
| 基线层 1–3 | `RUN_PASS`(typecheck / test / lint / host-boundary / E2E) |
| 基线层 4（macOS 产品工程） | 未完成——**没有 macOS `PRODUCT_PASS`** |
| 差异化层 | `CODE_EXISTS`——Gateway sidecar 与设置 UI 有代码，但 `modelGateway*` 宿主 API 不存在、设置页未挂载，**当前构建里不可用** |

差异化层的缺口是当前最高优先级的功能债：它是定位的核心，却是唯一不通的一层。

现有 Electron 代码或自动化结果只能证明对应范围的 `CODE_EXISTS` 或 `RUN_PASS`，不能推导 `PRODUCT_PASS`。

## 可选账号后端

Desktop 有一个**可选的**账号系统（`src/features/accounts/`，`AccountGate` 是应用入口），提供登录与 credit 余额展示。它不是运行前提：

- **BYOK 是默认路径。** fork 本仓、自带模型 key 即可获得完整功能，不需要任何账号。
- 未配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 时，`AccountGate` 走 `unconfigured` 分支**直接放行**，不拦截使用、不弹登录墙。`vite.config.ts` 把两个变量默认为空串，因此默认构建就是未配置状态。
- 配置后 Desktop 侧的实际依赖只有两处（`src/features/accounts/accountService.ts`）：读 `profiles` 与 `credit_ledger`，**只用 anon key + RLS**。
- 托管额度是便利选项，不是准入门槛。任何改动都不得让账号后端成为运行前提。

密钥边界：Desktop **不持有任何服务端凭据**。用户自己的模型厂商 key 只进系统安全存储，不进 Codex 文件或日志；使用托管额度时 Desktop 只能得到可撤销、可限额、可过期的 model token。

## 不在当前范围

- 服务端实现、托管模型、云端 Browser、团队协作和商业 SLA。本仓是桌面客户端，不含服务端。**注意**：不在范围内的是服务端，不是 Desktop 的账号 UI——后者已经存在且可选，见上文[可选账号后端](#可选账号后端)。
- 移动端、Windows 和 Linux 正式发行。Windows 客户端已明确**暂停开发、不构建、不发行**，列为 TODO；其 runtime lock、vendor 脚本与 MSIX 配置刻意保留以便将来恢复，但不在当前 CI 覆盖内。边界与保留清单见[开发与发布](development.md)。
- 复制、反编译或再分发官方 Codex Desktop 的闭源代码、私有 bundle、字体、图标或服务实现。
- **工作台市场、创作者分成、插件生态和内容平台化。** 这些是已废弃旧蓝图的方向，**不是延后事项**——产品核心已收敛为「更开放的开源 Codex Desktop」：基线对齐官方桌面体验，差异化是开放的模型层。文档、UI 和 spec 中不应再出现这类表述。相关脚手架（`plugins/`、`workbenches/`、`src/features/workbenches/`，以及 `desktop.ts` 中一律返回 `unavailableCapability` 的 `workbench*` / `office*` 导出）已于 2026-09-01 删除。

## 关系与来源

| 对象 | 与 BlackRain 的关系 |
| --- | --- |
| `openai/codex` | 唯一 agent 内核与 app-server 协议来源；保持原装黑盒调用 |
| 官方 Codex Desktop | 产品行为与体验参考；实现和云端服务均非代码来源 |
| CodexMonitor | 现有部分 Electron/React 文件的历史来源，正在逐域退役；归属必须保留在 NOTICE |
| Paseo、Computer Use 类项目 | 可研究的开源工程参考，不是产品上游或运行时依赖 |

完整来源和许可证见[上游与来源](upstream.md)与根目录 [NOTICE](../NOTICE)。
