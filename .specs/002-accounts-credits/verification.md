# Verification

> 状态校准（2026-07-12）：M-A1 账号代码、M-A2 过渡代理和真实 Supabase/DeepSeek 计量已经验证；生产项目边界已按 010 定为 Cloud 购买 Relay 服务，但 broker、对账、Windows 桌面 GUI、WORK/Hermes credit 和 Plus BYOK 尚未实现。2026-06-25 的公网地址和云服务结果是当日历史证据，不代表当前可用性监控。
> 同日 Supabase 服务端资产与历史代理已迁入 `blackrain-cloud`；下文
> `gateway/proxy.py` 等路径是历史证据中的原始位置，不代表 Desktop 当前仍含这些文件。

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
| 2026-06-25 | 云端项目 + M-A1 migration 应用 | Supabase CLI（`projects create` sgp + `link` + `db push`） | 通过 | 新加坡区 ref jhetzgklmmkekpicutlg；先应用 profiles/ledger 与 signup trigger 两条 migration，Local/Remote 对齐；M-A2 第三条见下方 `spend_credits` |
| 2026-06-25 | 注册赠送 trigger（真实云端） | REST：admin 建已确认用户 → 查 profiles/ledger | 通过 | 自动建 free profile + 100 credit + signup_grant 流水 |
| 2026-06-25 | RLS 前端只读自己 | REST：用户 JWT 查 profiles | 通过 | 仅返回本人 1 行 |
| 2026-06-25 | RLS 前端改不动 credits | REST：用户 JWT PATCH credits → service_role 复查 | 通过 | PATCH 影响 0 行，余额仍 100 未篡改 |
| YYYY-MM-DD | 会话态持久 | Windows 桌面重开 App（连云端） | 未跑 | 钥匙串落盘、自动恢复、过期刷新 |
| 2026-06-25 | 第三条 migration + spend_credits RPC（真实云端） | 应用 `*_spend_credits_rpc.sql` 后，REST：service_role 调 + 用户 JWT 调 | 通过 | 原子扣减+流水；用户调被拒(42501)；负 cost 被拒(P0001) |
| 2026-06-25 | credit 倍率换算单测 | `cd gateway && python3 -m unittest test_credit_math` | 通过 | 9 用例：3:1 比值、pro 6667/flash 20000 锚定 |
| 2026-06-25 | 代理纯逻辑单测 | `cd gateway && python3 -m unittest test_proxy` | 通过 | 8 用例：allowed_model/redact/models payload |
| 2026-06-25 | 代理 JWT 校验 + 扣余额原子性 | 代理端到端（真实 DeepSeek+Supabase） | 通过 | 无效 JWT→401；扣减经 spend_credits 单事务 |
| 2026-06-25 | 余额耗尽拦截 | 代理端到端：置 0 余额再请求 | 通过 | 返回 402 insufficient_credits |
| 2026-06-25 | 真实 DeepSeek 经代理计量 | 起代理 + 真实 key 跑一轮 | 通过 | flash 33 token→扣 0.00165 credit；ledger 落账含 token 明细 |
| 2026-06-25 | 代理日志脱敏 | 扫描 /tmp/proxy.log | 通过 | 无平台 key/JWT/用户内容/完整 user_id |
| 2026-06-25 | 容器化代理冒烟 | docker build + run + 真实对话 | 通过 | 绑 0.0.0.0:8080，计量闭环正常 |
| 2026-06-25 | 过渡代理公网部署 + HTTPS | DO sgp1 droplet + Caddy + Let's Encrypt | 通过 | 当日历史证据：https://proxy.goodbyeri.cc，非持续可用性证明 |
| 2026-06-25 | 公网端到端计量闭环 | 公网 HTTPS 真实对话（DeepSeek+Supabase） | 通过 | flash 22 token→扣 0.0011；首尾 1860ms；门禁 402 |
| 2026-06-25 | 网关 api_key_file 热读单测 | `cd gateway && python3 -m unittest test_gateway_key` | 通过 | 7 用例：JWT 每请求读盘、空回退、缺失返 None |
| 2026-06-25 | 桌面 credit 接线（代码） | typecheck + cargo check + 1053 前端用例 | 通过 | registry credit override + JWT 文件命令 + useCreditGatewaySync；GUI 端到端待跑 |
| 2026-07-12 | Cloud 资产迁移 | Cloud `supabase start` + `supabase db reset` + catalog 查询；legacy 17 tests + Docker build；Desktop gateway 7 tests + 路径核对 | 通过 | 三条 migration 从空库执行；RLS/trigger/RPC 权限正确；Desktop 删除服务端文件并保留账户客户端与 `gateway.py` |
| 2026-06-25 | 登录开屏门禁（代码） | typecheck + 1055 前端用例 + lint + DS 守卫 | 通过 | AccountProvider 单一真源 + AccountGate 四态分支(4 用例) + 积分额度条 + 登出；会话优先/离线宽限 |
| YYYY-MM-DD | 本地网关 credit 模式端到端 | 桌面 GUI（登录→选模型→对话） | 未跑 | 需 tauri dev：base_url 切代理、JWT 文件热读、扣 credit |
| YYYY-MM-DD | 余额耗尽 → 前端提示 | 桌面 GUI | 未跑 | 代理 402 → response.failed 已就绪；前端提示文案待联调 |
| YYYY-MM-DD | Plus BYOK 不计 credit | 手动 | 未跑 | BYOK 对话余额不变（M-A3） |
| YYYY-MM-DD | WORK/Hermes credit | Windows 桌面 GUI | 未跑 | Cloud broker + Relay token/usage 对账尚未实现 |
| YYYY-MM-DD | OTP 前赠送行为 | 未确认邮箱注册后查 profile/ledger | 未跑 | 当前 trigger 在 auth.users insert 时发放，需验证并决定是否调整 |

