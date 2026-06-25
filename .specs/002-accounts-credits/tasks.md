# Tasks

## 阶段 0：确认边界

- [x] 确认壳里无任何自有账号/后端（命中的 AccountSnapshot/CreditsSnapshot 均为 Codex 内核 ChatGPT 用量，非自有）。
- [x] 确认 DeepSeek pro:flash = 3:1（官方价：输入 1→3 元、输出 2→6 元 / 1M 缓存未命中）。
- [x] 选定后端栈 = Supabase（Auth + Postgres）；对外形态 = 最小服务端代理（以后迁 new-api）。
- [x] 决定最小代理部署形态：复用 `gateway.py` 部署成常驻服务（不用 Edge Function）。
- [x] 决定 credit 实时性：强一致（前置门禁 + 出对话原子扣减），接受并发小幅超卖。

## 阶段 1（M-A1）：账号地基（credit 只存不扣）

- [x] Supabase 项目：建 `profiles`（plan/credits）与 `credit_ledger` 表 + RLS。（`supabase/migrations/*_profiles_and_ledger.sql`；待用户接真实项目应用）
- [x] 注册赠送 trigger：`auth.users` insert → 建 profile（free, credits 占位）+ 写 signup_grant。（`*_signup_grant_trigger.sql`）
- [x] 桌面接入 Supabase JS SDK：注册、登录、登出。（`features/accounts/{config,supabaseClient,accountService}.ts`）
- [x] 会话态持久：session token 存系统钥匙串，重开 App 自动恢复，过期静默刷新。（Rust `account_session*` + 前端 `keychainStorage` adapter + `useAccount`）
- [x] 登录/注册 UI（design-system 原语，复用 chrome）。（`AccountAuthCard`，复用 ModalShell + settings 输入样式）
- [x] 首页展示当前 plan + credit 余额；设置展示 plan 与（占位）三档。（首页 `Home` 余额徽标/登录入口 + 设置区 `SettingsAccountSection` 三档）
- [x] 未登录门禁：对话入口引导登录。（`Home` blockEntry/shouldPromptLogin：signed-out 弹登录卡片，loading 静默等待，unconfigured 不拦截）
- [x] 模型选择器显示 flash(0.5x)/pro(1.5x) 倍率标签。（`HomeModelMenu` + `creditPricing`）

## 阶段 2（M-A2）：最小代理 + credit 计量

- [ ] 最小平台代理：`POST /v1/chat/completions` OpenAI 兼容转发，持平台 DeepSeek key。
- [ ] 代理校验 Supabase JWT（service-role），认出用户。
- [ ] 代理查余额：≤0 返回结构化 `insufficient_credits`（402）。
- [ ] usage 计量：收尾读 input/output token，按倍率算 credit 消耗。
- [ ] 原子扣 `profiles.credits` + 写 `credit_ledger`。
- [ ] 本地网关 credit 模式：base_url 指向代理、Authorization 带 JWT。
- [ ] 余额耗尽 → 网关转 `response.failed` → 前端提示升级/充值。
- [ ] 代理日志脱敏（平台 key、JWT、用户内容）。

## 阶段 3：BYOK 锁 Plus

- [ ] 设置里 BYOK 入口仅 Plus 可用；Free 看到入口但被升级引导拦截。
- [ ] BYOK 模式：base_url 指向 `api.deepseek.com`、用用户自己的 key（沿用 001 的钥匙串存储）。
- [ ] 模式切换：credit ⇄ BYOK 正确改写网关 provider 配置，互不计费。

## 阶段 4：迁移接缝（仅预留，不实现）

- [ ] 固定代理对桌面的 `base_url + Bearer <jwt>` 约定，记录到 design，供 new-api 顶替。

## 阶段 5：验证和收口

- [ ] `npm run typecheck` / 相关前端测试 / `npm run lint`。
- [ ] 改 Rust 后 `cargo check` + 相关 shared core 单测。
- [ ] credit 费率换算单测（3:1 比值）。
- [ ] 代理：JWT 校验 / 扣余额原子性 / ledger 落账 集成测试。
- [ ] RLS：前端改不动 credits。
- [ ] 人工：注册→登录→看余额→对话→余额下降；Plus BYOK 不扣；耗尽被拦。
- [ ] 在 `verification.md` 记录每次真实验证结果。
- [ ] 更新受影响文档（README 状态、docs/commands 若新增命令）。
