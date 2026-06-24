# Verification

> 本 spec 尚处方案阶段，实现后须逐项跑验证并回填真实结果与日期。

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-25 | spec 创建 | 文档落地 | 通过 | 仅文档，尚未改实现代码 |
| YYYY-MM-DD | 账号注册/登录 | 桌面手动 + Supabase 控制台 | 未跑 | 注册→建 profile→赠送 credit |
| YYYY-MM-DD | 会话态持久 | 重开 App | 未跑 | 自动恢复、过期刷新 |
| YYYY-MM-DD | credit 费率换算单测 | `cd apps/desktop && npm run test -- <费率测试>` | 未跑 | flash:pro = 1:3 |
| YYYY-MM-DD | 模式切换 → provider 配置 | shared core 单测 | 未跑 | credit/BYOK base_url+Authorization |
| YYYY-MM-DD | 代理 JWT 校验 + 扣余额原子性 | 代理集成测试 | 未跑 | 并发扣减不超卖 |
| YYYY-MM-DD | RLS 前端改不动 credits | Supabase 策略测试 | 未跑 | 前端只读 |
| YYYY-MM-DD | 余额耗尽拦截 | 手动置 0 余额对话 | 未跑 | 返回 insufficient_credits → response.failed |
| YYYY-MM-DD | 真实 DeepSeek 经代理计量 | 起代理 + 真实 key 跑一轮 | 未跑 | usage 正确、credit 下降合理 |
| YYYY-MM-DD | Plus BYOK 不计 credit | 手动 | 未跑 | BYOK 对话余额不变 |
| YYYY-MM-DD | typecheck / lint | `npm run typecheck` / `npm run lint` | 未跑 | |
| YYYY-MM-DD | Rust 检查 | `cd apps/desktop/src-tauri && cargo check` | 未跑 | 若改 Rust |

## 已验证

- spec 五文档已创建。
- 边界已确认：壳无自有账号/后端；DeepSeek pro:flash = 3:1（官方价）。
- 后端栈 = Supabase；对外形态 = 最小服务端代理（以后迁 new-api）。

## 未验证风险

- 输入/输出分计 vs 混合单价未定；思考模式 reasoning token 计入方式未定。
- 价格、Plus/Pro 额度未定，全为占位。
- Supabase 在国内的网络可达性 / 合规边界未评估（登录、实时余额依赖其可用性）；发行前须实测国内直连。
- 并发超卖（接受小幅为负、下次充值补齐）的实际损失规模未观测；若偏大需上预授权冻结。
- 常驻代理的部署/运维（Fly/Railway 等）与平台 key 的服务端保管尚未实操验证。

## 失败记录

- 暂无。
