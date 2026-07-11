# Hermes v2026.7.7.2 contract fixtures

这些 fixtures 根据 `hermes-upstream` commit `9de9c25f620ff7f1ce0fd5457d596052d5159596` 的 `gateway/platforms/api_server.py` 和对应测试人工稳定化生成。

用途：

- Rust raw protocol 反序列化和 normalizer 测试。
- TypeScript contract fixture 测试。
- fake Hermes server 的标准场景输入。
- 上游升级时的 contract regression diff。

约束：

- 不是网络抓包，不证明真实 Hermes 或 Windows 运行通过。
- ID、时间、路径、文本和 token usage 均为无敏感数据的固定样例。
- raw decoder 必须容忍新增字段、未知事件和未知状态。
- `sse-normal.txt` 保留真实 SSE framing，包括 comment/keepalive/close。
- `sse-approval-*`、`sse-failures.txt`、`sse-duplicates-unknown-out-of-order.txt` 是用锁定版本合法 payload 组合的 BlackRain 故障注入场景，不声称上游一定按该顺序产生事件；真实上游行为仍以源码和后续集成测试为准。
