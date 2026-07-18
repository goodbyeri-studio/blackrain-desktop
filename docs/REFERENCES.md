# 参考项目登记

BlackRain 参考/依赖一些开源项目。约定:**这些源码只读、供随时翻阅和构建,不 commit 进本仓库**(已在 `.gitignore` 排除)。本文登记目标锁定值与风险；可复制命令统一见 [commands](commands.md)。

MVP 仅发行 Windows。`scripts/fetch-references.sh` 是 POSIX shell 脚本；纯 PowerShell 环境需要可用的 `sh`（例如 Git for Windows 自带 Git Bash），否则按 [commands](commands.md) 的 Windows 手动步骤执行。

## 上游克隆(fetch 脚本拉取,只读黑盒,不入库)

两个引擎都当黑盒:只下载、只调用、不改循环。目标是靠显式 checkout 的锁定版本保证全员一致，而不是跟随默认分支 HEAD。

| 项目 | 用途 | 许可证 | 本地路径 | **目标锁定版本** |
|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | **CODE 引擎**(强编码);参考其 `codex-rs` 的 skills / AGENTS.md / app-server-protocol / 沙箱 | Apache-2.0 | `codex-upstream/` | `87db9bc` / **rust-v0.144.5**(2026-07-15；相对 `44918ea` / 0.144.1 前进 53 commits，同为 0.144 patch 线；`app-server-protocol` 无变化、features/浏览器相关文件无变化，纯 bug fix + Windows 沙箱与 `is_dangerous_command` 修复；LICENSE/NOTICE 无变化。⚠️ 仅源码 re-pin，未构建、未做 Windows 验收) |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | **WORK 引擎**(通用/记忆/skills,见 [.specs/003](../.specs/003-dual-engine-architecture/));经 `/v1` 接缝当黑盒纳管;另可借其 Desktop 的 MIT React 组件 | MIT | `hermes-upstream/` | `9de9c25` / **v2026.7.7.2**(v0.18.2, 2026-07-07；保留 `/v1/chat/completions`、Responses 与 runs/SSE，并加入 model routes 等增强) |

> ⚠️ codex Apache-2.0 义务:分发派生制品或未来触发最小 fork 时保留 `LICENSE`/`NOTICE`、声明修改、不得用 OpenAI 商标背书。详见 [docs/07](07-护城河与风险.md)。
> ⚠️ Hermes MIT:可闭源商用,但**真闸口在 Python 依赖树**(发行前逐包体检拦 GPL/AGPL/BSL/无协议);**钉 commit 存证**(MIT 对快照不可撤销,防未来转 BSL);不用其商标;关数据飞轮外传。发行配方见 [.specs/003 design](../.specs/003-dual-engine-architecture/design.md)。

## 当前拉取脚本的锁版本行为

截至 2026-07-12，`scripts/fetch-references.sh` 已工程化强制上述稳定版本：

- 对两个仓库分别 fetch 精确稳定 tag，校验 tag 解引用后的完整 SHA。
- 校验通过后使用 detached HEAD checkout，不移动或删除开发者已有本地分支。
- 已跟踪文件存在改动时拒绝切换，避免覆盖本地检查工作。
- tag 指向与仓库存证 SHA 不一致时立即失败，防止供应链标签漂移。

因此：

1. `fetch-references.sh` 成功后，`codex-upstream` 应为 `87db9bc18ba5bc82c1cb4e4381b44f693ee35623`，`hermes-upstream` 应为 `9de9c25f620ff7f1ce0fd5457d596052d5159596`。
2. 脚本锁定只证明源码版本可复现，不代表二进制已经构建，也不代表 Windows 产品验证通过。
3. 本地 gitignored 克隆的构建产物和测试环境仍是开发者机器状态，不得写成仓库或发布完成度。
4. 升级 tag/commit 时必须同步本文、根规则、对应 spec 决策与验证记录。

## 按需参考(勿整包入库,要看再临时克隆)

| 项目 | 看它什么 | 许可证 |
|---|---|---|
| [coze-dev/coze-studio](https://github.com/coze-dev/coze-studio) | 工作流/插件/Bot 的存储与编排机制(竞品对照) | 见仓库 |
| [langgenius/dify](https://github.com/langgenius/dify) | LLMOps、Agent+RAG+工作流一体的产品形态 | 见仓库 |

这些不预先克隆。只在确实要深挖某个具体机制时临时 clone 到仓库外或 gitignore 目录,读完即可。

## 待定

- **本项目自身或部分组件的对外许可证**尚未选定。这是“闭源商业 B2B”与可能的 open-core 形态之间的关键待决；定案前按 [CONTRIBUTING](../CONTRIBUTING.md) 的更严格闭源第三方代码纪律执行。
