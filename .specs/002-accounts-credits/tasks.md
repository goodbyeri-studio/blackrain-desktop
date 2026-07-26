# Tasks

## 阶段 0：确认边界

- [x] 确认壳里无任何自有账号/后端（命中的 AccountSnapshot/CreditsSnapshot 均为 Codex 内核 ChatGPT 用量，非自有）。
- [x] 确认 DeepSeek pro:flash = 3:1（官方价：输入 1→3 元、输出 2→6 元 / 1M 缓存未命中）。
- [x] 选定账号/余额栈 = Supabase（Auth + Postgres），并验证最小过渡代理；生产项目边界收敛到 Cloud/MeiMei API，见 010。
- [x] 验证过渡代理部署形态：独立 `gateway/proxy.py` Chat 转发器常驻运行（不用 Edge Function）。
- [x] 验证 credit 记账：前置门禁 + 出对话单事务扣减，接受并发小幅超卖；不再称全局严格强一致。

## 阶段 1（M-A1）：账号地基（credit 只存不扣）

- [x] Supabase 项目：建 `profiles`（plan/credits）与 `credit_ledger` 表 + RLS，并已应用真实新加坡项目。
- [x] 注册赠送 trigger：`auth.users` insert → 建 profile（free, credits 占位）+ 写 signup_grant。（`*_signup_grant_trigger.sql`）
- [x] 桌面接入 Supabase JS SDK：注册、登录、登出。（`features/accounts/{config,supabaseClient,accountService}.ts`）
- [x] 会话持久代码接线：session token 存系统钥匙串，包含自动恢复/静默刷新逻辑。（Rust `account_session*` + 前端 `keychainStorage` adapter + `useAccount`；Windows 重开实机未跑）
- [x] 登录/注册 UI（design-system 原语，复用 chrome）。（`AccountAuthCard`，复用 ModalShell + settings 输入样式）
- [x] 首页展示当前 plan + credit 余额；设置展示 plan 与（占位）三档。（首页 `Home` 余额徽标/登录入口 + 设置区 `SettingsAccountSection` 三档）
- [x] 未登录门禁：`AccountProvider` + 全屏 `AccountGate` 四态分支；`unconfigured` 保留开发态本地可用。
- [x] 模型选择器显示 flash(0.5x)/pro(1.5x) 倍率标签。（`HomeModelMenu` + `creditPricing`）

## 阶段 2（M-A2）：最小代理 + credit 计量

- [x] 最小平台代理：`POST /v1/chat/completions` OpenAI 兼容转发，持平台 DeepSeek key。（`gateway/proxy.py`）
- [x] 代理校验 Supabase JWT（service-role），认出用户。（`/auth/v1/user` 校验，无效→401）
- [x] 代理查余额：≤0 返回结构化 `insufficient_credits`（402）。（转发前门禁，真实云端验证）
- [x] usage 计量：收尾读 input/output token，按倍率算 credit 消耗。（`credit_math`，混合单价 × 倍率 / 10000）
- [x] 原子扣 `profiles.credits` + 写 `credit_ledger`。（`spend_credits` RPC，单事务，真实云端验证）
- [x] 本地网关 credit 模式：base_url 指向代理、Authorization 带 JWT。（`gateway_registry_env_with_secrets` credit override + `api_key_file` 每请求读 JWT + `useCreditGatewaySync` 登录写文件/切模式重启；GUI 端到端待用户跑）
- [x] 代理 402 已由网关转成带 code 的 `response.failed`。（`ProviderHTTPError` + `do_POST._emit_failed`）
- [ ] Windows GUI 联调余额耗尽提示、升级/充值文案和余额刷新。
- [x] 代理日志脱敏（平台 key、JWT、用户内容）。（`redact()`，真实日志扫描无泄漏）

## 阶段 3：BYOK 锁 Plus

- [ ] 设置里 BYOK 入口仅 Plus 可用；Free 看到入口但被升级引导拦截。
- [ ] BYOK 模式：base_url 指向 `api.deepseek.com`、用用户自己的 key（沿用 001 的钥匙串存储）。
- [ ] 模式切换：credit ⇄ BYOK 正确改写网关 provider 配置，互不计费。

## 阶段 4：Cloud/MeiMei API 迁移接缝

- [x] 在 design/decisions 记录桌面侧 `base_url + Bearer <jwt>` 接缝目标。
- [x] 决定生产边界：Cloud 验证 Supabase 身份并维护商业账本；MeiMei API 基于 New API 中转和记录原始 usage；`proxy.py` 只保留为历史过渡实现。
- [x] 将 Supabase 服务端资产与历史 proxy 行为基线迁入 Cloud，并从 Desktop 删除对应服务端文件。
  - [ ] 在 Cloud 实现并部署 Supabase 身份到长期、可撤销、可限额 MeiMei API model token 的 account broker；Supabase 是 BlackRain 商业 ledger 真源，MeiMei API 是 usage/执行额度真源
- [ ] 为 CODE/Gateway 接入统一 credit 余额与结构化错误链路。
- [ ] 统一 001/002 对 BYOK 是否绕过 new-api 的口径。

## 阶段 5：验证和收口

- [x] `npm run typecheck` / 相关前端测试 / `npm run lint`。（2026-06-25，最高记录 1055 前端用例）
- [x] 改 Rust 后 `cargo check` + 相关模块检查。
- [x] credit 费率换算单测（3:1 比值）。
- [x] 将 `gateway/credit_math.py`、代理测试和 Supabase migration 迁出 Desktop；Cloud legacy 与前端类型中的旧“1M pro-等效”措辞仍须在定价重验时统一清理。
- [x] 代理：JWT 校验 / 扣余额原子性 / ledger 落账真实集成验证。
- [x] RLS：前端改不动 credits。
- [ ] 人工：注册→登录→看余额→对话→余额下降；Plus BYOK 不扣；耗尽被拦。
- [x] 在 `verification.md` 记录已有真实验证结果，并区分代码/云端/GUI。
- [ ] 更新受影响文档（README 状态、docs/commands 若新增命令）。
- [ ] Windows 实机：钥匙串 session 恢复/刷新、CODE credit GUI E2E、耗尽提示。
- [ ] 当前 CODE surface：credit GUI E2E 与 Plus BYOK 不计费；工作台 surface 落地后复用同一计量合同补测。
