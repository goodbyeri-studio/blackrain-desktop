# 上游参考与锁定版本

| 项目 | 用途 | License | 本地位置 | 锁定版本 |
|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | CODE 引擎黑盒与 app-server 协议参考 | Apache-2.0 | `codex-upstream/` | `87db9bc18ba5bc82c1cb4e4381b44f693ee35623` / `rust-v0.144.5`（仅源码锁定；Windows 构建与产品验收未完成） |
| [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) | Desktop 壳上游 | MIT | `apps/desktop/` subtree | 以 subtree 提交记录为准 |
| OfficeCLI | Office 文件工具依赖 | 见插件 NOTICE | `plugins/office-cli/` 与打包资源 | `1.0.117` |

## 规则

1. `scripts/fetch-references.sh` 只同步并校验 codex 的稳定 tag 与完整 SHA。
2. `codex-upstream/` 只读、gitignored，不进入产品仓库。
3. 升级前记录旧锁、目标锁、协议变化、License 和 Windows 构建结果。
4. 上游源码检查不能替代 Windows Tauri、真实模型、NSIS 和安装/卸载验证。
5. 引用第三方代码时必须确认许可证并保留 NOTICE/署名。
