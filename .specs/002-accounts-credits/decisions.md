# Decisions

## 2026-06-25：账号/计费后端用 Supabase

- 决策：账号认证 + 数据库用 Supabase（Auth 邮箱密码 + Postgres），不自建鉴权后端。
- 原因：最小化自运维负担，最快出 MVP；自带 Auth/RLS/SDK，桌面端直接接。
- 替代方案：自建 Node/Python + Postgres + 自写鉴权；或 Clerk(只认证)+ 独立 DB。
- 为什么不用替代方案：自建鉴权运维重、易出安全漏洞；Clerk 还得另配 DB，不如 Supabase 一站式。
- 影响范围：桌面登录/注册、profiles/ledger 表、代理校验 JWT。
- 后续复查条件：若需企业 SSO / 自主可控合规，再评估迁出 Supabase。

## 2026-06-25：credit 用户必须经服务端代理，平台 key 只在服务端

- 决策：Free/Plus/Pro 用平台赠送 credit 的对话，一律经平台云端代理；平台 DeepSeek key 只存服务端，绝不下发桌面。
- 原因：桌面 App 会被扒包，平台 key 一旦本地化即被白嫖；送 token 就必须由服务端持 key 并计量。
- 替代方案：key 打包进桌面 / 用混淆藏 key。
- 为什么不用替代方案：混淆挡不住扒包，等于公开 key；这是物理约束，无诚实捷径。
- 影响范围：最小代理、本地网关 credit 模式的 base_url/Authorization、计量。
- 后续复查条件：代理替换为 new-api 时，此约束不变（仍服务端持 key）。

## 2026-06-25：MVP 用最小代理，以后迁 new-api（接缝固定）

- 决策：MVP 自己做一个最小 OpenAI 兼容代理（转发 + 计量），不立即上 new-api 全套；对桌面暴露的 `base_url + Bearer <jwt>` 约定固定，以后用 new-api 顶替实现、桌面零改动。
- 原因：发行前先轻量跑通账号+计量链路；new-api 全功能中转作为独立项目后置。
- 替代方案：直接上 new-api。
- 为什么不用替代方案：new-api 体量大、现在上拖慢 MVP；接缝固定后迁移成本低。
- 影响范围：最小代理实现、迁移接缝约定。
- 后续复查条件：new-api 搭好后，按固定接缝顶替最小代理。

## 2026-06-25：模型倍率 flash 0.5x / pro 1.5x（比值钉死 DeepSeek 真实价）

- 决策：credit 费率比值锚定 DeepSeek 真实成本——pro 是 flash 的 3 倍（输入 1→3 元、输出 2→6 元 / 1M 缓存未命中，官方价证实）。表达为 flash 0.5x / pro 1.5x。
- 原因：倍率必须反映真实成本，否则在 pro 上亏钱或在 flash 上坑用户。
- 替代方案：照抄 Cursor 数字而不核对真实价。
- 为什么不用替代方案：脱离成本的倍率会算错账。
- 影响范围：代理计量、模型选择器倍率展示。
- 后续复查条件：DeepSeek 调价时同步更新倍率与锚定。

## 2026-06-25：BYOK 锁 Plus

- 决策：自带第三方 key（BYOK）仅 Plus+ 可用；Free 看到入口但被升级引导拦截。
- 原因：free 用户若能自带 key，等于绕过平台 token 差价（利润发动机）；锁 Plus 是「能力锁」而非「方便锁」。
- 替代方案：BYOK 对所有人开放。
- 为什么不用替代方案：会让 token 差价模式失效，且先养成 BYOK 习惯后难再收回。
- 影响范围：设置 BYOK 入口门禁、模式切换。
- 后续复查条件：定价/套餐定稿后复核门禁档位。

## 2026-06-25：credit 绝对锚定与价格暂留占位

- 决策：1 credit=多少 token、Plus/Pro 价格与额度，本阶段留占位（暂定 100 credit ≈ 1M pro-等效 token），集中在代理配置/Supabase 改，不散落代码。
- 原因：发行前定价未定；先把机制做实，数值后填。
- 替代方案：现在拍死价格。
- 为什么不用替代方案：缺真实盲测/成本数据，拍死易返工。
- 影响范围：代理费率配置、profiles 默认 credits。
- 后续复查条件：定价定稿后更新本条并回填数值。

## 2026-06-25：最小代理 = 独立 Chat Completions 转发器，部署成常驻服务（修正 gateway.py 复用表述）

