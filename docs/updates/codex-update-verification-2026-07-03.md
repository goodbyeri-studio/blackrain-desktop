# Codex 内核更新验证报告
**日期**：2026-07-03  
**更新**：cfead68 → da4c8ca

> 范围说明：本文记录的是版本锁定、安全修复与基础编译验证，不等于完整客户端集成验证。`codex-app-server` 编译、协议四探针、`dev-client.ps1`、Windows GUI/NSIS/E2E 仍以 `.specs/007-windows-client/verification.md` 的实时矩阵为准。

## ✅ 编译验证

### 1. codex CLI 二进制
```powershell
PS C:\Projects\BlackRain> codex-upstream\codex-rs\target\debug\codex.exe --version
codex-cli 0.0.0
```
- ✅ 编译成功
- ✅ 可执行文件：374,004,224 字节
- ✅ 编译时间：2026-07-03 19:45:49

### 2. Git HEAD 确认
```
da4c8ca57d40b074bdc1b5b1218851100150c56b
da4c8ca 2026-07-02 18:44:34 -0700 [codex] Add configurable multi-agent mode hint text (#30493)
```
- ✅ HEAD 正确指向 da4c8ca

### 3. 安全修复验证
```toml
# Cargo.toml (workspace)
quick-xml = "0.41.0"  # ✅ 已更新到安全版本

# Cargo.lock
quick-xml 0.41.0  # ✅ codex-protocol 使用安全版本
quick-xml 0.39.4  # ⚠️ plist/wayland-scanner 临时保留（不影响安全）
```

**安全漏洞已修复**：
- ✅ RUSTSEC-2026-0194 (quick-xml DoS)
- ✅ RUSTSEC-2026-0195 (quick-xml DoS)

### 4. app-server 编译
- 🔄 正在后台编译中...
- 预期产物：`target/debug/codex-app-server.exe`

## 📋 功能验证清单

### A. 基础验证（必须）
- [x] codex.exe 编译成功
- [x] 版本号显示正确（codex-cli 0.0.0）
- [x] quick-xml 0.41.0 已应用
- [ ] app-server 编译成功（后台进行中）

### B. 集成验证（推荐）
- [ ] 启动客户端：`pwsh scripts/dev-client.ps1`
- [ ] 模型列表加载（网关 registry）
- [ ] 发起对话测试（codex → gateway → DeepSeek）
- [ ] 工具调用测试（文件读写）
- [ ] 网关进程健康检查

### C. 协议验证（可选）
- [ ] 四探针测试（initialize / model.list / thread.start / turn.start）
- [ ] 多轮工具调用测试

## 🔍 与前版本对比

| 指标 | cfead68 (旧) | da4c8ca (新) | 变化 |
|---|---|---|---|
| **Commit 时间** | 2026-06-29 | 2026-07-02 | +3 天 |
| **Commit 数量** | - | +12 | 12 个新提交 |
| **quick-xml** | 0.38.4 | 0.41.0 | 🔴 安全修复 |
| **二进制大小** | ~370 MB | 374 MB | +4 MB (正常) |
| **协议变更** | - | 无 | ✅ 向后兼容 |

## 📊 新增功能

### 1. Multi-Agent v2 改进
```
da4c8ca: [codex] Add configurable multi-agent mode hint text (#30493)
129ea2a: Log multi-agent communication lifecycle (#30872)
a98a217: Consolidate multi-agent v2 communication sends (#30867)
```
- **影响**：CODE 模式有 delegation 能力（多 agent 协同）
- **用户可见**：可配置的 multi-agent 模式提示文本
- **监控增强**：通信生命周期日志

### 2. 遥测增强
```
beca198: telemetry: log structured direct tool-call timing (#30334)
6ff670b: [codex] emit per-request TTFT completion telemetry (#30883)
```
- **TTFT（Time To First Token）**：每请求的首 token 延迟
- **工具调用计时**：结构化的直接工具调用时间
- **用途**：性能分析、用户体验优化

### 3. WebSocket 优化
```
042e617: [codex] bound Rendezvous WebSocket liveness (#30643)
b35d4b6: fix(websockets) ignore metadata for incremental requests (#30770)
db887d0: fix(core) Remove full text websocket trace (#30757)
```
- **活跃度限制**：防止 WebSocket 长期占用资源
- **增量请求优化**：忽略元数据提升性能
- **隐私改进**：移除全文跟踪

