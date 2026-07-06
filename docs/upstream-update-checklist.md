# 上游引擎更新检查清单

**频率**：每 2 周  
**最后检查**：2026-07-03

---

## 快速检查

### 1. Hermes 更新检查
```bash
cd hermes-upstream
git fetch origin
git log HEAD..origin/main --oneline --max-count=10

# 查看最新 tag
git tag -l "v2026.*" --sort=-version:refname | head -5

# 当前锁定版本
git rev-parse HEAD  # 应为 7c1a029 (v2026.7.1)
```

**检查重点**：
- [ ] 有新版本发布？查看 release notes
- [ ] LICENSE 文件变化？（MIT → BSL 风险）
- [ ] 有 breaking changes？
- [ ] 有安全修复？（优先跟进）

### 2. Codex 更新检查
```bash
cd codex-upstream
git fetch origin
git log HEAD..origin/main --oneline --max-count=10

# 当前锁定版本
git rev-parse HEAD  # 应为 da4c8ca (2026-07-02)
```

**检查重点**：
- [ ] 有安全修复？（RUSTSEC-* 优先）
- [ ] 有 breaking changes？（搜索 "breaking" "BREAKING"）
- [ ] multi-agent / app-server 协议变更？
- [ ] **quick-xml 0.39.4 上游修复状态**（见下）

### 3. Quick-XML 0.39.4 专项检查
```bash
cd codex-upstream/codex-rs

# 检查 0.39.4 是否仍存在
grep "quick-xml.*0.39" Cargo.lock

# 检查上游 PR 状态（手动访问）
# https://github.com/ebarnard/rust-plist/pull/191
# https://github.com/Smithay/wayland-rs/pull/938
```

**为什么 0.39.4 残留可接受**（2026-07-03 评估，原 `docs/updates/` 验证报告已并入此处）：quick-xml 0.39.4 仅经两条路径引入——`plist`（经 syntect 做 TUI 语法高亮，不解析用户可控 XML）与 `wayland-scanner`（仅 Linux、仅构建期、解析可信 XML），均不处理攻击者输入；OpenAI 已在 codex-rs `deny.toml` 对 RUSTSEC-2026-0194/0195 豁免并注明理由；BlackRain MVP 仅 Windows，wayland 路径根本不参与。接受该风险，每次更新 Codex 时按下方步骤复查上游修复。

**如果两个 PR 都已合并**：
```bash
# 更新依赖
cargo update -p plist -p wayland-scanner

# 验证消失
grep "quick-xml.*0.39" Cargo.lock  # 应无输出

# 编辑 deny.toml，删除 RUSTSEC-2026-0194/0195
# 重新编译
cargo build -p codex-cli --bin codex
```

---

## 详细更新流程

### A. 发现安全更新（P0 优先）
```bash
# 1. Checkout 新版本
git checkout <new-commit-or-tag>

# 2. 编译内核
cd codex-upstream/codex-rs
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"  # Windows
cargo build -p codex-cli --bin codex

# 3. 验证版本
target/debug/codex.exe --version

# 4. 测试客户端
cd ../../..
pwsh scripts/dev-client.ps1
```

### B. 发现功能更新（P1/P2）
```bash
# 1. 评估变更
git log <old-commit>..<new-commit> --oneline
git diff <old-commit>..<new-commit> -- codex-rs/app-server-protocol/

# 2. 决策：是否跟进
# - 变更量小 + 有价值 → 跟进
# - 变更量大 / 风险高 → 延后

# 3. 如果跟进，执行上面的编译+测试
```

### C. 更新文档
```bash
# 更新锁定版本
# - docs/REFERENCES.md
# - CLAUDE.md

# 创建验证记录
# - .scratch/<date>-update-verification.md

# 提交
git add docs/REFERENCES.md CLAUDE.md .scratch/
git commit -m "chore: 更新 <engine> 到 <version>

- 关键变更：<summary>
- 安全修复：<RUSTSEC-* if any>
- 验证：<基本功能测试通过>
"
```

---

## 风险评估矩阵

| 变更类型 | 优先级 | 跟进时机 | 风险评估 |
|---|---|---|---|
| **安全修复（RUSTSEC）** | 🔴 P0 | 立即 | 必须跟进 |
| Breaking changes | 🟡 P1 | 评估后决定 | 需要测试协议兼容性 |
| 功能增强（小变更）| 🟢 P2 | 下次例行 | 低风险，可选 |
| 文档/测试更新 | ⚪ P3 | 可选 | 无风险 |

---

## GitHub Watch 设置

### Hermes
```
仓库：NousResearch/hermes-agent
Watch：Custom → Releases + Security alerts
```

### Codex
```
仓库：openai/codex
Watch：Custom → Releases + Security alerts
```

---

## 历史更新记录

| 日期 | 引擎 | 版本 | 原因 | 验证 |
|---|---|---|---|---|
| 2026-07-03 | Hermes | v2026.7.1 | 锁定生产版本（MOA + self-verification） | ✅ |
| 2026-07-03 | Codex | da4c8ca | 安全修复 quick-xml DoS | ✅ |
| 2026-06-30 | Codex | cfead68 | 跟进上游（协议四探针全绿） | ✅ |

---

## 联系人 / 资源

- **BlackRain 项目文档**：`docs/REFERENCES.md`
- **双引擎架构**：`.specs/003-dual-engine-architecture/`
- **验证记录**：`.scratch/*-update-*.md`
- **上游问题跟踪**：
  - Hermes Issues: https://github.com/NousResearch/hermes-agent/issues
  - Codex Issues: https://github.com/openai/codex/issues
