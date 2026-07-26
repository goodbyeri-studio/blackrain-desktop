# Decisions

## 2026-07-26：Codex 源码锁跟进到 rust-v0.144.5，暂不采用 0.144.6

- 决策：Codex 目标锁从 rust-v0.144.1 / `44918ea` 跟进到 rust-v0.144.5 / `87db9bc`，保持原装黑盒，不修改 agent 内核。
- 原因：0.144.1 到 0.144.5 的 `app-server-protocol`、feature 开关、浏览器/Computer Use 相关文件无变化，包含 Windows 沙箱与危险命令识别修复；LICENSE/NOTICE 无变化。
- 0.144.6 虽仍在同一 patch 线，但刷新了 bundled model metadata 与基础提示词，并调整了上下文窗口，不能按“无行为变化补丁”直接继承本次评估，需单独做模型行为与 Windows 回归后再决定。
- 验证边界：本次只完成 tag/SHA、源码差异和 License 静态审计。0.144.5 尚未构建，未跑 capability shape、Windows GUI、真实模型、NSIS 或安装/卸载验证；0.144.1 的历史 macOS 证据不自动继承。

## 2026-07-11:42 方法表示壳层接线数,不表示无门控可用或 GUI 完成

- 决策:继续保留「42 个方法走完 5 层」的历史实装结论,同时强制附带三类状态:当前锁定内核重验、上游门控/stub、GUI 落地。
- 原因:RPC 包装可以编译且接受参数 shape,但运行时仍可能被 `experimentalApi`、OpenAI 认证、平台或上游 stub 拦截;前端也可能尚无入口。
- 影响范围:本 spec 与 spec 005 的所有「已接入/已就绪」表述。
- 后续复查条件:每次升级 codex 锁定版本都重跑探针;只有完成 Windows GUI E2E 的方法才能标为产品可用。

## 2026-06-28：接入范围按 code-mode-boundary 四类切,只接 A+B

- 决策：只接「可用」的 ClientRequest(A 类 bdd282f 新增 + B 类真缺口)；C 类(OpenAI 后端绑定)、D 类(realtime/remoteControl/feedback)不接。
- 原因：C 类接国产模型场景物理失效(无 ChatGPT 账号),D 类 v1 不做或壳已自实现。接了也是死代码。
- 依据：本 spec 的 [capability-gui-mapping.md](capability-gui-mapping.md) 功能接入覆盖表。

## 2026-06-28：严格照搬 5 层 archive_thread pattern,不发明新结构

- 决策：每个方法照 `archive_thread` 的 5 层链路克隆,params 层增量,骨架不动。
- 原因：壳⇄内核协议零改写是「内核原装」铁律;统一 pattern 降低出错面、便于像素级复刻前的批量接入。
- 替代方案：抽象一个泛型 dispatch——否,过早抽象,且偏离现有逐方法显式注册的可读风格。

## 2026-06-28：thread/delete 作为第一个验证 pattern 的样板

- 决策：先只实现 thread/delete(参数最简、clone archive),跑通 cargo check + typecheck,确认 5 层 pattern 在 bdd282f 上成立,再批量推其余。
- 原因：先证 pattern 再放量,避免 24 个方法一次性接完才发现链路有问题要全返工。

## 2026-06-28：复杂/变形参数方法用 `params: Value` 透传,简单的仍 typed

- 决策:参数为「多字段 / 嵌套对象 / 双重 Option(absent vs null 有别) / 原始 JSON event」的方法(batch-3a 的 `thread/goal/set`、`thread/settings/update`、`thread/metadata/update`、`thread/approveGuardianDeniedAction`),core/命令/IPC 收一个 `params: Value`,前端构造完整 kernel params 对象、壳原样转发;参数为简单标量/字符串/bool/字符串数组(enum 在 wire 层即字符串)的方法仍逐字段 typed(同 batch-1/2)。
- 原因:① `token_budget: Option<Option<i64>>` 用 typed `Option<i64>` 无法表达「不改(absent)vs 清空(null)」语义,naive 拼 json 会每次误清空;② `settings/update` 11 个 typed 字段含 ReasoningEffort/CollaborationMode/MultiAgentMode/Personality 等 exotic enum,5 层逐一 typed 极大且易错;③ `approveGuardianDeniedAction.event` 本就是 `JsonValue`,kernel 自己就是透传设计。
- 这不算「发明新结构」:`send_user_message_core` 已有 `collaboration_mode: Option<Value>` / `app_mentions: Option<Vec<Value>>` 的 Value 透传先例,只是把它从「子字段」扩到「整个 params」。前端负责构造正确的部分对象(含字段是否出现)。
- 验证手段:协议 shape 探针(`.scratch/m0_capability_probe.py`)对每个方法发真实 params,确认 kernel 不报 deny_unknown_fields,替代无头环境做不了的 GUI 冒烟。
