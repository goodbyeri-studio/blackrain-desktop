# 项目范围

BlackRain Desktop 是一个开源的 Electron Codex 客户端。它使用 OpenAI 开源的 `codex-rs` / `codex app-server` 作为唯一 agent runtime，在桌面宿主中补充窗口、文件、终端、Git、权限和 in-app Browser 等能力。

## 我们维护的范围

- Electron main、preload 和 React renderer 的桌面工作流。
- 与公开 app-server 协议的 stdio JSONL 连接和事件投影。
- main-owned Browser 页面、权限、下载、用户接管和恢复。
- 可选的独立 Model Gateway 协议适配器。
- 可审计的第三方来源、许可证和运行时锁定信息。

## 明确的边界

- BlackRain 不修改或分叉 `codex-rs` 的 agent loop，也不引入第二套 agent runtime。
- BlackRain 不复制、反编译或重新分发官方 Codex App 的闭源实现、私有 bundle、字体、图标或其他专有资源。
- BlackRain 不提供托管模型、账号后端、云端存储或商业 SLA。用户需要自行配置可用的 Codex Home 和 provider。
- 目前 Windows 是产品发布验收平台；macOS/Linux 主要用于开发和共享逻辑测试。
- 当前版本仍在快速迭代。自动化测试通过不等于签名 Windows 安装包已经发布。

## 与相关项目的关系

| 项目 | 关系 |
| --- | --- |
| `openai/codex` | BlackRain 使用的 agent 内核和 app-server 协议来源 |
| 官方 Codex App | 公开可观察行为和交互体验的参考，不是代码来源 |
| CodexMonitor | Electron/React 壳的部分上游来源，归属见 [NOTICE](../NOTICE) |
| Model Gateway | 可选的独立协议翻译进程，不拥有 thread、Browser 或 UI 状态 |

BlackRain 与 OpenAI、官方 Codex App 或 CodexMonitor 维护者没有官方隶属关系。

## 许可证

BlackRain 自有代码按根目录 [MIT License](../LICENSE) 发布。第三方代码、运行时和资源仍按各自许可证分发，完整归属见 [NOTICE](../NOTICE)。生成的 runtime、签名材料、账号数据、Cookie、日志和测试输出不属于源码发行物。

仓库公开化后仍会持续审查依赖、历史提交和第三方资源。公开仓库的状态不代表每个可选组件都适合再分发。

## 公开状态

仓库地址：<https://github.com/goodbyeri-studio/blackrain-desktop>

当前公开 `main` 包含 Electron 源码和开发测试基线。正式签名、安装、升级、回滚、卸载、真实站点/MFA 和完整 Windows 设备矩阵需要单独验证，发布说明不得省略这些限制。GitHub 公开前创建的旧 Pull Request 记录由平台单独保留，不能作为当前源码树或支持范围的依据。
