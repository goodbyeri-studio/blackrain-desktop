# Design

> 设计中的目标拓扑/配置示例不是实现或验证证据。凡描述现状,必须标明是「代码/配置存在」、「验证通过」还是「发布可交付」,并链接 `verification.md` 的真实记录。

## 总体方案

一句话说明实现策略。

## 架构边界

- 属于 `apps/desktop` 的逻辑：
- 属于 `gateway` 的逻辑：
- 属于 `plugins` / `workbenches` 的内容：
- 若涉及并行或暂停路线：与其他 spec 的交付物、代码所有权、依赖和验证边界：
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
