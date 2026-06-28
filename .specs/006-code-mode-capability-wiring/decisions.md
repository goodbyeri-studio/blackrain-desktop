# Decisions

## 2026-06-28：接入范围按 code-mode-boundary 四类切,只接 A+B

- 决策：只接「可用」的 ClientRequest(A 类 bdd282f 新增 + B 类真缺口)；C 类(OpenAI 后端绑定)、D 类(realtime/remoteControl/feedback)不接。
- 原因：C 类接国产模型场景物理失效(无 ChatGPT 账号),D 类 v1 不做或壳已自实现。接了也是死代码。
- 依据：[code-mode-boundary.md](../003-dual-engine-architecture/code-mode-boundary.md) 附录功能接入覆盖表。

## 2026-06-28：严格照搬 5 层 archive_thread pattern,不发明新结构

- 决策：每个方法照 `archive_thread` 的 5 层链路克隆,params 层增量,骨架不动。
- 原因：壳⇄内核协议零改写是「内核原装」铁律;统一 pattern 降低出错面、便于像素级复刻前的批量接入。
- 替代方案：抽象一个泛型 dispatch——否,过早抽象,且偏离现有逐方法显式注册的可读风格。

## 2026-06-28：thread/delete 作为第一个验证 pattern 的样板

- 决策：先只实现 thread/delete(参数最简、clone archive),跑通 cargo check + typecheck,确认 5 层 pattern 在 bdd282f 上成立,再批量推其余。
- 原因：先证 pattern 再放量,避免 24 个方法一次性接完才发现链路有问题要全返工。
