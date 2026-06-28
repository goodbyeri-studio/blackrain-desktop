# 参考项目登记

本项目参考/依赖一些开源项目。约定:**这些源码只读、供随时翻阅,不 commit 进本仓库**(已在 `.gitignore` 排除)。与其把几万行代码搅进我们的 git 历史,不如在此登记「怎么拿到 + 锁定哪个版本」,任何人都能一条命令重建。

一键拉取:`sh scripts/fetch-references.sh`

## 上游克隆(fetch 脚本拉取,只读黑盒,不入库)

两个引擎都当黑盒:只下载、只调用、不改循环、白嫖上游。一键 `sh scripts/fetch-references.sh` 重建,靠锁定版本保证全员一致。

| 项目 | 用途 | 许可证 | 本地路径 | 锁定版本 |
|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | **CODE 引擎**(强编码);参考其 `codex-rs` 的 skills / AGENTS.md / app-server-protocol / 沙箱 | Apache-2.0 | `codex-upstream/` | `bdd282f`(2026-06-27;原钉 `51b3cd5`,06-28 跟进) |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | **WORK 引擎**(通用/记忆/skills,见 [.specs/003](../.specs/003-dual-engine-architecture/));经 `/v1` 接缝当黑盒纳管;另可借其 Desktop 的 MIT React 组件 | MIT | `hermes-upstream/` | **HEAD(spike 探路,待钉死)** |

> ⚠️ codex Apache-2.0 义务:Fork 时保留 `LICENSE`/`NOTICE`、声明修改、不得用 OpenAI 商标背书。详见 [docs/07](07-护城河与风险.md)。
> ⚠️ Hermes MIT:可闭源商用,但**真闸口在 Python 依赖树**(发行前逐包体检拦 GPL/AGPL/BSL/无协议);**钉 commit 存证**(MIT 对快照不可撤销,防未来转 BSL);不用其商标;关数据飞轮外传。发行配方见 [.specs/003 design](../.specs/003-dual-engine-architecture/design.md)。

## 按需参考(勿整包入库,要看再临时克隆)

| 项目 | 看它什么 | 许可证 |
|---|---|---|
| [coze-dev/coze-studio](https://github.com/coze-dev/coze-studio) | 工作流/插件/Bot 的存储与编排机制(竞品对照) | 见仓库 |
| [langgenius/dify](https://github.com/langgenius/dify) | LLMOps、Agent+RAG+工作流一体的产品形态 | 见仓库 |

这些不预先克隆。只在确实要深挖某个具体机制时临时 clone 到仓库外或 gitignore 目录,读完即可。

## 待定

- **本项目自身的开源许可证**尚未选定(开源内核部分)。这是开源内核 + 企业版(open-core)模式下的关键决策,需结合商业策略定,暂留空。
