# Design

## 总体方案

一句话说明实现策略。

## 架构边界

- 属于 `apps/desktop` 的逻辑：
- 属于 `gateway` 的逻辑：
- 属于 `plugins` / `workbenches` 的内容：
- 明确不改 `codex-upstream` 的部分：

## 数据流

```text
用户动作
  -> App UI
  -> Tauri/Rust 或 app-server
  -> Codex 内核 / 网关 / 插件
  -> 结果回到 UI
```

## 接口与配置

- Tauri command / JSON-RPC：
- `config.toml` / `CODEX_HOME`：
- 环境变量：
- 文件布局：

## 失败模式

- 上游协议失败：
- 模型/网关失败：
- 配置损坏：
- 权限/沙箱失败：
- 用户可见降级：

## 测试策略

- 单元测试：
- 集成测试：
- 协议探针：
- 人工验证：
