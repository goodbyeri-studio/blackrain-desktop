# App Server

`codex app-server` 是 thread、turn、item、工具调用、审批、停止、恢复和 ThreadStore 的唯一真源。BlackRain main 只实现客户端连接、生命周期、权限边界和 UI 投影。

## 连接

- main 启动锁定版本的 `codex.exe app-server` 子进程。
- stdin/stdout 使用逐行 JSON（JSONL）；stderr 单独进入脱敏诊断。
- 客户端处理 request、response、notification、server request、EOF、畸形 JSON、超时和子进程退出。
- renderer 永远看不到 stdin/stdout、RPC id 或子进程句柄。

## 生命周期

```text
spawn -> initialize -> initialized -> thread/start|resume
      -> turn/start -> stream events -> turn/completed
      -> unsubscribe / graceful shutdown
```

连接断开时 main 清理 pending request、通知 UI，并按策略重新初始化和恢复 thread。恢复状态由 app-server 返回，不由 Electron 复制到第二个存储中。

## 升级

上游版本锁定在 `apps/desktop/resources/codex/runtime-lock.json`。升级必须重跑协议探针、事件 fixture、MCP 检查、typecheck、测试和 Windows smoke；历史协议观察不能替代当前验证。
