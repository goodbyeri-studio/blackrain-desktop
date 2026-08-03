# codex 上游更新检查清单

> 当前目标锁：`e363b08c9175ac1cbe5893615dd2cb9ddf95043b` / `rust-v0.146.0`。源码和官方 release package 锁定不等于 Windows runtime 或产品验收。

> **宿主状态（2026-08-03）**：当前完整产品仍是 Tauri；Electron 全量迁移是唯一当前 P0。下方旧 Tauri 命令和证据在迁移完成前仅作为基线，当前宿主与 Browser 回归统一写入 `002-electron-migration`。

## 更新前

- [ ] 工作树干净，当前功能分支可回退。
- [ ] 记录 `codex-upstream` 的完整 HEAD、remote URL 和 shallow 状态。
- [ ] 阅读目标 tag 的 changelog、协议变化和 License。
- [ ] 检查 app-server 方法、通知、配置 schema 和 Responses 行为变化。

## 同步

```powershell
pwsh -NoProfile -Command "sh scripts/fetch-references.sh"
git -C codex-upstream rev-parse HEAD
```

脚本会校验 tag 对应完整 SHA 并 detached checkout。若目录存在未提交改动，脚本必须停止。

## 代码与合同

- [ ] 更新 `docs/REFERENCES.md` 和脚本中的 tag/SHA。
- [ ] 重跑 `002-electron-migration` 依赖的 app-server/Browser 工具协议探针。
- [ ] 检查标准 Codex Home schema、config/auth/session/rollout/SQLite，并验证 App 与 CLI 的共享和恢复兼容性。
- [ ] 检查 Gateway 的 Responses、流式、工具调用和错误映射。
- [ ] 检查 Electron main App Server client 与目标 app-server 协议、启动参数和 helper 制品是否仍一致。
- [ ] 审计新增依赖和许可证。

## Windows 验证

- [ ] 编译 codex Windows x64 制品。
- [x] 运行 `scripts/vendor-electron-codex-runtime.ps1`，验证官方 archive SHA-256、canonical package 文件集、License/NOTICE 和 Authenticode。
- [ ] 运行当前 Tauri 本地启动与真实模型对话（迁移基线）。
- [ ] 运行 Electron 本地启动、真实模型对话和 Browser 纵向切片（目标闸口）。
- [ ] 验证停止、审批、恢复、附件和工具调用。
- [ ] 构建并解包 Electron Windows 制品（打包方案待 012 决策）。
- [ ] 执行安装、升级、卸载和残留检查。
- [ ] 将真实结果写入 `002-electron-migration/verification.md`。

## 结果记录

每次升级只记录当前采用的锁和当前验证结果。未采用的候选版本、废弃方案和过期结论不留在当前真源正文。
