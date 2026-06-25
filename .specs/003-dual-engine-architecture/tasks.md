# Tasks

## 阶段 0：确认边界

- [x] 阅读相关 `README.md` / `docs/` / `AGENTS.md`
- [x] 确认是否涉及 `apps/desktop/AGENTS.md`（涉及：壳新增 WORK surface + 子进程纳管）
- [x] 确认是否触碰 `codex-upstream`，默认不改内核（不改，仍为黑盒）
- [x] 列出需要验证的真实命令或探针（见 verification）
- [ ] Hermes 数据飞轮关闭外传：读源码确认配置开关
- [ ] Hermes Python 依赖树许可证体检（拦 GPL/AGPL/BSL/无协议）

## 阶段 1：最小可用（1 周 Spike，验承重假设）

- [ ] WORK：监工壳以子进程纳管 Hermes，经 `/v1` + 命名 provider 接 new-api → GLM，**无网关**跑通（配 `default_headers` 防 WAF 拦）
- [ ] CODE：codex app-server + 专属 `CODEX_HOME` 跑通（沿用现有链路）
- [ ] 外置记忆共享存储最小原型：两引擎读写同一份
- [ ] 跨模式端到端：「Hermes 理解需求 → 切干净子任务 → codex 造一个插件 → 回 Hermes 带用户用」
- [ ] 过关判据：多轮不丢上下文 / 流式不断 / function calling 不在中转丢 / 两模式读到同一条记忆 / new-api 两条路径都计到量

## 阶段 2：产品化

- [ ] WORK / CODE 两个 surface 成形（面向两拨人）
- [ ] 从 Hermes Desktop 借 MIT React 组件（skills/memory/provider 面板）进 Tauri 壳
- [ ] new-api 差价计费跑通一个真实垂类（番茄小说例，见 memory `2049-first-loop-design`）
- [ ] 编排器：跨模式子任务切分/回传逻辑 + 测试

## 阶段 3：收口

- [ ] computer-use MCP sidecar 接入（评 `trycua/cua`，两引擎共用）
- [ ] 外置 skills 自进化雏形 + 插件市场雏形
- [ ] 更新文档和 spec（docs/03、docs/02 指针 + 本 spec）
- [ ] 跑完验证写入 `verification.md`
- [ ] 记录未解决风险
