# Codex 上游更新检查清单

> 当前锁：`e363b08c9175ac1cbe5893615dd2cb9ddf95043b` / `rust-v0.146.0`。源码 tag、官方 package 和产品验收是三类独立证据。

## 更新前

- [ ] 使用干净短命分支，记录当前锁、Windows build 和回退点。
- [ ] 阅读目标 tag changelog、app-server protocol/config/schema/helper 和 License 变化。
- [ ] 确认不会引入第二 agent runtime 或修改上游 agent loop。

## 同步与供应链

```powershell
sh scripts/fetch-references.sh
git -C codex-upstream rev-parse HEAD
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\vendor-electron-codex-runtime.ps1 -Force
```

- [ ] 更新 `docs/REFERENCES.md`、runtime lock、archive/required-file SHA-256、License/NOTICE 与 Authenticode identity。
- [ ] 验证 canonical `codex-package.json` 的 version/target/entrypoint。

## 协议与 Desktop

- [ ] 重跑 bundled app-server initialize/thread/退出 probe。
- [ ] 重跑标准 stdio Browser MCP ready/tool discovery/call/可信 metadata。
- [ ] 验证标准 Codex Home 与 CLI 的 config/auth/session/rollout/SQLite 恢复兼容性。
- [ ] 检查 model/config/skills/apps、thread/turn/approval/elicitation/review/fork/compact/rollback 方法变化。
- [ ] 运行 typecheck/test/lint/Native Clean/runtime gates/package/smoke/E2E/maker。
- [ ] 在正式签名候选上运行受影响的登录、审批、Browser、安装/升级/回滚/卸载矩阵。

## 记录

将精确命令、commit、环境、制品 SHA-256、签名结果和失败边界写入 `.specs/002-electron-migration/verification.md`。公共 Browser 合同变化同时更新 `003`；未运行项目不得写成通过。