- 决策：MVP 最小代理是一个**独立的 OpenAI Chat Completions 转发器**（`gateway/proxy.py`），职责 = 校验 JWT + 查/扣 credit + 注入平台 DeepSeek key + usage 计量；部署到轻量常驻主机（Fly.io / Railway / 小 VPS），不重写为 Supabase Edge Function。
- 协议边界（关键）：**代理入站/出站都说 Chat Completions**。`responses⇄chat` 翻译**只留在本地网关 `gateway.py` 一份**（铁律 2）。credit 模式下数据流为：内核(Responses) → 本地网关(翻译成 Chat) → 平台代理(Chat：鉴权+计量+注平台 key) → DeepSeek。代理**不做翻译**，故无「最危险代码」需要重写——铁律 2 天然满足。
- 修正：早前表述「最小代理 = 复用 gateway.py / 同一份两处部署」**不准确**。本地网关说 Responses（codex 专用），若代理也说 Responses，则 new-api（只懂 Chat Completions）无法顶替，迁移接缝作废。故代理改为独立 Chat 转发器；与 gateway.py 仅共享小工具（日志脱敏、流式读取惯例），不共享翻译。
- 原因：① 翻译留一份，最易碎代码零改动；② 计量须看完整流（usage 在流末尾 `chunk.usage`），agent 任务长，Edge Function 执行时限会掐断长流，LLM 这一跳需常驻进程；③ 代理入站/出站皆 Chat Completions，与 new-api **同形态**，以后零改动顶替。
- 替代方案：(a) 代理说 Responses（复用整份 gateway.py）；(b) Supabase Edge Function 重写。
- 为什么不用替代方案：(a) 破坏 new-api 迁移接缝；(b) edge 时限扛不住长 agent 流、且无必要重写。
- 影响范围：`gateway/proxy.py` 实现与部署、本地网关 credit 模式 provider 配置（base_url=代理、key=JWT）、迁移接缝。
- 备注：Supabase 仍管账号/DB/扣款 RPC（`spend_credits`）；仅 LLM 转发+计量这一跳放常驻代理。
- 后续复查条件：new-api 搭好后按 `base_url + Bearer <jwt>` 接缝顶替 `proxy.py`，清理临时代理。

## 2026-06-25：credit 强一致实时扣减，接受并发小幅超卖

- 决策：① 转发前门禁——`profiles.credits > 0` 才转发，否则拒（`insufficient_credits`）；② 出对话后拿 usage，用 Supabase Postgres RPC 在单事务内原子扣减 `credits` + 写 `credit_ledger`。余额每轮真实下降、立即反映。
- 原因：用户要实时性；单事务扣减保证单次不超扣。
- 并发取舍：同一用户并发多轮可能都过了「转发前>0」门禁、各自扣到负。**接受**这种小幅为负，下次充值补齐即可（桌面单用户并发低、风险有界）。
- 替代方案：异步批量结算（弱一致）；或对话前预授权冻结上限、结束多退少补（强准但重）。
- 为什么不用替代方案：异步不满足实时；预授权对 MVP 过重。预授权列为后续可选精细化。
- 影响范围：代理转发前后逻辑、扣款 RPC、余额耗尽错误链路。
- 后续复查条件：若并发超卖造成实际损失，再上预授权冻结。

## 2026-06-25：登录开屏门禁 + 会话优先 / 离线只放 BYOK·本地

- 决策：未登录走**全屏登录开屏**（`AccountGate` 在 App 根部门禁），而非首页内联小入口。门禁分支：
  - `unconfigured`（无 Supabase env，dev/本地）→ 直接进，不拦（保本地可用）。
  - `loading`（恢复会话中）→ 开屏占位。
  - `signed-out`（无缓存会话 / 显式登出）→ 登录页。
  - `signed-in`（含离线缓存会话，profile 可能为空）→ 进 App。
- **会话优先**：开屏先从钥匙串恢复缓存会话，有效则直接进（返回用户不必每次看登录页）。
- **离线宽限**：缓存会话已恢复（signed-in）但后端连不上时**仍放进 App**，credit 功能按 `online` 降级（余额「暂不可用」、credit 对话失败才提示），BYOK / 本地 / git 不受影响。这是为了不让「Supabase 国内可达性」（spec 头号风险）把整个 App 锁死。
- 账号状态收口到单一真源 `AccountProvider`（context），全 App 共享一套状态机 + 订阅，避免多组件各跑一套打架。
- 原因：credit 计费产品的核心价值依赖身份；开屏比内联入口清晰；离线宽限避免后端抖动锁死本地能力。
- 替代方案：(a) 纯硬墙（每次启动必连后端校验）；(b) 维持首页内联登录。
- 为什么不用替代方案：(a) 国内网络一抖就进不去、误伤 BYOK / 本地用户；(b) 入口太弱、与「登录优先」心智不符。
- 影响范围：`App.tsx` 包裹 `AccountProvider`+`AccountGate`；首页移除内联登录/门禁；设置区账号管理 + 积分额度条 + 登出。
- 后续复查条件：若离线宽限被滥用（伪造本地会话蹭功能），收紧为离线禁用 credit 全功能。

## 被推翻的方案

### 2026-06-25：出厂自带「默认可用模型」让用户直接对话

- 原方案：App 出厂自动选中 deepseek-v4-flash，用户开箱即可对话。
- 为什么推翻：未登录/未获 credit 即「假装能用」会在内核层出错；改为「先登录拿 credit 或填 key，再选模型」。
- 替代方案：账号 + credit 决定能否对话；模型选择器仍有 flash/pro 两项，但需先具备可用额度。