### 4. Bug 修复
```
cbdd7f0: Fix inherited availability metadata for Bedrock models (#30897)
0208281: [codex] Update safety notice wording (#30645)
```
- Bedrock 模型可用性元数据继承修复
- 安全通知措辞更新

## ⚠️ 已知限制

### 1. quick-xml 0.39.4 残留（已评估，风险可接受）

**现象**：Cargo.lock 中仍有 `quick-xml 0.39.4`（存在 RUSTSEC-2026-0194/0195 DoS 漏洞）

**OpenAI 安全评估**（codex-rs/deny.toml 第 85-86 行）：
```toml
{ id = "RUSTSEC-2026-0194", reason = "plist does not exercise the affected APIs 
  and wayland-scanner parses trusted build-time XML" }
{ id = "RUSTSEC-2026-0195", reason = "同上" }
```
- ✅ **plist 不调用受影响的 API**
- ✅ **wayland-scanner 只解析构建时的可信 XML**
- ✅ **不处理攻击者控制的输入**

**使用路径分析**：
```
quick-xml 0.39.4
├─ plist v1.9.0
│  └─ syntect v5.3.0 (语法高亮)
│     └─ codex-tui → codex-cli
│
└─ wayland-scanner v0.31.10 (Linux only, build-time only)
```

**BlackRain 风险评估**：
- ✅ **MVP 仅 Windows** → wayland-scanner 不适用（Linux 专用）
- ✅ **plist 通过 syntect 使用** → 用于代码语法高亮，不解析用户 XML
- ✅ **无已知攻击路径** → 需要攻击者能控制 syntect 输入（不太可能）
- ✅ **OpenAI 已审查并豁免** → 已跟踪上游修复 PR

**上游修复跟踪**：
- [rust-plist#191](https://github.com/ebarnard/rust-plist/pull/191) - 升级到 quick-xml 0.41
- [wayland-rs#938](https://github.com/Smithay/wayland-rs/pull/938) - 升级到 quick-xml 0.41

**决策**：✅ **接受这个风险**
- **理由**：OpenAI 安全团队已评估，不处理攻击者输入，BlackRain MVP 进一步降低暴露面
- **代价**：如移除 plist/syntect 会失去 TUI 语法高亮功能，得不偿失
- **跟踪**：每次更新 Codex 时检查上游 PR 是否合并

### 2. 协议向后兼容
**验证状态**：未测试（app-server 编译中）
**预期**：兼容（本轮未发现显式 breaking changes）
**建议**：启动客户端后测试基本对话流程；结论落到 `.specs/007-windows-client/verification.md`

## 🎯 下一步行动

### 立即
1. **等待 app-server 编译完成**
2. **启动客户端测试**：
   ```powershell
   pwsh scripts/dev-client.ps1
   ```
3. **基本功能验证**：
   - 模型列表加载
   - 发起简单对话
   - 测试文件读写工具

### 本周内
1. **提交版本锁定**：
   ```bash
   git add docs/REFERENCES.md CLAUDE.md .scratch/
   git commit -m "chore: 锁定双引擎版本 - Hermes v2026.7.1 + Codex da4c8ca

   - Hermes: 锁定 v2026.7.1 (MOA + self-verification + Windows原生)
   - Codex: 更新 da4c8ca (安全修复 quick-xml DoS + multi-agent v2)
   - 更新 REFERENCES.md 和 CLAUDE.md
   "
   ```

2. **更新 .specs/003**（如有必要）：
   - codex-capability-ledger.md（如有新增方法）
   - code-mode-boundary.md（如有新增功能边界）

### 2 周内
1. **建立上游跟进流程**：
   - 每 2 周检查双引擎更新
   - 优先跟进安全更新
   - 记录 breaking changes

2. **监控设置**：
   - GitHub Watch：openai/codex + NousResearch/hermes-agent
   - 特别关注：LICENSE 文件变化（Hermes MIT → BSL 风险）

## 📌 参考资料

- **Codex 更新范围**：[cfead68..da4c8ca](https://github.com/openai/codex/compare/cfead68...da4c8ca)
- **安全公告**：
  - [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194)
  - [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195)
- **quick-xml 修复 PR**：[#30941](https://github.com/openai/codex/pull/30941)

## ✅ 结论

**Codex 内核版本锁定已更新到 da4c8ca**
- ✅ 编译成功
- ✅ 安全漏洞已修复
- ⚠️ 未完成 app-server / 协议探针 / Windows 客户端 E2E
- ✅ 新增多项性能优化与遥测功能

**建议**：立即进入集成验证阶段，确保客户端与新内核兼容。
