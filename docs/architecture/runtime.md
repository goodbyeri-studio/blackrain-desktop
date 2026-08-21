# 运行时生命周期

这份文档描述当前 Electron 运行时的公开生命周期，不是内部迁移任务或发布日期承诺。

## 启动顺序

```text
app ready
  -> load Electron app state
  -> create bootstrap window
  -> start codex app-server
  -> initialize / initialized
  -> restore workspace and thread
  -> attach Browser views
```

窗口会先于 app-server 显示，以便在未登录、启动失败或恢复失败时提供 degraded、重试和诊断状态。失败不会静默切换到另一套 runtime。

## 运行中

- app-server 负责 thread、turn、item、审批、工具和持久化事件。
- main 将上游事件标准化后发送给 renderer；renderer 只维护展示和交互状态。
- Browser backend 按 window、thread、profile、route 和 generation 校验每次操作。
- Gateway（若启用）只处理模型协议，不参与桌面状态或 Browser 生命周期。

## 退出与恢复

关闭窗口或收到退出请求时，main 先停止新请求，再取消 pending IPC、结束 Browser 控制、关闭 app-server 和子进程，最后写入必要的诊断状态。重启时由 app-server 和标准 Codex Home 恢复可恢复 thread，Electron 不复制第二份会话真源。

## 状态层级

| 状态 | 含义 |
| --- | --- |
| `CODE_EXISTS` | 代码、配置或测试入口存在 |
| `RUN_PASS` | 指定环境的自动化检查通过 |
| `PRODUCT_PASS` | 目标 Windows 签名制品通过安装、核心流程、升级、回滚和卸载矩阵 |

状态之间不能相互推导。当前开发基线不代表正式签名 Windows 产品已经发布。
