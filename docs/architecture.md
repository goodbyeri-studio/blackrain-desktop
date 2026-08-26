# 架构

## 运行时

```text
React renderer
  -> typed preload API
  -> Electron main
       ├─ app-server client (stdio JSONL)
       ├─ 文件 / Git / 终端 / 窗口 / 权限 / 更新
       └─ Browser backend (WebContentsView)
原装 codex app-server
  -> codex-rs / 标准 Codex Home / thread 与 turn
可选 Model Gateway sidecar
  -> Provider 协议翻译、Router、多模型与 Auto
```

Electron 是唯一生产宿主；`codex-rs` / `codex app-server` 是唯一 agent runtime。BlackRain 只启动、连接和投影 app-server，绝不 fork、改写或平行实现其 agent loop。

## 所有权

| 能力 | 唯一所有者 |
| --- | --- |
| thread、turn、item、审批、停止、恢复与持久化 | `codex app-server` |
| 窗口、文件、Git、终端、更新和系统能力 | Electron main |
| UI 展示与前端交互状态 | React renderer |
| 页面、session、权限、下载、CDP 和恢复 | Electron main Browser backend |
| Provider 协议翻译与路由 | 独立 Gateway sidecar |

renderer 不能访问 Node.js、原始 IPC、app-server transport 或 Browser `WebContents`。网页不能得到应用 preload、IPC 或本地文件和进程权限。

## 关键合同

- preload 只提供类型化 allowlist；main 对 sender、schema、窗口、workspace/thread、route、profile 和 generation 二次校验。
- Electron 使用上游标准 Codex Home，并与原生 CLI 共享配置、认证和可恢复 thread；不另建隐藏的 BlackRain `CODEX_HOME`。
- main 通过 stdio JSONL 连接锁定版本的 `codex app-server`。断连、畸形消息、超时与退出都必须成为结构化 UI 状态，而不是触发备用 runtime。
- Browser 由 main 创建和持有；其细节见 [Browser 与 Computer Use](browser.md)。
- Gateway 只能做协议翻译和路由。它不能读取 Browser Cookie、拥有 thread、复制事件状态或成为 Codex 默认路径的隐式依赖。

## 状态证据

| 状态 | 含义 |
| --- | --- |
| `CODE_EXISTS` | 源码、配置或测试入口存在 |
| `RUN_PASS` | 指定环境的自动化检查通过 |
| `PRODUCT_PASS` | 已签名并公证的 macOS 制品通过安装、核心流程、升级、回滚、卸载和恢复验收 |

三种状态不能互相推导。长期取舍记录在 [ADR](adr/README.md)。
