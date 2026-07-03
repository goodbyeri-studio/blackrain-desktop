# 双引擎版本更新记录（2026-07-03）

## 更新总结

### Hermes Agent
- **旧版本**：HEAD (spike 探路，未锁定)
- **新版本**：v2026.7.1 (7c1a029, 2026-07-01)
- **主要特性**：
  - ✅ Mixture-of-Agents (MOA) 成一等公民
  - ✅ Agent self-verification（内置自验证）
  - ✅ /learn + /journey 记忆图谱
  - ✅ Scale-to-zero gateway（按需启动）
  - ✅ Windows 原生支持完善（PowerShell 安装、MinGit 捆绑）
  - ✅ Google Vertex AI 支持

### Codex
- **旧版本**：cfead68 (2026-06-29)
- **新版本**：da4c8ca (2026-07-02)
- **关键变更**：
  - 🔴 **安全修复**：quick-xml DoS 漏洞（RUSTSEC-2026-0194/0195）
  - ✅ Multi-agent v2 通信合并与改进
  - ✅ TTFT（Time To First Token）遥测
  - ✅ WebSocket 性能优化
  - ✅ Bedrock 模型元数据修复

## 验证清单

### 1. Codex 内核编译验证
```powershell
# 检查编译状态
Get-Process -Name cargo -ErrorAction SilentlyContinue

# 编译完成后验证
C:\Projects\BlackRain\codex-upstream\codex-rs\target\debug\codex.exe --version

# 编译 app-server（协议探针需要）
cd C:\Projects\BlackRain\codex-upstream\codex-rs
cargo build -p codex-app-server
```

### 2. 协议兼容性验证（可选）
```bash
# 四探针测试（initialize / model.list / thread.start / turn.start）
BIN="$PWD/codex-upstream/codex-rs/target/debug/codex-app-server"
python3 .scratch/m0_protocol_probe.py "$BIN" <CODEX_HOME> <workspace>

# 多轮工具调用测试
python3 .scratch/m0_tool_driver.py "$BIN" <CODEX_HOME> <workspace>
```

### 3. 客户端集成测试
```powershell
# 启动完整客户端（加载 .env → 内核 → 网关 → tauri dev）
pwsh scripts/dev-client.ps1

# 测试项：
# - [ ] 客户端启动成功
# - [ ] 模型列表加载（网关 registry）
# - [ ] 发起对话（codex → gateway → new-api → DeepSeek）
# - [ ] 工具调用（文件读写 / 终端命令）
# - [ ] 网关进程健康（Ctrl-C 能正常停止）
```

### 4. Hermes 环境检查（WORK 引擎）
```bash
# 当前 Hermes 处于 spike 探路阶段，MVP 主线是 CODE 模式
# 此次锁定为未来 WORK 侧集成做准备

# 可选：验证 Hermes 可用性
cd hermes-upstream
python -m pip install -e .
hermes --version  # 应显示 v0.18.0
```

## 潜在问题排查

### 问题 1：codex.exe 找不到
**现象**：`dev-client.ps1` 报错找不到 codex.exe
**原因**：编译未完成或失败
**解决**：
```powershell
cd codex-upstream\codex-rs
cargo build -p codex-cli --bin codex
# 检查输出：target\debug\codex.exe
```

### 问题 2：quick-xml 依赖冲突
**现象**：编译时报 quick-xml 版本冲突
**原因**：Cargo.lock 未同步
**解决**：
```powershell
cd codex-upstream\codex-rs
cargo update -p quick-xml
cargo build -p codex-cli --bin codex
```

### 问题 3：协议探针失败
**现象**：m0_protocol_probe.py 报错 method not found
**原因**：app-server 协议变更（不太可能，这次更新无 breaking）
**解决**：
- 检查 app-server 启动日志
- 对比 da4c8ca 的 app-server-protocol/src/protocol/common.rs
- 回退到 cfead68 验证是否是新版本问题

### 问题 4：网关翻译失败
**现象**：对话时报 responses 协议错误
**原因**：gateway.py 未适配新版本内核输出
**解决**：
- 检查 gateway.py 日志（GW_LOG=/tmp/gateway.log）
- 对比 cfead68 vs da4c8ca 的 responses 协议差异
- 可能需要更新 gateway.py（但这次更新应该兼容）

## 文档已更新

- ✅ `docs/REFERENCES.md`：更新双引擎版本号与 commit
- ✅ `CLAUDE.md`：更新仓库布局表中的版本说明
- ⏳ `.specs/003-dual-engine-architecture/`：待更新能力底账（如有新增能力）

## 后续行动

### 立即（编译完成后）
- [ ] 验证 codex.exe 编译成功
- [ ] 启动客户端测试基本功能
- [ ] 提交版本锁定 commit

### 本周内
- [ ] 评估 Hermes MOA 是否集成到 WORK 侧
- [ ] 提取 Hermes Desktop Skills Hub UI 组件（MIT 可借）
- [ ] 更新 `.specs/003` 能力底账（如有新增）

### 2 周内
- [ ] 建立"每 2 周跟进上游"的例行检查流程
- [ ] 设置 GitHub Watch 监控双引擎仓库
- [ ] 特别关注 Hermes LICENSE 文件变化（MIT → BSL 风险）
- [ ] **检查 quick-xml 0.39.4 上游修复状态**（每次更新 Codex 时）

## Quick-XML 0.39.4 定期检查清单

每次更新 Codex 时执行：

```bash
# 1. 检查 quick-xml 0.39.4 是否仍存在
cd codex-upstream/codex-rs
grep "quick-xml.*0.39" Cargo.lock

# 2. 检查上游 PR 状态
# - rust-plist#191: https://github.com/ebarnard/rust-plist/pull/191
# - wayland-rs#938: https://github.com/Smithay/wayland-rs/pull/938
```

**如果两个 PR 都已合并**：
```bash
# 3. 更新依赖
cargo update -p plist -p wayland-scanner

# 4. 验证 0.39.4 已消失
grep "quick-xml.*0.39" Cargo.lock  # 应该无输出

# 5. 从 deny.toml 移除例外
# 删除 RUSTSEC-2026-0194 和 RUSTSEC-2026-0195 的 ignore 条目

# 6. 重新编译验证
cargo build -p codex-cli --bin codex
```

## 关键决策记录

### 为什么立即更新 Codex？
- **安全漏洞**：quick-xml DoS（RUSTSEC-2026-0194/0195）必须修复
- **变更量小**：仅 3 天 12 个提交，风险可控
- **无破坏性变更**：协议兼容，不影响现有集成

### 为什么锁定 Hermes v2026.7.1？
- **从"spike 探路"升级为"生产版本"**：v2026.7.1 是稳定发布
- **MOA 可用**：多模型协同能力对 WORK 侧有价值
- **Self-verification**：与 BlackRain 护城河 D（验证层）对齐
- **Windows 支持**：与 MVP 仅 Windows 决策匹配

### "白嫖上游日更"策略验证
- ✅ **有效性确认**：3 天内免费获得安全修复
- ⚠️ **风险确认**：不跟进会暴露在已知漏洞下
- 📅 **建议节奏**：每 2 周检查，优先跟进安全更新

## 参考链接

- [Hermes v2026.7.1 Release Notes](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.1)
- [Codex commits: cfead68..da4c8ca](https://github.com/openai/codex/compare/cfead68...da4c8ca)
- [RUSTSEC-2026-0194: quick-xml DoS](https://rustsec.org/advisories/RUSTSEC-2026-0194)
- [RUSTSEC-2026-0195: quick-xml DoS](https://rustsec.org/advisories/RUSTSEC-2026-0195)
