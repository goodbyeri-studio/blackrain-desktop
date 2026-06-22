# 贡献与协作流程

> 4 人小团队，采用 **GitHub Flow**：一条主线 `main` + 短命功能分支。
> 目标：简洁、标准、够用，不引入 Git Flow 那套 develop/release/hotfix 的重型仪式。

## 核心规则（记住这 5 条就够）

1. **`main` 永远可用**：随时能 build、能跑。绝不直接 push 到 `main`，一切走 PR。
2. **任何工作都从 `main` 切分支**：`git switch -c <type>/<短描述>`。
3. **尽早开 PR**：哪怕还没写完，开 Draft PR 让大家看得见在做什么。
4. **合并需 1 人 Review 通过 + CI 绿**：小团队 1 个 approve 足够，不搞多层审批。
5. **用 Squash 合并**：一个 PR 在 `main` 上压成一条干净提交，历史清爽。合并后删分支。

## 分支命名

```
<type>/<短横线描述>
```

| type | 用途 | 例 |
|---|---|---|
| `feat` | 新功能 | `feat/providers-panel` |
| `fix` | 修 bug | `fix/sse-event-ordering` |
| `docs` | 只改文档 | `docs/update-roadmap` |
| `refactor` | 重构（不改行为） | `refactor/gateway-split` |
| `chore` | 杂务（依赖、脚本、配置） | `chore/bump-tauri` |
| `test` | 加/改测试 | `test/protocol-probes` |

## 提交信息（Conventional Commits，轻量版）

```
<type>: <一句话，动词开头>

（可选）补充说明：为什么这么改、影响范围
```

例：`feat: 新增 DeepSeek provider 配置面板`。type 同上表。好处：信息一致、将来可自动生成 changelog。不强求每条都完美，但 type 前缀要有。

## 日常流程（一次完整循环）

```bash
git switch main && git pull              # 1. 同步最新 main
git switch -c feat/my-thing              # 2. 切功能分支
# ... 写代码 ...
git add -p && git commit -m "feat: ..."  # 3. 小步提交
git push -u origin feat/my-thing         # 4. 推分支
gh pr create                             # 5. 开 PR（或网页开）
# 6. 等 1 个 approve + CI 绿 → Squash 合并 → 删分支
```

## PR 约定

- **小而专一**：一个 PR 只做一件事。大改拆成多个 PR，好 Review。
- **标题用 Conventional 格式**：`feat: xxx`（Squash 合并后它就是 main 上的提交信息）。
- **填 PR 模板**：改了什么、怎么测的、有无风险。
- **自测过再请人看**：本地 build/跑过，别让 Review 帮你抓低级错误。

## 本项目特有约定

- **`apps/desktop/` 是 subtree（来自 CodexMonitor）**：日常改它就是普通 commit，无需特殊操作。但**同步上游**（`git subtree pull`）是维护者动作，别随手做，约定一人负责。详见 [docs/08](docs/08-仓库结构与上游策略.md)。
- **`codex-upstream/` 内核不入库**：本地克隆、黑盒子进程，已在 `.gitignore`。
- **密钥绝不入库**：API key 等放 `.scratch/`（已双重忽略）或本地环境变量，永不写进会提交的文件。
- **`.scratch/` 是个人草稿区**：实验脚本、临时产物放这里，不入库、不评审。

## 不做什么（避免过度工程）

- ❌ 不设 `develop`/`release`/`hotfix` 分支——GitHub Flow 不需要。
- ❌ 不搞多层审批、CODEOWNERS 强绑——4 人团队靠默契 + 1 approve。
- ❌ 不要长命分支——分支活得越久冲突越多，几天内合掉。
