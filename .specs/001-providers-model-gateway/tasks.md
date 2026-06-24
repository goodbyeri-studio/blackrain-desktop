# Tasks

## 阶段 0：确认边界

- [x] 创建本 spec，固化 M1 模型网关方向。
- [x] 盘点 `apps/desktop` 现有 Settings、model picker、Codex config 写入路径。
- [x] 盘点 `gateway/gateway.py` 当前协议能力和缺口。
- [x] 确认 provider 配置存储位置和 key 存储方案。
- [x] 确认 Gateway sidecar 由 App 托管的启动/停止/健康检查路径。

## 阶段 1：固定 BlackRain Gateway Provider

- [x] dev-client 写入 `CODEX_HOME/config.toml` 时使用固定 `blackrain_gateway` provider。
- [x] 移除 dev 路径中“Codex 直接理解 DeepSeek provider”的假设。
- [x] 为 dev-client 保留默认 `deepseek-v4-flash`，但通过 Gateway registry 表达。
- [x] 增加 config 写入测试，确保缺省路径走 App data 下的专属 `CODEX_HOME`。

## 阶段 2：Gateway Registry

- [x] 定义 provider/model registry 数据结构。
- [x] Gateway 支持聚合 `/v1/models`。
- [x] Gateway 根据请求 `model` 解析真实 provider 和 upstream model。
- [x] DeepSeek provider 迁入 registry。
- [x] 支持自定义 OpenAI-compatible Chat provider 的最小配置。

## 阶段 3：模型网关设置页

- [x] 新增 Settings 中的“模型网关”页面入口。
- [x] 实现 provider 列表和启用/禁用。
- [x] 实现 provider 新增表单。
- [ ] 实现 provider 编辑表单。
- [x] 实现 API key 输入和系统凭据安全存储接入。
- [x] 实现测试连接和模型列表刷新。
- [x] 实现 Gateway runtime 状态、启动、停止、端口和日志路径展示。
- [x] 实现启动前 readiness / empty state，缺 provider、缺 key、缺模型时禁止启动并给出明确提示。
- [x] 支持手动添加模型。
- [x] 支持设置全局默认模型。

## 阶段 4：对话模型选择器

- [x] 找到现有 model picker 数据源。
- [x] 改为读取 Gateway/App registry。
- [ ] 按 provider 分组展示模型。
- [ ] 显示模型能力标签。
- [x] 新线程使用全局默认模型。
- [x] 线程级模型覆盖可持久化。
- [ ] 模型不可用时显示清晰降级状态。

## 阶段 5：Gateway 生产化最小补强

- [x] 错误响应统一转成 Codex 可消费的 `response.failed`。
- [x] 单工具多轮 SSE 事件顺序经真实 DeepSeek 工具调用验证不触发内核 panic。
- [x] Gateway sidecar 启动前把系统凭据中的 provider key 注入 registry，不把 key 写入 settings/Codex config。
- [x] Tauri 打包配置纳入 `gateway/gateway.py` resource，并加配置测试守护。
- [x] 做 macOS Keychain 真实写入/读取/清理 smoke。
- [x] 做 macOS app/dmg 真实打包资源 smoke。
- [ ] 补并行多工具和 3+ 轮深循环测试。
- [ ] 处理 `namespace` 工具的策略：支持、显式拒绝、或转发为普通工具。
- [ ] 补模型元数据 fallback warning 的处理或 UI 提示。
- [x] Gateway 日志默认脱敏 API key 和请求敏感字段。

## 阶段 6：验证和收口

- [x] 跑 `npm run typecheck`。
- [x] 跑相关前端测试。
- [x] 跑 Gateway Python 语法和 `/v1/models` smoke。
- [x] 跑模型网关 shared core 单测。
- [x] 改 Rust 后跑 `cd apps/desktop/src-tauri && cargo check`。
- [x] 跑协议四探针。
- [x] 跑真实 DeepSeek 工具调用。
- [x] 跑无签名 macOS app/dmg 打包、dmg 挂载资源检查和短启动 smoke。
- [x] 在 `verification.md` 记录每次真实验证结果。
- [x] 更新 `README.md` / `docs/commands.md` / `gateway/README.md` 中受影响的命令和状态。