## 已验证

- spec 五文档已创建。
- 边界已确认：壳无自有账号/后端；DeepSeek pro:flash = 3:1（官方价）。
- 账号/余额栈 = Supabase；最小 `proxy.py` 过渡代理已验证并迁入 Cloud legacy；目标生产形态已定为 Cloud 身份/商业账本 + Relay 中转/原始 usage，但正式接口尚无实现证据。
- M-A1 代码骨干（2026-06-25）：
  - SQL migration（profiles + credit_ledger + RLS + 注册赠送 trigger）已写入并应用真实 Supabase 项目。
  - Supabase SDK 接入 + 钥匙串会话存储（Rust `account_session*` 命令 + 前端 adapter）+ `useAccount` 状态机已实现，typecheck/lint/cargo check 全绿。
  - 登录注册卡片、设置页账号区（plan+余额+三档占位）、模型选择器倍率标签已实现并有单测/组件测试覆盖（15 用例账号 + 85 用例全量回归通过）。
- 真实云端验证（2026-06-25，新加坡区 ref jhetzgklmmkekpicutlg）：
  - M-A1 先 `db push` 应用 profiles/ledger 与 signup trigger 两条 migration，Local/Remote 对齐；M-A2 随后应用第三条 `spend_credits` migration 并完成 RPC 实测。
  - trigger 端到端坐实：admin 建用户 → 自动建 free profile + 赠送 100 credit + 写 signup_grant 流水。
  - RLS 端到端坐实：用户 JWT 只读到本人 1 行；PATCH credits 影响 0 行、余额未篡改。
- M-A2 代理服务端（2026-06-25，真实 DeepSeek + 真实 Supabase）：
  - `spend_credits` RPC 坐实：单事务原子扣减+流水；用户无权调(42501)；负 cost 被拒(P0001)。
  - 历史 `gateway/proxy.py`（现 `blackrain-cloud/legacy/credit-proxy/proxy.py`）端到端坐实：用户对话经代理→DeepSeek 流式透传；flash 33 token→扣 0.00165 credit；ledger 落账含 token 明细。
  - 门禁坐实：余额耗尽→402 insufficient_credits；无效 JWT→401；未知模型→400。
  - 日志脱敏坐实：扫描无平台 key/JWT/用户内容/完整 user_id。
  - 纯逻辑单测：credit_math 9 + proxy 8 用例通过。
- 仍需起 Windows 桌面 App 才能验的项（会话钥匙串持久、CODE credit、JWT 过期刷新、余额耗尽提示）已在矩阵标注。
- WORK/Hermes credit、Plus BYOK、Cloud broker 和 Relay 对账尚未实现，不能由现有 CODE 过渡代理证据外推。
- 2026-07-12 provider 鉴权审计：锁定 Hermes `key_env` 在进程/agent 生命周期解析，不能复用 CODE 网关的逐请求 `api_key_file` 刷新。读取 new-api `7c28993` 的 `/api/token` controller/model，确认上游 token 支持撤销、过期、余额和模型限制；这只证明候选凭据形态，不证明 BlackRain 已有 broker、用户映射或统一 credit 真源。

## 未验证风险

- 输入/输出分计 vs 混合单价未定；思考模式 reasoning token 计入方式未定。
- 价格、Plus/Pro 额度未定，全为占位。
- Supabase 在国内的网络可达性 / 合规边界：本机（开发者环境）经 CLI/REST 直连新加坡区项目正常（建项目、push migration、admin/REST 调用均通），但**这不等于终端用户网络**；发行前仍须在目标用户网络/弱网/移动网络下实测登录与实时余额延迟，并评估合规边界。
- 并发超卖（接受小幅为负、下次充值补齐）的实际损失规模未观测；若偏大需上预授权冻结。
- `proxy.py` 的一次性 DO/Caddy 部署已实操，但代码已迁入 Cloud legacy 且不得作为新生产入口；Cloud/Relay 的持续监控、备份、轮换、故障恢复和生产接线尚未验证。
- Windows Credential Manager 中的会话持久、GUI credit 闭环、WORK/Hermes credit、BYOK 权益后端门禁均未验证。
- Supabase→长期 model token 的 account broker 尚不存在；不得把自动刷新的 access JWT 直接放进 Hermes，也不得把 new-api 上游 token API 存在写成签发链路完成。
- 当前注册赠送 trigger 在 `auth.users insert` 时执行，可能早于邮箱 OTP 确认；真实未确认注册行为与防滥用策略未验证。

## 失败记录

- 暂无。
