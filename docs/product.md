# 产品定义

## 一句话

BlackRain Desktop 是基于开源 `codex-rs` / `codex app-server` 独立实现的开源 Codex Desktop。它先对齐官方闭源 Codex Desktop 的可观察功能与体验，再提供不改变 Codex 内核的 BlackRain 扩展。

## 当前优先级

1. macOS Electron 客户端：稳定的 Codex thread、审批、停止、恢复与标准 Codex Home。
2. 桌面宿主：文件、终端、Git、diff、窗口、权限、更新和诊断。
3. in-app Browser 与 Computer Use：用户和 agent 共享同一个安全隔离的页面。
4. macOS 产品工程：打包、签名、公证、安装、升级、回滚、卸载与恢复验收。

当前仓库还没有 macOS `PRODUCT_PASS`。现有 Electron 代码或自动化结果只能证明对应范围的 `CODE_EXISTS` 或 `RUN_PASS`。

## BlackRain 扩展

Router、多模型 Provider、Model Gateway 和 Auto 是 BlackRain 自身的可选扩展层。它们可以增加模型选择和协议适配，但必须保持以下不变量：

- `codex-rs` / `codex app-server` 是唯一 agent runtime；
- app-server 是 thread、turn、审批、停止、恢复和持久化的唯一真源；
- Gateway 是独立 sidecar，不拥有 UI、Browser 或 agent 状态；
- 扩展不可用时必须明确降级，不能静默切换到第二套 runtime。

## 不在当前范围

- BlackRain Cloud、账号服务、托管模型、云端 Browser、团队协作和商业 SLA；未来需要时在独立仓库和产品边界内建设。
- 移动端、Windows 和 Linux 正式发行。Windows 客户端已明确**暂停开发、不构建、不发行**，列为 TODO；其 runtime lock、vendor 脚本与 MSIX 配置刻意保留以便将来恢复，但不在当前 CI 覆盖内。边界与保留清单见[开发与发布](development.md)。
- 复制、反编译或再分发官方 Codex Desktop 的闭源代码、私有 bundle、字体、图标或服务实现。
- 将 `plugins/`、`workbenches/` 的实验内容自动加入默认产品或发行依赖。

## 关系与来源

| 对象 | 与 BlackRain 的关系 |
| --- | --- |
| `openai/codex` | 唯一 agent 内核与 app-server 协议来源；保持原装黑盒调用 |
| 官方 Codex Desktop | 产品行为与体验参考；实现和云端服务均非代码来源 |
| CodexMonitor | 现有部分 Electron/React 文件的历史来源，正在逐域退役；归属必须保留在 NOTICE |
| Paseo、Computer Use 类项目 | 可研究的开源工程参考，不是产品上游或运行时依赖 |

完整来源和许可证见[上游与来源](upstream.md)与根目录 [NOTICE](../NOTICE)。
