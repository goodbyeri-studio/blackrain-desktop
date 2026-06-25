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
| 2026-06-25 | 首页余额展示 + 未登录门禁 | `npm run test -- src/features/home` | 通过 | 11 用例（含 mock signed-out：发送被拦截、弹登录卡片、顶部登录入口） |
| 2026-06-25 | 全量前端回归 | `npm run test` | 通过 | 1053 用例 / 144 文件全绿 |
| 2026-06-25 | ESLint + DS 守卫 | `npm run lint` / `npm run lint:ds` | 通过 | 0 error；5 既有 warning（非本次引入） |
| 2026-06-25 | Rust 检查 | `cd apps/desktop/src-tauri && cargo check` | 通过 | 仅既有 dead_code warning；account_session 模块编译干净 |
| 2026-06-25 | 云端项目 + migration 应用 | Supabase CLI（`projects create` sgp + `link` + `db push`） | 通过 | 新加坡区 ref jhetzgklmmkekpicutlg；两 migration Local/Remote 对齐 |
| 2026-06-25 | 注册赠送 trigger（真实云端） | REST：admin 建已确认用户 → 查 profiles/ledger | 通过 | 自动建 free profile + 100 credit + signup_grant 流水 |
| 2026-06-25 | RLS 前端只读自己 | REST：用户 JWT 查 profiles | 通过 | 仅返回本人 1 行 |
| 2026-06-25 | RLS 前端改不动 credits | REST：用户 JWT PATCH credits → service_role 复查 | 通过 | PATCH 影响 0 行，余额仍 100 未篡改 |
| YYYY-MM-DD | 会话态持久 | 桌面重开 App（连云端） | 未跑 | 需起桌面：钥匙串落盘、自动恢复、过期刷新 |
| YYYY-MM-DD | 模式切换 → provider 配置 | shared core 单测 | 未跑 | credit/BYOK base_url+Authorization（M-A2/3） |
| YYYY-MM-DD | 代理 JWT 校验 + 扣余额原子性 | 代理集成测试 | 未跑 | 并发扣减不超卖（M-A2） |
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
- 真实云端验证（2026-06-25，新加坡区 ref jhetzgklmmkekpicutlg）：
  - Supabase CLI 建项目 + `db push` 应用两 migration，Local/Remote 对齐。
  - trigger 端到端坐实：admin 建用户 → 自动建 free profile + 赠送 100 credit + 写 signup_grant 流水。
  - RLS 端到端坐实：用户 JWT 只读到本人 1 行；PATCH credits 影响 0 行、余额未篡改。
- 仍需起桌面 App 才能验的项（会话钥匙串持久/自动恢复/过期刷新）已在矩阵标注。

## 未验证风险

- 输入/输出分计 vs 混合单价未定；思考模式 reasoning token 计入方式未定。
- 价格、Plus/Pro 额度未定，全为占位。
- Supabase 在国内的网络可达性 / 合规边界：本机（开发者环境）经 CLI/REST 直连新加坡区项目正常（建项目、push migration、admin/REST 调用均通），但**这不等于终端用户网络**；发行前仍须在目标用户网络/弱网/移动网络下实测登录与实时余额延迟，并评估合规边界。
- 并发超卖（接受小幅为负、下次充值补齐）的实际损失规模未观测；若偏大需上预授权冻结。
- 常驻代理的部署/运维（Fly/Railway 等）与平台 key 的服务端保管尚未实操验证。

## 失败记录

- 暂无。
