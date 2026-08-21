# 上游与参考

| 项目 | 用途 | 许可证 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | agent runtime 和 app-server 协议 | Apache-2.0 |
| [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) | Electron/React 壳的部分上游来源 | MIT |
| [Electron 文档](https://www.electronjs.org/docs/latest/tutorial/security) | WebContentsView、session 和安全约束 | MIT |

精确的 Codex commit、Windows package hash、Node runtime 和 Browser adapter hash 由 `apps/desktop/resources/**/runtime-lock.json` 与相邻 manifest 锁定；更新时不要只改文档中的版本号。

## 参考原则

- 官方 Codex App 只作为合法可观察行为参考，不授权复制闭源代码、私有 client 或资源。
- 其他开源项目只提供通用 Electron 工程经验，不改变 BlackRain 的单一 agent runtime 和 main-owned Browser 边界。
- `codex-upstream/` 是 gitignored 的只读参考克隆，不是产品依赖。

第三方归属和许可证见 [NOTICE](../../NOTICE)。
