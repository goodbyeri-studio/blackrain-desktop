# BlackRain

BlackRain 是 AI 驱动的垂类工作环境平台：把领域高手的工具、环境、方法和验证封装成普通人可以安装的工作台，让高度电脑化的长尾领域快速获得可复现、可验证的专业工作环境。

## 当前产品

Windows MVP 由一个 Tauri 桌面客户端承载：

- 工作台包检查、依赖验证、安装、激活记录和卸载
- 单一原装 codex 内核，以及面向任务的工作台 surface 和面向开发的 CODE surface
- 独立模型网关，将 Responses 请求转换为 Chat Completions
- new-api 计量与模型提供商接入
- 插件、Skills、OfficeCLI 和项目资源管理

工作台包生命周期与会话执行解耦。目标由 Session Orchestrator 把已验证激活记录编译成受控 codex 会话；当前该编排层和工作台 surface 尚未实现，因此安装或激活成功不代表任务已经可以运行。

## 运行时

```text
BlackRain Desktop
  ├─ Workbench Core
  │   └─ inspect / install / verify / activate / deactivate
  ├─ Session Orchestrator
  │   └─ verified activation -> controlled codex session
  ├─ Workbench surface / CODE surface
  ├─ codex app-server（唯一原装 agent 内核）
  │   └─ App 专属 CODEX_HOME
  └─ Model Gateway
      └─ new-api -> 模型提供商
```

codex 只发 Responses 协议，国产模型通常只提供 Chat Completions，因此网关是所有 codex 模型会话的硬依赖。翻译逻辑只存在于独立 sidecar，不进入 UI、工作台层或内核。

## 仓库

```text
apps/desktop/      Tauri 桌面客户端
gateway/           统一模型协议翻译网关原型
plugins/           工具与软件适配器
workbenches/       专家工作台包
.specs/            跨层功能 living specs
docs/              产品、架构与运行手册
codex-upstream/    gitignored 的只读上游参考克隆
```

## 真源

- 产品形态：[docs/04-产品形态.md](docs/04-产品形态.md)
- 运行时架构：[docs/09-运行时架构与里程碑.md](docs/09-运行时架构与里程碑.md)
- 工作台包：[.specs/008-expert-workbench-package/](.specs/008-expert-workbench-package/)
- 工作台会话执行：[.specs/011-workbench-session-orchestration/](.specs/011-workbench-session-orchestration/)
- Windows 发布：[.specs/007-windows-client/](.specs/007-windows-client/)
- CODE GUI：[.specs/005-gui-redesign/](.specs/005-gui-redesign/)
- 能力接线：[.specs/006-code-mode-capability-wiring/](.specs/006-code-mode-capability-wiring/)
- 三项目边界：[.specs/010-three-project-platform/](.specs/010-three-project-platform/)
- 命令入口：[docs/commands.md](docs/commands.md)

## 当前状态

已具备 CODE 壳、模型网关原型、工作台 Manifest 检查、Office 官方包安装事务和激活记录。Session Orchestrator、工作台 surface、Windows NSIS、真实模型对话、Office 自动化及安装/升级/卸载矩阵仍需完成，不得对外表述为已发布能力。

## 架构纪律

1. codex 内核保持原装黑盒，不分叉 agent 循环。
2. App 是唯一配置写入者，只写应用数据目录内的专属 `CODEX_HOME`。
3. 协议翻译只在模型网关进程中完成。
4. 工作台声明依赖、权限、来源、License、安装、验证和卸载，不依赖作者电脑的偶然状态。
5. 两种 surface 共享同一 codex thread、事件、审批、恢复和 Gateway 合同，不形成运行时分叉。
6. 当前完成度只以代码和对应 `verification.md` 为准。

仓库协作规则见 [AGENTS.md](AGENTS.md)，License 边界见 [CONTRIBUTING.md](CONTRIBUTING.md)。
