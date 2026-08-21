# ADR 0003：沿用标准 Codex Home

- 状态：已接受
- 日期：2026-08-22

## 背景

用户需要在 CLI 和桌面客户端之间共享配置、登录态和可恢复 thread。另建隐藏目录会产生第二份状态和难以诊断的权限问题。

## 决策

默认使用上游解析的标准 Codex Home。Electron 自有 app state 和 Browser profile 使用独立目录；Electron 不直接读取或改写 Codex auth、rollout 或 SQLite 文件。

## 影响

用户切换 Home 时必须重新校验 workspace、thread 和 Browser profile ownership。BlackRain 自有 provider secret 只能进入系统安全存储，不进入 Codex 文件或日志。
