# 上游参考与锁定版本

| 项目 | 用途 | License | 本地位置 | 锁定版本 |
|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | CODE 引擎黑盒与 app-server 协议参考 | Apache-2.0 | `codex-upstream/` | `e363b08c9175ac1cbe5893615dd2cb9ddf95043b` / `rust-v0.146.0`（源码、官方 Windows package、Authenticode、packaged smoke 与 initialize/dynamicTools 探针已验证；真实模型和产品验收未完成） |
| [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) | Desktop 壳上游 | MIT | `apps/desktop/` subtree | 以 subtree 提交记录为准 |
| [ValueCell-ai/ClawX](https://github.com/ValueCell-ai/ClawX) | webview policy、崩溃恢复、Electron 打包次级参考 | MIT | 临时只读研究克隆，不进入产品依赖 | `960f6b298d1bafce74bf1b181b4534256df3e114` |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | sidecar 生命周期、Windows 子进程与更新恢复次级参考 | MIT | 临时只读研究克隆，不进入产品依赖 | `339d968689a3b91c5f537d7198ff28abde32ab3b` |
| OfficeCLI | Office 文件工具依赖 | 见插件 NOTICE | `plugins/office-cli/` 与打包资源 | `1.0.117` |

## Codex App 本机研究快照

2026-07-26 至 2026-07-29 的 Electron/Browser 架构决策参考以下本机只读研究稿。哈希用于固定本次实际读取的输入版本；研究稿不作为仓库运行依赖。

| 研究稿 | SHA-256 |
|---|---|
| `codex-app-browser-security-architecture.md` | `8AA84E3AA931DE67DF4BD5B525E2BBDE0FE31BB9C84D847854E99F990282F4DD` |
| `codex-app-implementation-architecture.md` | `9D54D7D8BF6B2BB25B7B63894706B3587B8E4462FA3AFD3D7D313EB8AACF7E90` |
| `codex-iab-live-implementation-study.md` | `9F2DB1169F67E685E0169F37962504E4E43DB21E99F55B6C4139487E3FEAA2CC` |
| `codex-app-architecture-research.md` | `AA9AFD5DC2F61FF36B8956F9C8BCA68C36CA40311EE8747A091057965A67BEB1` |
| `codex-in-app-browser-architecture-research.md` | `68FED022CEE9024026295BEA5A520E3AF21DFECCF06608293B7B4B8BF6D39825` |

观察版本为 Codex Electron `26.721.41059`、Electron `42.3.0`、Chromium `150.0.7871.128`。这些材料用于提取合法可观察的产品行为、进程边界和安全事实，不进入仓库、不授权复制私有 bundle/client/资源，也不能替代每次锁定版本的协议探针和 Windows E2E。

## Electron 官方约束

- [Web Embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)：`<webview>` 的稳定性警告和替代方案。
- [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)：main-owned 页面 view、WebContents 和生命周期 API。
- [Security](https://www.electronjs.org/docs/latest/tutorial/security)：sandbox、context isolation、navigation、IPC sender 和权限安全清单。
- [Session](https://www.electronjs.org/docs/latest/api/session)：partition、permission handler、download 和 session 生命周期。

Codex 当前可观察实现使用 renderer `<webview>` + main attach；BlackRain 有意保留 main-owned `WebContentsView` 差异，并实现已验证的 per-session backend、session/turn binding、单一持久 profile、注入式 selector/ARIA、CDP/OOPIF、tab finalization、隐藏 capture 和页面工作集合同。spec 013 要求额外验证 native view 的 bounds、z-order、modal 遮挡、DPI、多屏、焦点、迁移和标准 Electron 恢复降级。

## 规则

1. `scripts/fetch-references.sh` 只同步并校验 codex 的稳定 tag 与完整 SHA。
2. `codex-upstream/` 只读、gitignored，不进入产品仓库。
3. 升级前记录旧锁、目标锁、协议变化、License 和 Windows 构建结果。
4. 上游源码检查不能替代 Windows Electron、真实模型、in-app browser 和安装/升级/卸载验证；迁移完成前的 Tauri 结果只作为迁移输入。
5. 引用第三方代码时必须确认许可证并保留 NOTICE/署名。
6. Codex App 是 Browser 功能和控制面第一参考；ClawX、Hermes 等仅作工程实现补充，不改变共享 IAB、唯一 agent 内核和单一 Browser backend 决策。

## Windows Runtime 锁

Electron 使用上游 canonical `codex-package-x86_64-pc-windows-msvc.tar.gz`，不再从单个本机 `codex.exe` 拼装发布资源。精确 release URL、archive SHA-256、源码 commit、License/NOTICE 摘要、必需文件逐项 SHA-256 和 OpenAI 签名身份由 `apps/desktop/resources/codex/runtime-lock.json` 锁定。

生成的 runtime 位于 `apps/desktop/resources/codex/windows-x64/` 并保持 gitignored。`scripts/vendor-electron-codex-runtime.ps1` 必须按 tracked lock 验证 archive SHA-256、`codex-package.json`、完整文件集和 Codex 自有可执行文件的 Authenticode，再生成逐文件审计用 `runtime-manifest.json`；正式 make 通过 `npm run electron:make:release` 重新按 lock 校验实际文件并 fail closed。
