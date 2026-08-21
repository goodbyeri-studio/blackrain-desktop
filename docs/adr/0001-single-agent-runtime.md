# ADR 0001：单一 agent runtime

- 状态：已接受
- 日期：2026-08-22

## 背景

桌面宿主需要 thread、turn、审批、工具和恢复能力。复制这些状态机会产生分叉行为和不可预测的恢复路径。

## 决策

BlackRain 只调用原装 `codex app-server` / `codex-rs`，由它拥有 agent 状态、事件和 ThreadStore。Electron main 只做 transport、生命周期、权限和 UI 投影。

## 影响

上游协议变化需要更新 adapter 和 fixture，但不通过 fork 内核解决；Gateway 也不能拥有 thread 或 Browser 状态。
