# Remote Backend POC（历史）

早期 remote backend/daemon POC 已从生产代码删除，不是当前 Desktop 启动、调试或发布入口。当前 Electron main 直接监管原装 `codex.exe app-server`，thread/turn 只有一套真源。

任何远程形态必须先建立独立 spec，定义鉴权、设备/用户 ownership、传输安全、状态恢复和产品验收；不得恢复旧 POC 作为 fallback。
