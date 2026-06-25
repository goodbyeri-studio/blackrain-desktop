# Verification

> 本 spec 尚处方案阶段，实现后须逐项跑验证并回填真实结果与日期。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-25 | spec 创建 | 文档落地 | 通过 | 仅文档，尚未改实现代码 |
| 2026-06-25 | credit 费率换算单测 | `npm run test -- src/features/accounts/utils/creditPricing.test.ts` | 通过 | flash 0.5x / pro 1.5x，比值 3:1（5 用例） |
| 2026-06-25 | credit 余额展示单测 | `npm run test -- src/features/accounts` | 通过 | 格式化/负数超卖/耗尽判定（6 用例） |
| 2026-06-25 | 登录卡片组件测试 | `npm run test -- src/features/accounts` | 通过 | 模式切换/邮箱校验/未配置禁用（4 用例，jsdom） |
| 2026-06-25 | 前端 typecheck | `npm run typecheck` | 通过 | 无错误 |
| 2026-06-25 | i18n/settings/accounts 测试 | `npm run test -- src/i18n src/features/settings src/features/accounts` | 通过 | 85 用例全过（含 i18n key 对齐、SettingsView 穷举） |
| 2026-06-25 | ESLint + DS 守卫 | `npm run lint` / `npm run lint:ds` | 通过 | 0 error；5 既有 warning（非本次引入） |
| 2026-06-25 | Rust 检查 | `cd apps/desktop/src-tauri && cargo check` | 通过 | 仅既有 dead_code warning；account_session 模块编译干净 |
| YYYY-MM-DD | 账号注册/登录 | 桌面手动 + Supabase 控制台 | 未跑 | 需用户接真实 Supabase 项目后验：注册→建 profile→赠送 credit |
| YYYY-MM-DD | 会话态持久 | 重开 App | 未跑 | 需真实项目：自动恢复、过期刷新、钥匙串落盘 |
| YYYY-MM-DD | 模式切换 → provider 配置 | shared core 单测 | 未跑 | credit/BYOK base_url+Authorization（M-A2/3） |
| YYYY-MM-DD | 代理 JWT 校验 + 扣余额原子性 | 代理集成测试 | 未跑 | 并发扣减不超卖（M-A2） |
| YYYY-MM-DD | RLS 前端改不动 credits | Supabase 策略测试 | 未跑 | 前端只读（需真实项目） |
| YYYY-MM-DD | 余额耗尽拦截 | 手动置 0 余额对话 | 未跑 | 返回 insufficient_credits → response.failed（M-A2） |
| YYYY-MM-DD | 真实 DeepSeek 经代理计量 | 起代理 + 真实 key 跑一轮 | 未跑 | usage 正确、credit 下降合理（M-A2） |
| YYYY-MM-DD | Plus BYOK 不计 credit | 手动 | 未跑 | BYOK 对话余额不变（M-A3） |

## 已验证

- spec 五文档已创建。
- 边界已确认：壳无自有账号/后端；DeepSeek pro:flash = 3:1（官方价）。
- 后端栈 = Supabase；对外形态 = 最小服务端代理（以后迁 new-api）。
- M-A1 代码骨干（2026-06-25）：
  - SQL migration（profiles + credit_ledger + RLS + 注册赠送 trigger）已写入 `supabase/migrations/`，待用户接真实项目应用。
  - Supabase SDK 接入 + 钥匙串会话存储（Rust `account_session*` 命令 + 前端 adapter）+ `useAccount` 状态机已实现，typecheck/lint/cargo check 全绿。
  - 登录注册卡片、设置页账号区（plan+余额+三档占位）、模型选择器倍率标签已实现并有单测/组件测试覆盖（15 用例账号 + 85 用例全量回归通过）。
- 仍需真实 Supabase 项目才能验的项（注册建档、会话持久、RLS）已在矩阵标注「需真实项目」。

## 未验证风险

- 输入/输出分计 vs 混合单价未定；思考模式 reasoning token 计入方式未定。
- 价格、Plus/Pro 额度未定，全为占位。
- Supabase 在国内的网络可达性 / 合规边界未评估（登录、实时余额依赖其可用性）；发行前须实测国内直连。
- 并发超卖（接受小幅为负、下次充值补齐）的实际损失规模未观测；若偏大需上预授权冻结。
- 常驻代理的部署/运维（Fly/Railway 等）与平台 key 的服务端保管尚未实操验证。

## 失败记录

- 暂无。
